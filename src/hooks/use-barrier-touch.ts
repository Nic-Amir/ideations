'use strict';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useBarrierTouchSound } from '@/hooks/use-barrier-touch-sound';
import {
  type TouchMode,
  type CountBucket,
  type SequencePick,
  type DistancePresetId,
  type TouchPath,
  type TouchSettlement,
  type CountPricing,
  type SequencePricing,
  BARRIER_TOUCH_CONFIG,
  TOUCH_TICK_MS,
  TOUCH_SETTLE_MS,
  SLIDING_WINDOW_SIZE,
  PREVIEW_WINDOW,
  IDLE_TICK_MS,
  getDistancePreset,
  getCountPricing,
  getSequencePricing,
  computeBarriers,
  generateTouchPath,
  settleCount,
  settleSequence,
  bucketOf,
  nextIdleTick,
} from '@/lib/games/barrier-touch';

export type TouchPhase = 'idle' | 'running' | 'settled';

export type TouchPick =
  | { kind: 'count'; bucket: CountBucket }
  | { kind: 'sequence'; pick: SequencePick };

export interface TouchHistoryEntry {
  mode: TouchMode;
  outcome: TouchSettlement['outcome'];
  payout: number;
  stake: number;
  /** Actual crossing bucket of the round (count mode). */
  bucket: CountBucket | null;
  /** Whether any round trip completed (sequence mode). */
  completed: boolean | null;
}

export interface BarrierTouchResult {
  mode: TouchMode;
  outcome: TouchSettlement['outcome'];
  payout: number;
  stake: number;
  netPL: number;
  multiplier: number;
  settleTick: number;
  pick: TouchPick;
  crossingCount: number;
  bucket: CountBucket;
  firstTouch: 'upper' | 'lower' | null;
  completedPick: SequencePick | null;
}

/** Chart-facing progress of the picked sequence during the reveal. */
export type SequenceLegState = 'waitingFirst' | 'waitingSecond' | 'completed' | 'busted';

export function useBarrierTouch() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const sound = useBarrierTouchSound();

  const [mode, setModeState] = useState<TouchMode>('count');
  const [stake, setStake] = useState(100);
  const [ticks, setTicksState] = useState(BARRIER_TOUCH_CONFIG.tickDuration);
  const [distanceId, setDistanceIdState] = useState<DistancePresetId>('standard');
  const [phase, setPhase] = useState<TouchPhase>('idle');
  const [pick, setPick] = useState<TouchPick | null>(null);
  const [path, setPath] = useState<TouchPath | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const [result, setResult] = useState<BarrierTouchResult | null>(null);
  const [history, setHistory] = useState<TouchHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [eventFlash, setEventFlash] = useState(false);
  /** Ambient tick trail shown while idle; last entry is the live spot. */
  const [previewPrices, setPreviewPrices] = useState<number[]>([
    BARRIER_TOUCH_CONFIG.s0,
  ]);

  const pathRef = useRef<TouchPath | null>(null);
  const pickRef = useRef<TouchPick | null>(null);
  /** Settlement is fully determined at placement; the reveal replays it. */
  const settlementRef = useRef<TouchSettlement | null>(null);
  /** Live spot mirror — lets startRound read the entry price without a stale closure. */
  const spotRef = useRef(BARRIER_TOUCH_CONFIG.s0);
  const stakeRef = useRef(stake);
  const tradeStakeRef = useRef(stake);
  const animFrameRef = useRef(0);
  const roundStartRef = useRef(0);
  const phaseRef = useRef<TouchPhase>('idle');
  const soundRef = useRef(sound);
  const addWinningsRef = useRef(addWinnings);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);
  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const distanceFactor = getDistancePreset(distanceId).factor;
  const countPricing: CountPricing = useMemo(() => getCountPricing(ticks), [ticks]);
  // Sequence pricing runs a one-off grid calibration per (duration, preset);
  // computed lazily so Count-mode sessions never pay for it.
  const sequencePricing: SequencePricing | null = useMemo(
    () => (mode === 'sequence' ? getSequencePricing(ticks, distanceFactor) : null),
    [mode, ticks, distanceFactor],
  );

  /** Live spot the round would enter at. */
  const spot = previewPrices[previewPrices.length - 1];
  const idleBarriers = sequencePricing
    ? computeBarriers(spot, sequencePricing.offsetLog)
    : null;

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade = phase === 'idle' && stake <= balance && balance > 0;

  const windowStats = useMemo(() => {
    const relevant = history
      .filter((e) => e.mode === mode)
      .slice(0, SLIDING_WINDOW_SIZE);
    const n = relevant.length;
    if (mode === 'count') {
      const histogram: [number, number, number, number] = [0, 0, 0, 0];
      for (const e of relevant) {
        if (e.bucket !== null) histogram[e.bucket]++;
      }
      return { n, histogram, completionRate: 0 };
    }
    const completed = relevant.filter((e) => e.completed === true).length;
    return {
      n,
      histogram: [0, 0, 0, 0] as [number, number, number, number],
      completionRate: n > 0 ? completed / n : 0,
    };
  }, [history, mode]);

  const setMode = useCallback((next: TouchMode) => {
    if (phaseRef.current !== 'idle') return;
    setModeState(next);
    setPlayError(null);
  }, []);

  const setTicks = useCallback((next: number) => {
    if (phaseRef.current !== 'idle') return;
    setTicksState(next);
  }, []);

  const setDistanceId = useCallback((next: DistancePresetId) => {
    if (phaseRef.current !== 'idle') return;
    setDistanceIdState(next);
  }, []);

  // Ambient idle ticker so the instrument keeps breathing between rounds.
  useEffect(() => {
    if (phase !== 'idle') return;
    const id = window.setInterval(() => {
      setPreviewPrices((prev) => {
        const next = nextIdleTick(prev[prev.length - 1]);
        spotRef.current = next;
        return [...prev, next].slice(-PREVIEW_WINDOW);
      });
    }, IDLE_TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const startRound = useCallback(
    (selected: TouchPick) => {
      if (phaseRef.current !== 'idle') return;

      setPlayError(null);
      setResult(null);
      setEventFlash(false);

      const currentStake = stakeRef.current;
      if (!placeBet(currentStake)) {
        setPlayError('Not enough credits for this stake.');
        return;
      }
      tradeStakeRef.current = currentStake;

      // Lock everything at placement: entry spot, barriers, multiplier.
      const entrySpot = spotRef.current;
      let roundPath: TouchPath;
      let settlement: TouchSettlement;

      if (selected.kind === 'count') {
        const pricing = getCountPricing(ticks);
        roundPath = generateTouchPath(entrySpot, ticks, null);
        settlement = settleCount(
          selected.bucket,
          roundPath,
          currentStake,
          pricing.multipliers[selected.bucket],
        );
      } else {
        const pricing = getSequencePricing(ticks, getDistancePreset(distanceId).factor);
        const barriers = computeBarriers(entrySpot, pricing.offsetLog);
        roundPath = generateTouchPath(entrySpot, ticks, barriers);
        settlement = settleSequence(
          selected.pick,
          roundPath,
          currentStake,
          selected.pick === 'upperLower'
            ? pricing.multUpperLower
            : pricing.multLowerUpper,
        );
      }

      pathRef.current = roundPath;
      pickRef.current = selected;
      settlementRef.current = settlement;
      roundStartRef.current = performance.now();

      phaseRef.current = 'running';
      setPick(selected);
      setPath(roundPath);
      setVisibleTick(0);
      setPhase('running');
    },
    [placeBet, ticks, distanceId],
  );

  const dismissResult = useCallback(() => {
    const lastPath = pathRef.current;
    // Seed the idle preview from where the round ended for visual continuity.
    if (lastPath) {
      const seed = lastPath.prices.slice(-PREVIEW_WINDOW);
      spotRef.current = seed[seed.length - 1];
      setPreviewPrices(seed);
    }
    setResult(null);
    setPath(null);
    setPick(null);
    setVisibleTick(0);
    setEventFlash(false);
    pathRef.current = null;
    settlementRef.current = null;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  /** Restart immediately with the same pick and stake (result overlay CTA). */
  const playAgain = useCallback(() => {
    const lastPick = pickRef.current;
    if (phaseRef.current !== 'settled' || !lastPick) return;
    dismissResult();
    startRound(lastPick);
  }, [dismissResult, startRound]);

  useEffect(() => {
    if (phase !== 'running' || !pathRef.current || !settlementRef.current) return;

    const roundPath = pathRef.current;
    const settlement = settlementRef.current;
    const revealDuration = settlement.settleTick * TOUCH_TICK_MS;
    let processedTick = 0;
    let crossingsSoFar = 0;

    function fireEventsAt(t: number, selected: TouchPick) {
      if (selected.kind === 'count') {
        if (roundPath.crossingTicks.includes(t)) {
          crossingsSoFar++;
          soundRef.current.playCrossing(crossingsSoFar);
          setEventFlash(true);
          window.setTimeout(() => setEventFlash(false), 260);
        }
        return;
      }

      const seq = roundPath.sequence;
      if (!seq) return;
      const requiredFirst = selected.pick === 'upperLower' ? 'upper' : 'lower';
      if (t === seq.firstTouchTick) {
        if (seq.firstTouch === requiredFirst) {
          soundRef.current.playLegComplete(1);
        } else {
          soundRef.current.playBust();
        }
        setEventFlash(true);
        window.setTimeout(() => setEventFlash(false), 320);
      }
      if (t === seq.completionTick && seq.completedPick === selected.pick) {
        soundRef.current.playLegComplete(2);
        setEventFlash(true);
        window.setTimeout(() => setEventFlash(false), 320);
      }
    }

    function tick() {
      const selected = pickRef.current;
      if (!selected) return;

      const elapsed = performance.now() - roundStartRef.current;
      const tickIndex = Math.min(
        Math.floor(elapsed / TOUCH_TICK_MS),
        settlement.settleTick,
      );
      setVisibleTick(tickIndex);

      while (processedTick < tickIndex) {
        processedTick++;
        fireEventsAt(processedTick, selected);
      }

      if (
        tickIndex >= settlement.settleTick &&
        elapsed >= revealDuration + TOUCH_SETTLE_MS
      ) {
        const tradeStake = tradeStakeRef.current;

        if (settlement.outcome === 'win') {
          addWinningsRef.current(settlement.payout);
          soundRef.current.playWin();
        } else {
          soundRef.current.playLoss();
        }

        setResult({
          mode: selected.kind,
          outcome: settlement.outcome,
          payout: settlement.payout,
          stake: tradeStake,
          netPL: settlement.payout - tradeStake,
          multiplier: settlement.multiplier,
          settleTick: settlement.settleTick,
          pick: selected,
          crossingCount: roundPath.crossingCount,
          bucket: roundPath.bucket,
          firstTouch: roundPath.sequence?.firstTouch ?? null,
          completedPick: roundPath.sequence?.completedPick ?? null,
        });
        setHistory((prev) =>
          [
            {
              mode: selected.kind,
              outcome: settlement.outcome,
              payout: settlement.payout,
              stake: tradeStake,
              bucket: selected.kind === 'count' ? roundPath.bucket : null,
              completed:
                selected.kind === 'sequence'
                  ? roundPath.sequence?.completedPick !== null
                  : null,
            },
            ...prev,
          ].slice(0, SLIDING_WINDOW_SIZE * 2),
        );

        phaseRef.current = 'settled';
        setPhase('settled');
        return;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase]);

  const settleTick = settlementRef.current?.settleTick ?? null;

  /** Remaining ticks until the round resolves (drives the countdown pill). */
  const ticksLeft =
    phase === 'running' && settleTick !== null
      ? Math.max(settleTick - visibleTick, 0)
      : null;

  /** Crossings revealed so far, and the bucket currently leading (count mode). */
  const revealedCrossings =
    path && phase !== 'idle'
      ? path.crossingTicks.filter((t) => t <= visibleTick).length
      : 0;
  const leadingBucket = bucketOf(revealedCrossings);

  /** Progress of the picked sequence at the current reveal tick. */
  const legState: SequenceLegState | null = (() => {
    if (!path?.sequence || phase === 'idle' || pick?.kind !== 'sequence') return null;
    const seq = path.sequence;
    const requiredFirst = pick.pick === 'upperLower' ? 'upper' : 'lower';
    if (seq.firstTouchTick === null || visibleTick < seq.firstTouchTick) {
      return 'waitingFirst';
    }
    if (seq.firstTouch !== requiredFirst) return 'busted';
    if (
      seq.completedPick === pick.pick &&
      seq.completionTick !== null &&
      visibleTick >= seq.completionTick
    ) {
      return 'completed';
    }
    return 'waitingSecond';
  })();

  return {
    mode,
    setMode,
    stake,
    setStake,
    ticks,
    setTicks,
    distanceId,
    setDistanceId,
    phase,
    pick,
    path,
    visibleTick,
    result,
    history,
    playError,
    eventFlash,
    balance,
    maxStake,
    canTrade,
    windowStats,
    countPricing,
    sequencePricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    revealedCrossings,
    leadingBucket,
    legState,
    startRound,
    dismissResult,
    playAgain,
  };
}
