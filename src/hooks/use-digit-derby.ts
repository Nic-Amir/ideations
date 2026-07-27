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
  offeredOdds,
  settleWinner,
  settleRefund,
  isFinalStretch,
  type DigitCounts,
  type DigitDerbySettlement,
  type DigitDerbyOutcome,
} from '@/lib/games/digit-derby';

export type DigitDerbyPhase = 'idle' | 'running' | 'settled';

export interface DigitDerbyResult {
  outcome: DigitDerbyOutcome;
  payout: number;
  stake: number;
  netPL: number;
  multiplier: number;
  pick: number;
  winner: number | null;
  finishOrder: number[];
}

export interface DigitDerbyHistoryEntry {
  outcome: DigitDerbyOutcome;
  payout: number;
  stake: number;
  multiplier: number;
  pick: number;
  winner: number | null;
}

interface RaceContext {
  pick: number;
  stake: number;
  counts: DigitCounts;
}

export function useDigitDerby() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [phase, setPhase] = useState<DigitDerbyPhase>('idle');
  const [pick, setPick] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [counts, setCounts] = useState<DigitCounts>(() => emptyCounts());
  const [tickCount, setTickCount] = useState(0);
  const [lockedMultiplier, setLockedMultiplier] = useState<number | null>(null);
  const [lockedPick, setLockedPick] = useState<number | null>(null);
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

  const multiplier = useMemo(() => offeredOdds(), []);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  // Symbol-scoped: useTickStream clears ticks on switch; do not trust lastConsumedTick alone.
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
    pick !== null &&
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
      racePick: number,
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
        pick: racePick,
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

  // Abort + refund on symbol change or unmount mid-race (Index Ascent pattern).
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
        pick: ctx.pick,
        winner: null,
      });
      phaseRef.current = 'settled';
      setPhase('settled');
      setWinningDigit(null);
    };
  }, [selectedIndex, pushHistory]);

  const selectDigit = useCallback((digit: number) => {
    if (phaseRef.current !== 'idle') return;
    setPlayError(null);
    setPick((prev) => (prev === digit ? null : digit));
  }, []);

  const clearPick = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setPick(null);
    setPlayError(null);
  }, []);

  const dismissResult = useCallback(() => {
    setResult(null);
    setCounts(emptyCounts());
    setTickCount(0);
    setLockedMultiplier(null);
    setLockedPick(null);
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
    if (pick === null) {
      setPlayError('Pick a digit to race.');
      return;
    }
    if (!marketReady) {
      setPlayError('Market unavailable. Waiting for live ticks.');
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

    const racePick = pick;
    const raceMultiplier = multiplier;
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
          // Cleanup already refunded, or race was superseded — do not pay again.
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
          const settlement = settleWinner(
            racePick,
            winner,
            currentStake,
            raceMultiplier,
          );
          finalize(
            settlement,
            racePick,
            winner,
            rankDigits(raceCounts),
            currentStake,
          );
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
  }, [pick, marketReady, stake, placeBet, multiplier, getNextTick, finalize]);

  return {
    phase,
    pick,
    stake,
    setStake,
    counts,
    tickCount,
    lockedMultiplier,
    lockedPick,
    multiplier,
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
    selectDigit,
    clearPick,
    startRace,
    dismissResult,
  };
}
