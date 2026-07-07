'use strict';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useDerbySound } from '@/hooks/use-derby-sound';
import {
  type BetMode,
  type DerbyPick,
  type RaceCard,
  type RacePath,
  type DerbySettlement,
  DERBY_TICK_MS,
  DERBY_SETTLE_MS,
  FINAL_STRETCH_FRACTION,
  SLIDING_WINDOW_SIZE,
  getBetModeSpec,
  createRaceCard,
  pricePick,
  generateRacePath,
  settleBet,
} from '@/lib/games/derby';

export type DerbyPhase = 'idle' | 'running' | 'settled';

export interface DerbyHistoryEntry {
  mode: BetMode;
  ordered: boolean;
  outcome: DerbySettlement['outcome'];
  payout: number;
  stake: number;
  multiplier: number;
}

export interface DerbyResult {
  outcome: DerbySettlement['outcome'];
  payout: number;
  stake: number;
  netPL: number;
  multiplier: number;
  pick: DerbyPick;
  finishOrder: number[];
}

export function useDerby() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const sound = useDerbySound();

  const [card, setCard] = useState<RaceCard>(() => createRaceCard());
  const [mode, setModeState] = useState<BetMode>('winner');
  const [ordered, setOrderedState] = useState(false);
  /** Horse indices in slot order (order matters for ordered bets). */
  const [selection, setSelection] = useState<number[]>([]);
  const [stake, setStake] = useState(100);
  const [phase, setPhase] = useState<DerbyPhase>('idle');
  const [pick, setPick] = useState<DerbyPick | null>(null);
  const [path, setPath] = useState<RacePath | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const [result, setResult] = useState<DerbyResult | null>(null);
  const [history, setHistory] = useState<DerbyHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);

  const pathRef = useRef<RacePath | null>(null);
  const pickRef = useRef<DerbyPick | null>(null);
  const settlementRef = useRef<DerbySettlement | null>(null);
  const tradeStakeRef = useRef(stake);
  const animFrameRef = useRef(0);
  const raceStartRef = useRef(0);
  const phaseRef = useRef<DerbyPhase>('idle');
  const soundRef = useRef(sound);
  const addWinningsRef = useRef(addWinnings);
  /** Picked horses' ranks at the last processed tick, for rank-change blips. */
  const lastRanksRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const spec = getBetModeSpec(mode);
  const selectionComplete = selection.length === spec.picks;

  /** Live pricing of the current (possibly incomplete) selection. */
  const pricing = useMemo(() => {
    if (!selectionComplete) return null;
    return pricePick(card, { mode, ordered: spec.orderable && ordered, horses: selection });
  }, [card, mode, ordered, selection, selectionComplete, spec.orderable]);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade =
    phase === 'idle' && selectionComplete && stake <= balance && balance > 0;

  const windowStats = useMemo(() => {
    const window = history.slice(0, SLIDING_WINDOW_SIZE);
    const n = window.length;
    if (n === 0) return { n: 0, hitRate: 0, bestPayout: 0 };
    const wins = window.filter((e) => e.outcome === 'win');
    return {
      n,
      hitRate: wins.length / n,
      bestPayout: wins.reduce((best, e) => Math.max(best, e.multiplier), 0),
    };
  }, [history]);

  const setMode = useCallback((next: BetMode) => {
    if (phaseRef.current !== 'idle') return;
    setModeState(next);
    setSelection([]);
    setPlayError(null);
  }, []);

  const setOrdered = useCallback((next: boolean) => {
    if (phaseRef.current !== 'idle') return;
    setOrderedState(next);
  }, []);

  /** Tap a horse: add to the next slot, or remove it if already selected. */
  const toggleHorse = useCallback(
    (index: number) => {
      if (phaseRef.current !== 'idle') return;
      setPlayError(null);
      setSelection((prev) => {
        if (prev.includes(index)) return prev.filter((h) => h !== index);
        if (prev.length >= spec.picks) return prev;
        return [...prev, index];
      });
    },
    [spec.picks],
  );

  const clearSelection = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setSelection([]);
    setPlayError(null);
  }, []);

  /** Draw a fresh card (new odds board); idle only. */
  const newRace = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setCard(createRaceCard());
    setSelection([]);
    setResult(null);
    setPath(null);
    setPlayError(null);
  }, []);

  const startRace = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    if (!selectionComplete || !pricing) return;

    setPlayError(null);
    setResult(null);

    const currentStake = stake;
    if (!placeBet(currentStake)) {
      setPlayError('Not enough credits for this stake.');
      return;
    }
    tradeStakeRef.current = currentStake;

    // Lock pick + multiplier at placement, pre-generate the whole race.
    const lockedPick: DerbyPick = {
      mode,
      ordered: spec.orderable && ordered,
      horses: [...selection],
    };
    const racePath = generateRacePath(card);
    const settlement = settleBet(
      lockedPick,
      racePath.finishOrder,
      currentStake,
      pricing.multiplier,
    );

    pathRef.current = racePath;
    pickRef.current = lockedPick;
    settlementRef.current = settlement;
    raceStartRef.current = performance.now();
    lastRanksRef.current = new Map(
      lockedPick.horses.map((h) => [h, racePath.ranks[0].indexOf(h)]),
    );
    soundRef.current.resetRace();

    phaseRef.current = 'running';
    setPick(lockedPick);
    setPath(racePath);
    setVisibleTick(0);
    setPhase('running');
  }, [selectionComplete, pricing, stake, placeBet, mode, ordered, selection, card, spec.orderable]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setPath(null);
    setPick(null);
    setVisibleTick(0);
    setSelection([]);
    pathRef.current = null;
    settlementRef.current = null;
    // Fresh card after every race — new odds board, like a new post parade.
    setCard(createRaceCard());
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  useEffect(() => {
    if (phase !== 'running' || !pathRef.current || !settlementRef.current) return;

    const racePath = pathRef.current;
    const settlement = settlementRef.current;
    const totalTicks = racePath.ranks.length - 1;
    const revealDuration = totalTicks * DERBY_TICK_MS;
    let finished = false;

    function tick() {
      const lockedPick = pickRef.current;
      if (!lockedPick) return;

      const elapsed = performance.now() - raceStartRef.current;
      const tickIndex = Math.min(Math.floor(elapsed / DERBY_TICK_MS), totalTicks);
      setVisibleTick(tickIndex);

      if (tickIndex > 0 && tickIndex < totalTicks) {
        const stretchProgress = Math.max(
          0,
          (tickIndex / totalTicks - FINAL_STRETCH_FRACTION) /
            (1 - FINAL_STRETCH_FRACTION),
        );
        soundRef.current.playGallopTick(tickIndex, stretchProgress);

        // Rank-change blips for the picked horses.
        const ranksNow = racePath.ranks[tickIndex];
        for (const h of lockedPick.horses) {
          const prev = lastRanksRef.current.get(h);
          const now = ranksNow.indexOf(h);
          if (prev !== undefined && now !== prev) {
            if (now < prev) soundRef.current.playRankGain();
            else soundRef.current.playRankLoss();
          }
          lastRanksRef.current.set(h, now);
        }
      }

      if (!finished && tickIndex >= totalTicks) {
        finished = true;
        soundRef.current.playFinish();
      }

      if (tickIndex >= totalTicks && elapsed >= revealDuration + DERBY_SETTLE_MS) {
        const tradeStake = tradeStakeRef.current;

        if (settlement.outcome === 'win') {
          addWinningsRef.current(settlement.payout);
          soundRef.current.playWin();
        } else {
          soundRef.current.playLoss();
        }

        setResult({
          outcome: settlement.outcome,
          payout: settlement.payout,
          stake: tradeStake,
          netPL: settlement.payout - tradeStake,
          multiplier: settlement.multiplier,
          pick: lockedPick,
          finishOrder: racePath.finishOrder,
        });
        setHistory((prev) =>
          [
            {
              mode: lockedPick.mode,
              ordered: lockedPick.ordered,
              outcome: settlement.outcome,
              payout: settlement.payout,
              stake: tradeStake,
              multiplier: settlement.multiplier,
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

  const totalTicks = card.ticks;

  /** Remaining ticks while racing (drives the countdown / stretch label). */
  const ticksLeft =
    phase === 'running' ? Math.max(totalTicks - visibleTick, 0) : null;

  const inFinalStretch =
    phase === 'running' && visibleTick / totalTicks >= FINAL_STRETCH_FRACTION;

  /** Live ranking at the current reveal tick (idle: post order). */
  const liveRanks =
    path && phase !== 'idle'
      ? path.ranks[Math.min(visibleTick, path.ranks.length - 1)]
      : card.horses.map((h) => h.index);

  return {
    card,
    mode,
    setMode,
    ordered,
    setOrdered,
    spec,
    selection,
    toggleHorse,
    clearSelection,
    selectionComplete,
    pricing,
    stake,
    setStake,
    phase,
    pick,
    path,
    visibleTick,
    result,
    history,
    playError,
    balance,
    maxStake,
    canTrade,
    windowStats,
    ticksLeft,
    inFinalStretch,
    liveRanks,
    newRace,
    startRace,
    dismissResult,
  };
}
