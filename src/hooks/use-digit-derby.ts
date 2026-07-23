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

  const phaseRef = useRef<DigitDerbyPhase>('idle');
  const runningRef = useRef(false);
  const addWinningsRef = useRef(addWinnings);
  const tradeStakeRef = useRef(stake);

  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const multiplier = useMemo(() => offeredOdds(), []);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const marketReady = ticks.length > 0 || lastConsumedTick !== null;
  const finishOrder = useMemo(() => rankDigits(counts), [counts]);
  const inFinalStretch = useMemo(
    () => phase === 'running' && isFinalStretch(counts),
    [phase, counts],
  );

  const canStart =
    phase === 'idle' &&
    pick !== null &&
    stake > 0 &&
    stake <= balance &&
    balance > 0 &&
    marketReady;

  const selectDigit = useCallback((digit: number) => {
    if (phaseRef.current !== 'idle') return;
    setPlayError(null);
    setPick((prev) => (prev === digit ? null : digit));
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
    setPlayError(null);
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  const finalize = useCallback(
    (settlement: DigitDerbySettlement, racePick: number, winner: number | null, order: number[], raceStake: number) => {
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
      setHistory((prev) => [
        {
          outcome: settlement.outcome,
          payout: settlement.payout,
          stake: raceStake,
          multiplier: settlement.multiplier,
          pick: racePick,
          winner,
        },
        ...prev,
      ].slice(0, 100));

      runningRef.current = false;
      phaseRef.current = 'settled';
      setPhase('settled');
    },
    [],
  );

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

    const currentStake = stake;
    if (!placeBet(currentStake)) {
      setPlayError('Not enough credits for this stake.');
      return;
    }

    tradeStakeRef.current = currentStake;
    const racePick = pick;
    const raceMultiplier = multiplier;

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
        if (!runningRef.current) return;

        raceCounts = applyTick(raceCounts, tick.lastDigit);
        ticksSeen += 1;

        setCounts(raceCounts);
        setTickCount(ticksSeen);
        setHighlightedTicks((prev) => [...prev, tick].slice(-40));
        setLastConsumedTick(tick);
        setExtractionKey((k) => k + 1);

        const winner = findWinner(raceCounts);
        if (winner !== null) {
          const settlement = settleWinner(
            racePick,
            winner,
            currentStake,
            raceMultiplier,
          );
          finalize(settlement, racePick, winner, rankDigits(raceCounts), currentStake);
          return;
        }
      }

      // Soft timeout — full refund
      if (runningRef.current) {
        const settlement = settleRefund(currentStake);
        finalize(settlement, racePick, null, rankDigits(raceCounts), currentStake);
      }
    } catch (err) {
      // Feed failure mid-race — refund stake
      const settlement = settleRefund(currentStake);
      setPlayError(
        err instanceof Error ? err.message : 'Market unavailable during race.',
      );
      finalize(settlement, racePick, null, rankDigits(raceCounts), currentStake);
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
    finishCount: DIGIT_DERBY_CONFIG.finishCount,
    maxTicks: DIGIT_DERBY_CONFIG.maxTicks,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
    selectDigit,
    startRace,
    dismissResult,
  };
}
