'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import type { ParsedTick } from '@/types';
import {
  DIGIT_DERBY_CONFIG,
  emptyCounts,
  applyTick,
  findWinner,
  rankDigits,
  pricePick,
  settleBet,
  settleRefund,
  isFinalStretch,
  getDigitBetModeSpec,
  isPickComplete,
  type DigitBetMode,
  type DigitDerbyPick,
  type DigitCounts,
  type DigitDerbySettlement,
  type DigitDerbyOutcome,
  type MarginThreshold,
  type PickPricing,
} from '@/lib/games/digit-derby';

export type DigitDerbyPhase = 'idle' | 'running' | 'settled';

export interface DigitDerbyResult {
  outcome: DigitDerbyOutcome;
  payout: number;
  stake: number;
  netPL: number;
  multiplier: number;
  pick: DigitDerbyPick;
  winner: number | null;
  finishOrder: number[];
}

export interface DigitDerbyHistoryEntry {
  outcome: DigitDerbyOutcome;
  payout: number;
  stake: number;
  multiplier: number;
  mode: DigitBetMode;
  winner: number | null;
}

interface RaceContext {
  pick: DigitDerbyPick;
  stake: number;
  counts: DigitCounts;
}

export function useDigitDerby() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [phase, setPhase] = useState<DigitDerbyPhase>('idle');
  const [mode, setModeState] = useState<DigitBetMode>('outright');
  const [ordered, setOrderedState] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [marginThreshold, setMarginThresholdState] = useState<MarginThreshold | null>(
    null,
  );
  const [stake, setStake] = useState(100);
  const [counts, setCounts] = useState<DigitCounts>(() => emptyCounts());
  const [tickCount, setTickCount] = useState(0);
  const [lockedMultiplier, setLockedMultiplier] = useState<number | null>(null);
  const [lockedPick, setLockedPick] = useState<DigitDerbyPick | null>(null);
  const [result, setResult] = useState<DigitDerbyResult | null>(null);
  const [history, setHistory] = useState<DigitDerbyHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [highlightedTicks, setHighlightedTicks] = useState<ParsedTick[]>([]);
  const [lastConsumedTick, setLastConsumedTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);
  const [winningDigit, setWinningDigit] = useState<number | null>(null);

  const phaseRef = useRef<DigitDerbyPhase>('idle');
  const runningRef = useRef(false);
  const settledRef = useRef(false);
  const raceIdRef = useRef(0);
  const raceContextRef = useRef<RaceContext | null>(null);
  const addWinningsRef = useRef(addWinnings);

  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const spec = getDigitBetModeSpec(mode);

  const currentPick: DigitDerbyPick = useMemo(
    () => ({
      mode,
      ordered: spec.orderable && ordered,
      digits: selection,
      ...(mode === 'margin' && marginThreshold
        ? { marginThreshold }
        : {}),
    }),
    [mode, ordered, selection, marginThreshold, spec.orderable],
  );

  const selectionComplete = isPickComplete(currentPick);

  const pricing: PickPricing | null = useMemo(() => {
    if (!selectionComplete) return null;
    return pricePick(currentPick);
  }, [selectionComplete, currentPick]);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const marketReady = ticks.length > 0;
  const finishOrder = useMemo(() => rankDigits(counts), [counts]);
  const inFinalStretch = useMemo(
    () => phase === 'running' && isFinalStretch(counts),
    [phase, counts],
  );
  const raceProgress = useMemo(() => {
    const lead = Math.max(0, ...counts);
    return Math.min(100, (lead / DIGIT_DERBY_CONFIG.finishCount) * 100);
  }, [counts]);

  const canStart =
    phase === 'idle' &&
    selectionComplete &&
    pricing !== null &&
    stake > 0 &&
    stake <= balance &&
    balance > 0 &&
    marketReady;

  const pushHistory = useCallback((entry: DigitDerbyHistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 100));
  }, []);

  const finalize = useCallback(
    (
      settlement: DigitDerbySettlement,
      racePick: DigitDerbyPick,
      winner: number | null,
      order: number[],
      raceStake: number,
    ) => {
      if (settledRef.current) return false;
      settledRef.current = true;

      if (settlement.payout > 0) {
        addWinningsRef.current(settlement.payout);
      }

      const entry: DigitDerbyResult = {
        outcome: settlement.outcome,
        payout: settlement.payout,
        stake: raceStake,
        netPL: settlement.payout - raceStake,
        multiplier: settlement.multiplier,
        pick: racePick,
        winner,
        finishOrder: order,
      };

      setResult(entry);
      pushHistory({
        outcome: settlement.outcome,
        payout: settlement.payout,
        stake: raceStake,
        multiplier: settlement.multiplier,
        mode: racePick.mode,
        winner,
      });

      runningRef.current = false;
      raceContextRef.current = null;
      phaseRef.current = 'settled';
      setPhase('settled');
      return true;
    },
    [pushHistory],
  );

  useEffect(() => {
    setHighlightedTicks([]);
    setLastConsumedTick(null);
    setExtractionKey(0);

    return () => {
      if (!runningRef.current || settledRef.current) return;
      const ctx = raceContextRef.current;
      if (!ctx) return;

      runningRef.current = false;
      raceIdRef.current += 1;
      settledRef.current = true;
      useBalanceStore.getState().addWinnings(ctx.stake);
      raceContextRef.current = null;

      const refundResult: DigitDerbyResult = {
        outcome: 'refund',
        payout: ctx.stake,
        stake: ctx.stake,
        netPL: 0,
        multiplier: 1,
        pick: ctx.pick,
        winner: null,
        finishOrder: rankDigits(ctx.counts),
      };

      setPlayError('Race cancelled — market changed. Stake refunded.');
      setResult(refundResult);
      pushHistory({
        outcome: 'refund',
        payout: ctx.stake,
        stake: ctx.stake,
        multiplier: 1,
        mode: ctx.pick.mode,
        winner: null,
      });
      phaseRef.current = 'settled';
      setPhase('settled');
      setWinningDigit(null);
    };
  }, [selectedIndex, pushHistory]);

  const setMode = useCallback((next: DigitBetMode) => {
    if (phaseRef.current !== 'idle') return;
    setModeState(next);
    setSelection([]);
    setOrderedState(false);
    setMarginThresholdState(null);
    setPlayError(null);
  }, []);

  const setOrdered = useCallback((next: boolean) => {
    if (phaseRef.current !== 'idle') return;
    setOrderedState(next);
  }, []);

  const setMarginThreshold = useCallback((next: MarginThreshold) => {
    if (phaseRef.current !== 'idle') return;
    setPlayError(null);
    setMarginThresholdState((prev) => (prev === next ? null : next));
  }, []);

  const toggleDigit = useCallback(
    (digit: number) => {
      if (phaseRef.current !== 'idle') return;
      if (mode === 'margin') return;
      setPlayError(null);
      setSelection((prev) => {
        if (prev.includes(digit)) return prev.filter((d) => d !== digit);
        if (prev.length >= spec.picks) return prev;
        return [...prev, digit];
      });
    },
    [spec.picks, mode],
  );

  const clearSelection = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setSelection([]);
    setMarginThresholdState(null);
    setPlayError(null);
  }, []);

  const dismissResult = useCallback(() => {
    setResult(null);
    setCounts(emptyCounts());
    setTickCount(0);
    setLockedMultiplier(null);
    setLockedPick(null);
    setSelection([]);
    setMarginThresholdState(null);
    setHighlightedTicks([]);
    setLastConsumedTick(null);
    setExtractionKey(0);
    setWinningDigit(null);
    setPlayError(null);
    settledRef.current = false;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  const startRace = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    if (!selectionComplete || !pricing) {
      setPlayError(
        mode === 'margin'
          ? 'Select a margin threshold (Photo, Wide, or Blowout).'
          : `Select ${spec.picks} digit${spec.picks === 1 ? '' : 's'} for this contract.`,
      );
      return;
    }
    if (!marketReady) {
      setPlayError('Waiting for ticks.');
      return;
    }

    setPlayError(null);
    setResult(null);
    setWinningDigit(null);

    const currentStake = stake;
    if (!placeBet(currentStake)) {
      setPlayError('Not enough credits for this stake.');
      return;
    }

    const racePick: DigitDerbyPick = {
      mode,
      ordered: spec.orderable && ordered,
      digits: [...selection],
      ...(mode === 'margin' && marginThreshold
        ? { marginThreshold }
        : {}),
    };
    const raceMultiplier = pricing.multiplier;
    const raceId = ++raceIdRef.current;
    settledRef.current = false;
    raceContextRef.current = {
      pick: racePick,
      stake: currentStake,
      counts: emptyCounts(),
    };

    setLockedPick(racePick);
    setLockedMultiplier(raceMultiplier);
    setCounts(emptyCounts());
    setTickCount(0);
    setHighlightedTicks([]);
    setLastConsumedTick(null);
    setExtractionKey(0);

    runningRef.current = true;
    phaseRef.current = 'running';
    setPhase('running');

    let raceCounts = emptyCounts();
    let ticksSeen = 0;

    try {
      while (runningRef.current && ticksSeen < DIGIT_DERBY_CONFIG.maxTicks) {
        const tick = await getNextTick();

        if (
          raceId !== raceIdRef.current ||
          !runningRef.current ||
          settledRef.current
        ) {
          if (!settledRef.current && raceContextRef.current) {
            finalize(
              settleRefund(currentStake),
              racePick,
              null,
              rankDigits(raceCounts),
              currentStake,
            );
          }
          return;
        }

        raceCounts = applyTick(raceCounts, tick.lastDigit);
        ticksSeen += 1;
        if (raceContextRef.current) {
          raceContextRef.current = { ...raceContextRef.current, counts: raceCounts };
        }

        setCounts(raceCounts);
        setTickCount(ticksSeen);
        setHighlightedTicks((prev) => [...prev, tick].slice(-40));
        setLastConsumedTick(tick);
        setExtractionKey((k) => k + 1);

        const winner = findWinner(raceCounts);
        if (winner !== null) {
          setWinningDigit(winner);
          const order = rankDigits(raceCounts);
          const settlement = settleBet(
            racePick,
            order,
            currentStake,
            raceMultiplier,
            raceCounts,
          );
          finalize(settlement, racePick, winner, order, currentStake);
          return;
        }
      }

      if (
        raceId === raceIdRef.current &&
        runningRef.current &&
        !settledRef.current
      ) {
        finalize(
          settleRefund(currentStake),
          racePick,
          null,
          rankDigits(raceCounts),
          currentStake,
        );
      }
    } catch (err) {
      if (settledRef.current || raceId !== raceIdRef.current) return;
      setPlayError(
        err instanceof Error ? err.message : 'Market unavailable during race.',
      );
      finalize(
        settleRefund(currentStake),
        racePick,
        null,
        rankDigits(raceCounts),
        currentStake,
      );
    }
  }, [
    selectionComplete,
    pricing,
    spec.picks,
    spec.orderable,
    marketReady,
    stake,
    placeBet,
    mode,
    ordered,
    selection,
    marginThreshold,
    getNextTick,
    finalize,
  ]);

  return {
    phase,
    mode,
    setMode,
    ordered,
    setOrdered,
    selection,
    marginThreshold,
    setMarginThreshold,
    stake,
    setStake,
    counts,
    tickCount,
    lockedMultiplier,
    lockedPick,
    pricing,
    spec,
    selectionComplete,
    result,
    history,
    playError,
    balance,
    maxStake,
    canStart,
    marketReady,
    finishOrder,
    inFinalStretch,
    raceProgress,
    finishCount: DIGIT_DERBY_CONFIG.finishCount,
    maxTicks: DIGIT_DERBY_CONFIG.maxTicks,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
    winningDigit,
    toggleDigit,
    clearSelection,
    startRace,
    dismissResult,
  };
}
