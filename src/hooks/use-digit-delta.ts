'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import type { ParsedTick } from '@/types';
import {
  DEFAULT_PAY_TABLE,
  canHold,
  centsToUsdt,
  dealDealerFace,
  dealerAction,
  hold,
  isSideOffered,
  lockPlayerPick,
  openRound,
  playerFace,
  playerLen,
  settleDealerTick,
  settlePlayerTick,
  stepWins,
  usdtToCents,
  type DealerAction,
  type DigitDeltaPick,
  type DigitDeltaRound,
} from '@/lib/games/digit-delta';

export type DigitDeltaPhase =
  | 'need_draw'
  | 'drawing'
  | 'ready'
  | 'player_decision'
  | 'awaiting_player_tick'
  | 'awaiting_dealer_face'
  | 'awaiting_dealer_tick'
  | 'settled';

export interface DigitDeltaResult {
  outcome: 'WON' | 'LOST' | 'REFUNDED';
  payoutUsdt: number;
  stakeUsdt: number;
  netPL: number;
  playerLen: number;
  dealerLen: number;
  delta: number;
  settleReason: string;
}

export interface DigitDeltaHistoryEntry {
  outcome: 'WON' | 'LOST' | 'REFUNDED';
  payoutUsdt: number;
  stakeUsdt: number;
  delta: number;
}

export interface SettleCompare {
  entryDigit: number;
  settlementDigit: number;
  pick: DigitDeltaPick | DealerAction;
  won: boolean;
  side: 'player' | 'dealer';
}

const HISTORY_CAP = 50;

export function useDigitDelta() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { latestTick, ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [stake, setStake] = useState(100);
  const [phase, setPhase] = useState<DigitDeltaPhase>('need_draw');
  const [round, setRound] = useState<DigitDeltaRound | null>(null);
  const [result, setResult] = useState<DigitDeltaResult | null>(null);
  const [history, setHistory] = useState<DigitDeltaHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [revealDigit, setRevealDigit] = useState<number | null>(null);
  const [tableDigit, setTableDigit] = useState<number | null>(null);
  const [tableTick, setTableTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);
  const [settleCompare, setSettleCompare] = useState<SettleCompare | null>(null);
  const [dealerChip, setDealerChip] = useState<DealerAction | null>(null);

  const phaseRef = useRef<DigitDeltaPhase>('need_draw');
  const roundRef = useRef<DigitDeltaRound | null>(null);
  const busyRef = useRef(false);
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

  const faceDigit =
    round && phase !== 'need_draw' && phase !== 'drawing' && phase !== 'ready'
      ? playerFace(round)
      : tableDigit;

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade =
    phase === 'ready' &&
    tableDigit !== null &&
    marketReady &&
    !busyRef.current &&
    balance >= stake;

  const pLen = round ? playerLen(round) : 0;
  const dLen = round ? round.dealer_digits.length : 0;
  const holdAllowed = round ? canHold(round) : false;

  const higherOffered = faceDigit !== null && isSideOffered('higher', faceDigit);
  const lowerOffered = faceDigit !== null && isSideOffered('lower', faceDigit);

  const payLegend = useMemo(
    () =>
      DEFAULT_PAY_TABLE.slice(1).map((mult, i) => ({
        delta: i + 1 >= DEFAULT_PAY_TABLE.length - 1 ? `${i + 1}+` : String(i + 1),
        mult,
      })),
    [],
  );

  const pushHistory = useCallback((entry: DigitDeltaHistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_CAP));
  }, []);

  const clearTable = useCallback(() => {
    setTableDigit(null);
    tableDigitRef.current = null;
    setTableTick(null);
    setRevealDigit(null);
    setSettleCompare(null);
    setDealerChip(null);
  }, []);

  const finishRound = useCallback(
    (next: DigitDeltaRound) => {
      const stakeUsdt = centsToUsdt(next.initial_stake_cents);
      const payoutUsdt = centsToUsdt(next.payout_cents);
      if (next.status === 'WON' || next.status === 'REFUNDED') {
        addWinningsRef.current(payoutUsdt);
      }
      const sd = next.settlement_data;
      const res: DigitDeltaResult = {
        outcome: next.status as DigitDeltaResult['outcome'],
        payoutUsdt,
        stakeUsdt,
        netPL: payoutUsdt - stakeUsdt,
        playerLen: sd?.player_len ?? playerLen(next),
        dealerLen: sd?.dealer_len ?? next.dealer_digits.length,
        delta: sd?.delta ?? 0,
        settleReason: sd?.settle_reason ?? 'player_bust',
      };
      setRound(next);
      roundRef.current = next;
      setResult(res);
      setPhase('settled');
      phaseRef.current = 'settled';
      pushHistory({
        outcome: res.outcome,
        payoutUsdt,
        stakeUsdt,
        delta: res.delta,
      });
      busyRef.current = false;
    },
    [pushHistory],
  );

  const runDealerPhase = useCallback(
    async (current: DigitDeltaRound) => {
      try {
        setPhase('awaiting_dealer_face');
        phaseRef.current = 'awaiting_dealer_face';
        setDealerChip(null);
        const faceTick = await getNextTick();
        setRevealDigit(faceTick.lastDigit);
        setExtractionKey((k) => k + 1);
        setTableDigit(faceTick.lastDigit);
        tableDigitRef.current = faceTick.lastDigit;
        setTableTick(faceTick);

        const action = dealerAction(faceTick.lastDigit);
        setDealerChip(action);

        let next = dealDealerFace(current, faceTick.lastDigit, {
          quote: faceTick.quote,
          epoch: faceTick.epoch,
        });
        roundRef.current = next;
        setRound(next);

        if (next.status !== 'OPEN') {
          finishRound(next);
          return;
        }

        while (next.status === 'OPEN' && next.phase === 'awaiting_dealer_tick') {
          setPhase('awaiting_dealer_tick');
          phaseRef.current = 'awaiting_dealer_tick';
          const pending = next.pending_dealer_action;
          if (pending === 'higher' || pending === 'lower') {
            setDealerChip(pending);
          }
          const tick = await getNextTick();
          const face = next.dealer_digits[next.dealer_digits.length - 1]!;
          const pick = next.pending_dealer_action as DigitDeltaPick;
          const won = stepWins(pick, face, tick.lastDigit);
          setSettleCompare({
            entryDigit: face,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'dealer',
          });
          setRevealDigit(tick.lastDigit);
          setExtractionKey((k) => k + 1);
          setTableDigit(tick.lastDigit);
          tableDigitRef.current = tick.lastDigit;
          setTableTick(tick);

          next = settleDealerTick(next, tick.lastDigit, {
            quote: tick.quote,
            epoch: tick.epoch,
          });
          roundRef.current = next;
          setRound(next);

          if (next.dealer_stop_reason === 'stand_on_5') {
            setDealerChip('stand');
          }
        }

        if (next.status !== 'OPEN') {
          finishRound(next);
        }
      } catch {
        setPlayError('Tick timed out — stake refunded');
        const open = roundRef.current;
        if (open && open.status === 'OPEN') {
          addWinningsRef.current(centsToUsdt(open.initial_stake_cents));
        }
        setRound(null);
        roundRef.current = null;
        setPhase('need_draw');
        phaseRef.current = 'need_draw';
        clearTable();
        busyRef.current = false;
      }
    },
    [clearTable, finishRound, getNextTick],
  );

  const drawFace = useCallback(async () => {
    if (busyRef.current) return;
    const ph = phaseRef.current;
    if (ph !== 'need_draw' && ph !== 'ready' && ph !== 'settled') return;
    if (!marketReady) {
      setPlayError('Waiting for ticks');
      return;
    }

    busyRef.current = true;
    setPlayError(null);
    setSettleCompare(null);
    setResult(null);
    setRound(null);
    roundRef.current = null;
    setDealerChip(null);
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
      setPlayError('Tick timed out — tap Draw to start');
      setPhase('need_draw');
      phaseRef.current = 'need_draw';
      clearTable();
    } finally {
      busyRef.current = false;
    }
  }, [clearTable, getNextTick, marketReady]);

  useEffect(() => {
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

  const placePick = useCallback(
    async (pick: DigitDeltaPick) => {
      if (busyRef.current) return;
      setPlayError(null);
      setSettleCompare(null);

      // First stake + pick from ready
      if (phaseRef.current === 'ready') {
        const entry = tableDigitRef.current;
        if (entry === null) {
          setPlayError('Draw a face digit first');
          return;
        }
        if (!isSideOffered(pick, entry)) {
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
          let opened = openRound({
            stakeCents: usdtToCents(stake),
            faceDigit: entry,
            instrument: selectedIndex,
          });
          opened = lockPlayerPick(opened, pick);
          roundRef.current = opened;
          setRound(opened);
          setPhase('awaiting_player_tick');
          phaseRef.current = 'awaiting_player_tick';

          const tick = await getNextTick();
          const won = stepWins(pick, entry, tick.lastDigit);
          setSettleCompare({
            entryDigit: entry,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'player',
          });
          setRevealDigit(tick.lastDigit);
          setExtractionKey((k) => k + 1);
          setTableDigit(tick.lastDigit);
          tableDigitRef.current = tick.lastDigit;
          setTableTick(tick);

          const settled = settlePlayerTick(opened, tick.lastDigit, {
            quote: tick.quote,
            epoch: tick.epoch,
          });
          roundRef.current = settled;
          setRound(settled);

          if (settled.status !== 'OPEN') {
            finishRound(settled);
            return;
          }

          setPhase('player_decision');
          phaseRef.current = 'player_decision';
          busyRef.current = false;
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

      // Continue collecting
      if (phaseRef.current === 'player_decision') {
        const current = roundRef.current;
        if (!current) return;
        const entry = playerFace(current);
        if (!isSideOffered(pick, entry)) {
          setPlayError('That side is not offered on this digit');
          return;
        }

        busyRef.current = true;
        setRevealDigit(null);
        try {
          const locked = lockPlayerPick(current, pick);
          roundRef.current = locked;
          setRound(locked);
          setPhase('awaiting_player_tick');
          phaseRef.current = 'awaiting_player_tick';

          const tick = await getNextTick();
          const won = stepWins(pick, entry, tick.lastDigit);
          setSettleCompare({
            entryDigit: entry,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'player',
          });
          setRevealDigit(tick.lastDigit);
          setExtractionKey((k) => k + 1);
          setTableDigit(tick.lastDigit);
          tableDigitRef.current = tick.lastDigit;
          setTableTick(tick);

          const settled = settlePlayerTick(locked, tick.lastDigit, {
            quote: tick.quote,
            epoch: tick.epoch,
          });
          roundRef.current = settled;
          setRound(settled);

          if (settled.status !== 'OPEN') {
            finishRound(settled);
            return;
          }

          setPhase('player_decision');
          phaseRef.current = 'player_decision';
          busyRef.current = false;
        } catch (err) {
          setPlayError(err instanceof Error ? err.message : 'Could not continue');
          busyRef.current = false;
        }
      }
    },
    [balance, finishRound, getNextTick, placeBet, selectedIndex, stake],
  );

  const onHold = useCallback(async () => {
    const current = roundRef.current;
    if (!current || phaseRef.current !== 'player_decision') return;
    if (!canHold(current)) {
      setPlayError('Collect at least one digit before Hold');
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setPlayError(null);
    setSettleCompare(null);
    try {
      const held = hold(current);
      roundRef.current = held;
      setRound(held);
      await runDealerPhase(held);
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Hold failed');
      busyRef.current = false;
    }
  }, [runDealerPhase]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setRound(null);
    roundRef.current = null;
    clearTable();
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
    extractionKey,
    settleCompare,
    dealerChip,
    playerDigits: round?.player_digits ?? (tableDigit !== null ? [tableDigit] : []),
    dealerDigits: round?.dealer_digits ?? [],
    pLen,
    dLen,
    holdAllowed,
    higherOffered,
    lowerOffered,
    payLegend,
    balance,
    maxStake,
    marketReady,
    canTrade,
    placePick,
    onHold,
    dismissResult,
    drawFace,
  };
}
