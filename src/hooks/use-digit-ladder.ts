'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import type { ParsedTick } from '@/types';
import {
  cashOut,
  centsToUsdt,
  continueRound,
  livePricing,
  openRound,
  rungCount,
  settleStep,
  stepWins,
  usdtToCents,
  type DigitLadderPick,
  type DigitLadderRound,
} from '@/lib/games/digit-ladder';

export type DigitLadderPhase =
  | 'need_draw'
  | 'drawing'
  | 'ready'
  | 'awaiting_tick'
  | 'decision'
  | 'settled';

export interface DigitLadderResult {
  outcome: 'WON' | 'LOST';
  potUsdt: number;
  stakeUsdt: number;
  netPL: number;
  rungs: number;
  cashOut: boolean;
  lastDigit: number | null;
  entryDigit: number | null;
  pick: DigitLadderPick | null;
}

export interface DigitLadderHistoryEntry {
  outcome: 'WON' | 'LOST';
  potUsdt: number;
  stakeUsdt: number;
  rungs: number;
  cashOut: boolean;
}

export interface SettleCompare {
  entryDigit: number;
  settlementDigit: number;
  pick: DigitLadderPick;
  won: boolean;
}

const HISTORY_CAP = 50;

export function useDigitLadder() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { latestTick, ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [stake, setStake] = useState(100);
  const [phase, setPhase] = useState<DigitLadderPhase>('need_draw');
  const [round, setRound] = useState<DigitLadderRound | null>(null);
  const [result, setResult] = useState<DigitLadderResult | null>(null);
  const [history, setHistory] = useState<DigitLadderHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [revealDigit, setRevealDigit] = useState<number | null>(null);
  const [tableDigit, setTableDigit] = useState<number | null>(null);
  const [tableTick, setTableTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);
  const [settleCompare, setSettleCompare] = useState<SettleCompare | null>(null);

  const phaseRef = useRef<DigitLadderPhase>('need_draw');
  const roundRef = useRef<DigitLadderRound | null>(null);
  const busyRef = useRef(false);
  const autoDrawStartedRef = useRef(false);
  const addWinningsRef = useRef(addWinnings);
  const tableDigitRef = useRef<number | null>(null);

  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    tableDigitRef.current = tableDigit;
  }, [tableDigit]);

  const liveDigit = latestTick?.lastDigit ?? null;
  const marketReady = ticks.length > 0 && liveDigit !== null;

  /** Face used for pricing / display: locked table, or in-round face. */
  const faceDigit =
    phase === 'awaiting_tick' || phase === 'decision'
      ? (round?.face_digit ?? tableDigit)
      : tableDigit;

  const pricing = useMemo(() => livePricing(faceDigit), [faceDigit]);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade =
    phase === 'ready' &&
    tableDigit !== null &&
    marketReady &&
    !busyRef.current &&
    balance >= stake;

  const potUsdt = round ? centsToUsdt(round.pot_cents) : 0;
  const rungs = round ? rungCount(round) : 0;

  /** Settled step digits for rung trail (entry of first + each settlement). */
  const rungTrail = useMemo(() => {
    if (!round) return [] as number[];
    const trail: number[] = [];
    for (const step of round.steps) {
      if (trail.length === 0) trail.push(step.entry_digit);
      if (step.settlement_digit !== null) trail.push(step.settlement_digit);
    }
    return trail;
  }, [round]);

  const pushHistory = useCallback((entry: DigitLadderHistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_CAP));
  }, []);

  const clearTable = useCallback(() => {
    setTableDigit(null);
    tableDigitRef.current = null;
    setTableTick(null);
    setRevealDigit(null);
    setSettleCompare(null);
  }, []);

  const finishBust = useCallback(
    (next: DigitLadderRound, settlementDigit: number, pick: DigitLadderPick, entryDigit: number) => {
      const stakeUsdt = centsToUsdt(next.initial_stake_cents);
      const res: DigitLadderResult = {
        outcome: 'LOST',
        potUsdt: 0,
        stakeUsdt,
        netPL: -stakeUsdt,
        rungs: rungCount(next),
        cashOut: false,
        lastDigit: settlementDigit,
        entryDigit,
        pick,
      };
      setRound(next);
      roundRef.current = next;
      setResult(res);
      setPhase('settled');
      pushHistory({
        outcome: 'LOST',
        potUsdt: 0,
        stakeUsdt,
        rungs: res.rungs,
        cashOut: false,
      });
    },
    [pushHistory],
  );

  const drawFace = useCallback(async () => {
    if (busyRef.current) return;
    const ph = phaseRef.current;
    if (ph !== 'need_draw' && ph !== 'ready') return;
    if (!marketReady) {
      setPlayError('Waiting for ticks');
      return;
    }

    busyRef.current = true;
    setPlayError(null);
    setSettleCompare(null);
    setRevealDigit(null);
    setTableDigit(null);
    tableDigitRef.current = null;
    setPhase('drawing');
    phaseRef.current = 'drawing';

    try {
      const tick = await getNextTick();
      setTableDigit(tick.lastDigit);
      tableDigitRef.current = tick.lastDigit;
      setTableTick(tick);
      setRevealDigit(tick.lastDigit);
      setExtractionKey((k) => k + 1);
      setPhase('ready');
      phaseRef.current = 'ready';
    } catch {
      setPlayError('Tick timed out — tap Draw to try again');
      setPhase('need_draw');
      phaseRef.current = 'need_draw';
      clearTable();
    } finally {
      busyRef.current = false;
    }
  }, [clearTable, getNextTick, marketReady]);

  // Auto-draw when we need a face and the feed is ready
  useEffect(() => {
    if (phase !== 'need_draw') return;
    if (!marketReady || busyRef.current) return;
    if (tableDigit !== null) return;
    if (autoDrawStartedRef.current) return;
    autoDrawStartedRef.current = true;
    void drawFace();
  }, [phase, marketReady, tableDigit, drawFace]);

  // Reset table when symbol changes
  useEffect(() => {
    autoDrawStartedRef.current = false;
    if (
      phaseRef.current === 'need_draw' ||
      phaseRef.current === 'ready' ||
      phaseRef.current === 'drawing'
    ) {
      clearTable();
      setPhase('need_draw');
      phaseRef.current = 'need_draw';
      busyRef.current = false;
    }
  }, [selectedIndex, clearTable]);

  const awaitAndSettle = useCallback(
    async (current: DigitLadderRound) => {
      try {
        const tick = await getNextTick();
        const active = current.steps[current.steps.length - 1];
        const won = stepWins(active.pick, active.entry_digit, tick.lastDigit);
        setSettleCompare({
          entryDigit: active.entry_digit,
          settlementDigit: tick.lastDigit,
          pick: active.pick,
          won,
        });
        const settled = settleStep(current, tick.lastDigit, {
          quote: tick.quote,
          epoch: tick.epoch,
        });
        setRevealDigit(tick.lastDigit);
        setExtractionKey((k) => k + 1);
        setTableDigit(tick.lastDigit);
        tableDigitRef.current = tick.lastDigit;
        setTableTick(tick);
        roundRef.current = settled;

        if (settled.status === 'LOST') {
          finishBust(settled, tick.lastDigit, active.pick, active.entry_digit);
          return;
        }

        setRound(settled);
        setPhase('decision');
        phaseRef.current = 'decision';
      } catch {
        setPlayError('Tick timed out — try again');
        const open = roundRef.current;
        if (
          open &&
          open.status === 'OPEN' &&
          open.steps.length === 1 &&
          open.steps[0].result === null
        ) {
          addWinningsRef.current(centsToUsdt(open.initial_stake_cents));
          setRound(null);
          roundRef.current = null;
          setPhase('ready');
          phaseRef.current = 'ready';
        } else if (open && open.status === 'OPEN' && open.phase === 'awaiting_tick') {
          const rolledBack: DigitLadderRound = {
            ...open,
            phase: 'decision',
            steps: open.steps.slice(0, -1),
            face_digit:
              open.steps.length > 1
                ? (open.steps[open.steps.length - 2].settlement_digit ??
                  open.face_digit)
                : open.face_digit,
          };
          rolledBack.locked_pricing = {
            ...open.locked_pricing,
            steps: rolledBack.steps.map((s) => ({
              entry_digit: s.entry_digit,
              pick: s.pick,
              base_prob: s.base_prob,
              implied_prob: s.implied_prob,
              multiplier: s.multiplier,
            })),
          };
          setRound(rolledBack);
          roundRef.current = rolledBack;
          setTableDigit(rolledBack.face_digit);
          tableDigitRef.current = rolledBack.face_digit;
          setPhase('decision');
          phaseRef.current = 'decision';
        } else {
          setRound(null);
          roundRef.current = null;
          setPhase('need_draw');
          phaseRef.current = 'need_draw';
          clearTable();
        }
      } finally {
        busyRef.current = false;
      }
    },
    [clearTable, finishBust, getNextTick],
  );

  const placePick = useCallback(
    async (pick: DigitLadderPick) => {
      if (busyRef.current) return;
      setPlayError(null);
      setSettleCompare(null);

      if (phaseRef.current === 'ready') {
        const entry = tableDigitRef.current;
        if (entry === null) {
          setPlayError('Draw a face digit first');
          return;
        }
        const side = livePricing(entry)?.[pick];
        if (!side?.offered) {
          setPlayError('That side is not offered on this digit');
          return;
        }
        if (stake > balance || stake < 10) {
          setPlayError('Invalid stake');
          return;
        }
        if (!placeBet(stake)) {
          setPlayError('Insufficient balance');
          return;
        }

        busyRef.current = true;
        setRevealDigit(null);
        try {
          const opened = openRound({
            stakeCents: usdtToCents(stake),
            pick,
            entryDigit: entry,
            instrument: selectedIndex,
          });
          roundRef.current = opened;
          setRound(opened);
          setPhase('awaiting_tick');
          phaseRef.current = 'awaiting_tick';
          await awaitAndSettle(opened);
        } catch (err) {
          addWinningsRef.current(stake);
          setPlayError(err instanceof Error ? err.message : 'Could not place');
          setRound(null);
          roundRef.current = null;
          setPhase('ready');
          phaseRef.current = 'ready';
          busyRef.current = false;
        }
        return;
      }

      if (phaseRef.current === 'decision') {
        const current = roundRef.current;
        if (!current) return;
        const entry = current.face_digit;
        const side = livePricing(entry)?.[pick];
        if (!side?.offered) {
          setPlayError('That side is not offered on this digit');
          return;
        }

        busyRef.current = true;
        setPlayError(null);
        setRevealDigit(null);
        setSettleCompare(null);
        try {
          const continued = continueRound(current, pick, entry);
          roundRef.current = continued;
          setRound(continued);
          setPhase('awaiting_tick');
          phaseRef.current = 'awaiting_tick';
          await awaitAndSettle(continued);
        } catch (err) {
          setPlayError(err instanceof Error ? err.message : 'Could not continue');
          busyRef.current = false;
        }
      }
    },
    [awaitAndSettle, balance, placeBet, selectedIndex, stake],
  );

  const onCashOut = useCallback(() => {
    const current = roundRef.current;
    if (!current || phaseRef.current !== 'decision') return;
    try {
      const cashed = cashOut(current);
      const stakeUsdt = centsToUsdt(cashed.initial_stake_cents);
      const pot = centsToUsdt(cashed.pot_cents);
      addWinningsRef.current(pot);
      const lastStep = cashed.steps[cashed.steps.length - 1];
      const res: DigitLadderResult = {
        outcome: 'WON',
        potUsdt: pot,
        stakeUsdt,
        netPL: pot - stakeUsdt,
        rungs: rungCount(cashed),
        cashOut: true,
        lastDigit: cashed.face_digit,
        entryDigit: lastStep?.entry_digit ?? null,
        pick: lastStep?.pick ?? null,
      };
      roundRef.current = cashed;
      setRound(cashed);
      setResult(res);
      setPhase('settled');
      phaseRef.current = 'settled';
      pushHistory({
        outcome: 'WON',
        potUsdt: pot,
        stakeUsdt,
        rungs: res.rungs,
        cashOut: true,
      });
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Cash out failed');
    }
  }, [pushHistory]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setRound(null);
    roundRef.current = null;
    clearTable();
    autoDrawStartedRef.current = false;
    setPhase('need_draw');
    phaseRef.current = 'need_draw';
  }, [clearTable]);

  return {
    stake,
    setStake,
    phase,
    round,
    result,
    history,
    playError,
    revealDigit,
    faceDigit,
    tableDigit,
    tableTick,
    liveDigit,
    liveTick: latestTick,
    liveQuote: latestTick?.quote ?? null,
    extractionKey,
    settleCompare,
    rungTrail,
    pricing,
    potUsdt,
    rungs,
    balance,
    maxStake,
    marketReady,
    canTrade,
    placePick,
    onCashOut,
    dismissResult,
    drawFace,
  };
}
