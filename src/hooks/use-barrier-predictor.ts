'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useBarrierPredictorSound } from '@/hooks/use-barrier-predictor-sound';
import {
  type BarrierSide,
  type DistancePresetId,
  type PredictorPath,
  type PredictorSettlement,
  type PredictorPricing,
  BARRIER_PREDICTOR_CONFIG,
  PREDICTOR_TICK_MS,
  PREDICTOR_SETTLE_MS,
  SLIDING_WINDOW_SIZE,
  PREVIEW_WINDOW,
  IDLE_TICK_MS,
  getDistancePreset,
  getPredictorPricing,
  computeBarriers,
  generatePredictorPath,
  settlePredictor,
  distanceToNearestBarrierSigma,
  nextIdleTick,
} from '@/lib/games/barrier-predictor';

export type PredictorPhase = 'idle' | 'running' | 'settled';

export interface PredictorHistoryEntry {
  pick: BarrierSide;
  outcome: PredictorSettlement['outcome'];
  payout: number;
  stake: number;
}

export interface BarrierPredictorResult {
  outcome: PredictorSettlement['outcome'];
  payout: number;
  stake: number;
  netPL: number;
  pick: BarrierSide;
  touched: BarrierSide | null;
  multiplier: number;
  settleTick: number;
}

export function useBarrierPredictor() {
  const { balance, placeBet, addWinnings, adjustBalance } = useBalanceStore();
  const sound = useBarrierPredictorSound();

  const [stake, setStake] = useState(100);
  const [ticks, setTicksState] = useState(BARRIER_PREDICTOR_CONFIG.tickDuration);
  const [distanceId, setDistanceIdState] = useState<DistancePresetId>('standard');
  const [phase, setPhase] = useState<PredictorPhase>('idle');
  const [pick, setPick] = useState<BarrierSide | null>(null);
  const [path, setPath] = useState<PredictorPath | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const [result, setResult] = useState<BarrierPredictorResult | null>(null);
  const [history, setHistory] = useState<PredictorHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [barrierFlash, setBarrierFlash] = useState(false);
  /** Ambient tick trail shown while idle; last entry is the live spot. */
  const [previewPrices, setPreviewPrices] = useState<number[]>([
    BARRIER_PREDICTOR_CONFIG.s0,
  ]);

  const pathRef = useRef<PredictorPath | null>(null);
  const pickRef = useRef<BarrierSide | null>(null);
  /** Live spot mirror — lets startRound read the entry price without a stale closure. */
  const spotRef = useRef(BARRIER_PREDICTOR_CONFIG.s0);
  const stakeRef = useRef(stake);
  /** Stake and multiplier locked at placement — settlement must use these. */
  const tradeStakeRef = useRef(stake);
  const lockedMultiplierRef = useRef(0);
  const animFrameRef = useRef(0);
  const roundStartRef = useRef(0);
  const phaseRef = useRef<PredictorPhase>('idle');
  const soundRef = useRef(sound);
  const addWinningsRef = useRef(addWinnings);
  const adjustBalanceRef = useRef(adjustBalance);

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
    adjustBalanceRef.current = adjustBalance;
  }, [adjustBalance]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const distanceFactor = getDistancePreset(distanceId).factor;
  const pricing: PredictorPricing = getPredictorPricing(ticks, distanceFactor);

  /** Live spot the round would enter at; barriers preview around it. */
  const spot = previewPrices[previewPrices.length - 1];
  const idleBarriers = computeBarriers(spot, pricing.offsetLog);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade = phase === 'idle' && stake <= balance && balance > 0;

  const windowStats = (() => {
    const window = history.slice(0, SLIDING_WINDOW_SIZE);
    const n = window.length;
    if (n === 0) return { touchRate: 0, upperRate: 0, n: 0 };
    const touched = window.filter((e) => e.outcome !== 'refund').length;
    const upperWins = window.filter(
      (e) =>
        (e.pick === 'upper' && e.outcome === 'win') ||
        (e.pick === 'lower' && e.outcome === 'lose'),
    ).length;
    return {
      touchRate: touched / n,
      upperRate: touched > 0 ? upperWins / touched : 0,
      n,
    };
  })();

  const setTicks = useCallback((next: number) => {
    if (phaseRef.current !== 'idle') return;
    setTicksState(next);
  }, []);

  const setDistanceId = useCallback((next: DistancePresetId) => {
    if (phaseRef.current !== 'idle') return;
    setDistanceIdState(next);
  }, []);

  // Ambient idle ticker: the chart drifts while no round is running so the
  // player sees the instrument "breathe" between trades.
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
    (selected: BarrierSide) => {
      if (phaseRef.current !== 'idle') return;

      setPlayError(null);
      setResult(null);
      setBarrierFlash(false);

      const currentStake = stakeRef.current;
      if (!placeBet(currentStake)) {
        setPlayError('Not enough credits for this stake.');
        return;
      }
      tradeStakeRef.current = currentStake;

      // Lock everything at placement: entry spot, barriers, multiplier.
      const entrySpot = spotRef.current;
      const lockedPricing = getPredictorPricing(
        ticks,
        getDistancePreset(distanceId).factor,
      );
      const { upper, lower } = computeBarriers(entrySpot, lockedPricing.offsetLog);
      lockedMultiplierRef.current = lockedPricing.multiplier;

      const roundPath = generatePredictorPath(entrySpot, upper, lower, ticks);

      pathRef.current = roundPath;
      pickRef.current = selected;
      roundStartRef.current = performance.now();
      soundRef.current.resetRound();

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
    setBarrierFlash(false);
    pathRef.current = null;
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
    if (phase !== 'running' || !pathRef.current) return;

    const roundPath = pathRef.current;
    const totalTicks = roundPath.settleTick;
    const revealDuration = totalTicks * PREDICTOR_TICK_MS;
    let flashed = false;

    function tick() {
      const selected = pickRef.current;
      if (!roundPath || !selected) return;

      const elapsed = performance.now() - roundStartRef.current;
      const tickIndex = Math.min(
        Math.floor(elapsed / PREDICTOR_TICK_MS),
        roundPath.settleTick,
      );
      setVisibleTick(tickIndex);

      if (tickIndex > 0 && tickIndex < roundPath.settleTick) {
        const price = roundPath.prices[tickIndex];
        soundRef.current.playApproachTick(
          tickIndex,
          distanceToNearestBarrierSigma(price, roundPath.upper, roundPath.lower),
        );
      }

      // Flash the touched barrier the moment the reveal reaches it, then hold
      // for the settle pause before showing the result.
      if (!flashed && tickIndex >= roundPath.settleTick) {
        flashed = true;
        if (roundPath.touched !== null) {
          setBarrierFlash(true);
          soundRef.current.playBarrierHit();
        }
      }

      if (
        tickIndex >= roundPath.settleTick &&
        elapsed >= revealDuration + PREDICTOR_SETTLE_MS
      ) {
        const tradeStake = tradeStakeRef.current;
        const settled = settlePredictor(
          selected,
          roundPath,
          tradeStake,
          lockedMultiplierRef.current,
        );

        if (settled.outcome === 'win') {
          addWinningsRef.current(settled.payout);
          soundRef.current.playWin();
        } else if (settled.outcome === 'refund') {
          // Stake returned without counting as winnings.
          adjustBalanceRef.current(settled.payout);
          soundRef.current.playRefund();
        } else {
          soundRef.current.playLoss();
        }

        setResult({
          outcome: settled.outcome,
          payout: settled.payout,
          stake: tradeStake,
          netPL: settled.payout - tradeStake,
          pick: selected,
          touched: settled.touched,
          multiplier: settled.multiplier,
          settleTick: settled.settleTick,
        });
        setHistory((prev) =>
          [
            {
              pick: selected,
              outcome: settled.outcome,
              payout: settled.payout,
              stake: tradeStake,
            },
            ...prev,
          ].slice(0, SLIDING_WINDOW_SIZE),
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

  /** Remaining ticks while a round is running (drives the countdown pill). */
  const ticksLeft =
    phase === 'running' && path ? Math.max(path.settleTick - visibleTick, 0) : null;

  /** Live distance to the nearest barrier in per-tick σ, for the rail. */
  const liveDistance = (() => {
    if (!path || phase === 'idle') return null;
    const t = Math.min(visibleTick, path.prices.length - 1);
    return distanceToNearestBarrierSigma(path.prices[t], path.upper, path.lower);
  })();

  return {
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
    barrierFlash,
    balance,
    maxStake,
    canTrade,
    windowStats,
    pricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    liveDistance,
    startRound,
    dismissResult,
    playAgain,
  };
}
