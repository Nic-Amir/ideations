'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import {
  cashOut,
  centsToUsdt,
  continueRound,
  livePricing,
  openRound,
  rungCount,
  settleStep,
  usdtToCents,
  type DigitLadderPick,
  type DigitLadderRound,
} from '@/lib/games/digit-ladder';

export type DigitLadderPhase = 'idle' | 'awaiting_tick' | 'decision' | 'settled';

export interface DigitLadderResult {
  outcome: 'WON' | 'LOST';
  potUsdt: number;
  stakeUsdt: number;
  netPL: number;
  rungs: number;
  cashOut: boolean;
  lastDigit: number | null;
}

export interface DigitLadderHistoryEntry {
  outcome: 'WON' | 'LOST';
  potUsdt: number;
  stakeUsdt: number;
  rungs: number;
  cashOut: boolean;
}

const HISTORY_CAP = 50;

export function useDigitLadder() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { latestTick, ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [stake, setStake] = useState(100);
  const [phase, setPhase] = useState<DigitLadderPhase>('idle');
  const [round, setRound] = useState<DigitLadderRound | null>(null);
  const [result, setResult] = useState<DigitLadderResult | null>(null);
  const [history, setHistory] = useState<DigitLadderHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [revealDigit, setRevealDigit] = useState<number | null>(null);

  const phaseRef = useRef<DigitLadderPhase>('idle');
  const roundRef = useRef<DigitLadderRound | null>(null);
  const busyRef = useRef(false);
  const addWinningsRef = useRef(addWinnings);

  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  const liveDigit = latestTick?.lastDigit ?? null;
  const faceDigit =
    phase === 'awaiting_tick' || phase === 'decision'
      ? (round?.face_digit ?? liveDigit)
      : liveDigit;

  const pricing = useMemo(() => livePricing(faceDigit), [faceDigit]);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const marketReady = ticks.length > 0 && liveDigit !== null;
  const canTrade =
    phase === 'idle' && marketReady && !busyRef.current && balance >= stake;

  const potUsdt = round ? centsToUsdt(round.pot_cents) : 0;
  const rungs = round ? rungCount(round) : 0;

  const pushHistory = useCallback((entry: DigitLadderHistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_CAP));
  }, []);

  const finishBust = useCallback(
    (next: DigitLadderRound, settlementDigit: number) => {
      const stakeUsdt = centsToUsdt(next.initial_stake_cents);
      const res: DigitLadderResult = {
        outcome: 'LOST',
        potUsdt: 0,
        stakeUsdt,
        netPL: -stakeUsdt,
        rungs: rungCount(next),
        cashOut: false,
        lastDigit: settlementDigit,
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

  const awaitAndSettle = useCallback(
    async (current: DigitLadderRound) => {
      try {
        const tick = await getNextTick();
        const settled = settleStep(current, tick.lastDigit, {
          quote: tick.quote,
          epoch: tick.epoch,
        });
        setRevealDigit(tick.lastDigit);
        roundRef.current = settled;

        if (settled.status === 'LOST') {
          finishBust(settled, tick.lastDigit);
          return;
        }

        setRound(settled);
        setPhase('decision');
      } catch {
        setPlayError('Tick timed out — try again');
        const open = roundRef.current;
        if (
          open &&
          open.status === 'OPEN' &&
          open.steps.length === 1 &&
          open.steps[0].result === null
        ) {
          // First step never settled — refund escrowed stake
          addWinningsRef.current(centsToUsdt(open.initial_stake_cents));
          setRound(null);
          setPhase('idle');
        } else if (open && open.status === 'OPEN' && open.phase === 'awaiting_tick') {
          // Continue step timed out — drop the open step, return to decision with pot intact
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
          // Rebuild locked_pricing without the aborted step
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
          setPhase('decision');
        } else {
          setRound(null);
          setPhase('idle');
        }
      } finally {
        busyRef.current = false;
      }
    },
    [finishBust, getNextTick],
  );

  const placePick = useCallback(
    async (pick: DigitLadderPick) => {
      if (busyRef.current) return;
      setPlayError(null);
      setRevealDigit(null);

      if (phaseRef.current === 'idle') {
        if (liveDigit === null) {
          setPlayError('Waiting for a live digit');
          return;
        }
        if (!pricing || !pricing[pick].offered) {
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
        try {
          const opened = openRound({
            stakeCents: usdtToCents(stake),
            pick,
            entryDigit: liveDigit,
            instrument: selectedIndex,
          });
          roundRef.current = opened;
          setRound(opened);
          setPhase('awaiting_tick');
          await awaitAndSettle(opened);
        } catch (err) {
          addWinningsRef.current(stake);
          setPlayError(err instanceof Error ? err.message : 'Could not place');
          setRound(null);
          roundRef.current = null;
          setPhase('idle');
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
        try {
          const continued = continueRound(current, pick, entry);
          roundRef.current = continued;
          setRound(continued);
          setPhase('awaiting_tick');
          await awaitAndSettle(continued);
        } catch (err) {
          setPlayError(err instanceof Error ? err.message : 'Could not continue');
          busyRef.current = false;
        }
      }
    },
    [
      awaitAndSettle,
      balance,
      liveDigit,
      placeBet,
      pricing,
      selectedIndex,
      stake,
    ],
  );

  const onCashOut = useCallback(() => {
    const current = roundRef.current;
    if (!current || phaseRef.current !== 'decision') return;
    try {
      const cashed = cashOut(current);
      const stakeUsdt = centsToUsdt(cashed.initial_stake_cents);
      const pot = centsToUsdt(cashed.pot_cents);
      addWinningsRef.current(pot);
      const res: DigitLadderResult = {
        outcome: 'WON',
        potUsdt: pot,
        stakeUsdt,
        netPL: pot - stakeUsdt,
        rungs: rungCount(cashed),
        cashOut: true,
        lastDigit: cashed.face_digit,
      };
      roundRef.current = cashed;
      setRound(cashed);
      setResult(res);
      setPhase('settled');
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
    setRevealDigit(null);
    setPhase('idle');
  }, []);

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
    liveDigit,
    liveQuote: latestTick?.quote ?? null,
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
  };
}
