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
  compareReasonLabel,
  dealDealerFace,
  dealerAction,
  hold,
  isSideOffered,
  lockPlayerPick,
  openRound,
  payoutCents,
  payoutMultiplier,
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

/** Rail steps for the VS board. */
export type DigitDeltaStepId = 'build' | 'hold' | 'dealer' | 'result';

export interface DigitDeltaResult {
  outcome: 'WON' | 'LOST' | 'REFUNDED';
  payoutUsdt: number;
  stakeUsdt: number;
  netPL: number;
  playerLen: number;
  dealerLen: number;
  delta: number;
  settleReason: string;
  /** Why the round ended (bust/win detail). */
  reasonLabel: string | null;
  /** Last compare digits for bust display, e.g. "4 → 4". */
  compareLine: string | null;
  pickLabel: string | null;
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
  reasonLabel: string;
}

export interface PendingCall {
  side: 'player' | 'dealer';
  pick: DigitDeltaPick | DealerAction;
  face: number;
}

const HISTORY_CAP = 50;
const DEALER_PACE_MS = 420;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function phaseToStepId(phase: DigitDeltaPhase, pLen: number): DigitDeltaStepId {
  switch (phase) {
    case 'need_draw':
    case 'drawing':
    case 'ready':
    case 'awaiting_player_tick':
      return 'build';
    case 'player_decision':
      return pLen >= 2 ? 'hold' : 'build';
    case 'awaiting_dealer_face':
    case 'awaiting_dealer_tick':
      return 'dealer';
    case 'settled':
      return 'result';
    default:
      return 'build';
  }
}

function formatDealerBanner(
  face: number | null,
  action: DealerAction | null,
): string | null {
  if (face === null || action === null) return null;
  if (action === 'stand') return `Face ${face} · Stand`;
  if (action === 'higher') return `Face ${face} · must Higher`;
  return `Face ${face} · must Lower`;
}

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
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(null);
  const lastCompareRef = useRef<SettleCompare | null>(null);

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

  const pLen = round ? playerLen(round) : tableDigit !== null ? 1 : 0;
  const dLen = round ? round.dealer_digits.length : 0;
  const holdAllowed = round ? canHold(round) : false;

  const higherOffered = faceDigit !== null && isSideOffered('higher', faceDigit);
  const lowerOffered = faceDigit !== null && isSideOffered('lower', faceDigit);

  const stepId = useMemo(
    () => phaseToStepId(phase, pLen),
    [phase, pLen],
  );

  const liveDelta = useMemo(() => {
    if (phase === 'awaiting_dealer_face') return pLen; // dealer not dealt yet
    if (
      phase === 'awaiting_dealer_tick' ||
      phase === 'settled' ||
      (round && round.dealer_digits.length > 0)
    ) {
      return pLen - dLen;
    }
    if (phase === 'player_decision' && pLen >= 2) {
      // Pre-dealer: assume dealer could stop at 1
      return pLen - 1;
    }
    return null;
  }, [phase, pLen, dLen, round]);

  const stakeCentsForProjection = round
    ? round.initial_stake_cents
    : usdtToCents(stake);

  const projectedPayoutUsdt = useMemo(() => {
    if (liveDelta === null || liveDelta <= 0) return 0;
    return centsToUsdt(
      payoutCents(stakeCentsForProjection, liveDelta, DEFAULT_PAY_TABLE),
    );
  }, [liveDelta, stakeCentsForProjection]);

  const holdHint = useMemo(() => {
    if (pLen < 2) return null;
    const deltaIfDealerOne = pLen - 1;
    if (deltaIfDealerOne <= 0) return null;
    const mult = payoutMultiplier(deltaIfDealerOne, DEFAULT_PAY_TABLE);
    return `If dealer stops at 1 → Δ${deltaIfDealerOne} pays ${mult}×`;
  }, [pLen]);

  const dealerFaceDigit =
    round && round.dealer_digits.length > 0
      ? round.dealer_digits[round.dealer_digits.length - 1]!
      : null;

  const dealerBanner = useMemo(() => {
    if (phase === 'awaiting_dealer_face') return 'Dealer face incoming…';
    if (phase === 'settled' && result) {
      if (result.outcome === 'WON') return `You lead by Δ${result.delta}`;
      if (result.outcome === 'REFUNDED') return 'Lengths tied · stake back';
      if (result.settleReason === 'player_bust') return 'Streak busted';
      return 'Dealer outran you';
    }
    return formatDealerBanner(dealerFaceDigit, dealerChip);
  }, [phase, dealerFaceDigit, dealerChip, result]);

  const payLegend = useMemo(
    () =>
      DEFAULT_PAY_TABLE.slice(1).map((mult, i) => ({
        delta:
          i + 1 >= DEFAULT_PAY_TABLE.length - 1 ? `${i + 1}+` : String(i + 1),
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
    setPendingCall(null);
    lastCompareRef.current = null;
  }, []);

  const finishRound = useCallback(
    (next: DigitDeltaRound) => {
      const stakeUsdt = centsToUsdt(next.initial_stake_cents);
      const payoutUsdt = centsToUsdt(next.payout_cents);
      if (next.status === 'WON' || next.status === 'REFUNDED') {
        addWinningsRef.current(payoutUsdt);
      }
      const sd = next.settlement_data;
      const settleReason = sd?.settle_reason ?? 'player_bust';
      const last = lastCompareRef.current;
      let reasonLabel: string | null = null;
      let compareLine: string | null = null;
      let pickLabel: string | null = null;

      if (settleReason === 'player_bust' && last) {
        reasonLabel = last.reasonLabel;
        compareLine = `${last.entryDigit} → ${last.settlementDigit}`;
        pickLabel =
          last.pick === 'higher'
            ? 'Higher'
            : last.pick === 'lower'
              ? 'Lower'
              : String(last.pick);
      } else if (settleReason === 'length_win') {
        reasonLabel = `You ${sd?.player_len ?? 0} · Dealer ${sd?.dealer_len ?? 0}`;
        compareLine = null;
        pickLabel = null;
      } else if (settleReason === 'length_tie') {
        reasonLabel = 'Same length · stake back';
      } else if (settleReason === 'length_loss') {
        reasonLabel = `You ${sd?.player_len ?? 0} · Dealer ${sd?.dealer_len ?? 0}`;
      }

      const res: DigitDeltaResult = {
        outcome: next.status as DigitDeltaResult['outcome'],
        payoutUsdt,
        stakeUsdt,
        netPL: payoutUsdt - stakeUsdt,
        playerLen: sd?.player_len ?? playerLen(next),
        dealerLen: sd?.dealer_len ?? next.dealer_digits.length,
        delta: sd?.delta ?? 0,
        settleReason,
        reasonLabel,
        compareLine,
        pickLabel,
      };
      setRound(next);
      roundRef.current = next;
      setResult(res);
      setPendingCall(null);
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
        setSettleCompare(null);
        setPendingCall(null);
        await sleep(DEALER_PACE_MS);

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
          await sleep(DEALER_PACE_MS);
          finishRound(next);
          return;
        }

        while (next.status === 'OPEN' && next.phase === 'awaiting_dealer_tick') {
          setPhase('awaiting_dealer_tick');
          phaseRef.current = 'awaiting_dealer_tick';
          const pending = next.pending_dealer_action;
          const faceBefore = next.dealer_digits[next.dealer_digits.length - 1]!;
          if (pending === 'higher' || pending === 'lower') {
            setDealerChip(pending);
            setPendingCall({ side: 'dealer', pick: pending, face: faceBefore });
          }
          await sleep(DEALER_PACE_MS);

          const tick = await getNextTick();
          const face = next.dealer_digits[next.dealer_digits.length - 1]!;
          const pick = next.pending_dealer_action as DigitDeltaPick;
          const won = stepWins(pick, face, tick.lastDigit);
          const compare: SettleCompare = {
            entryDigit: face,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'dealer',
            reasonLabel: compareReasonLabel(pick, face, tick.lastDigit, won, 'dealer'),
          };
          lastCompareRef.current = compare;
          setSettleCompare(compare);
          setPendingCall(null);
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
            setPendingCall(null);
          }
        }

        if (next.status !== 'OPEN') {
          await sleep(DEALER_PACE_MS);
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
          setPendingCall({ side: 'player', pick, face: entry });
          setPhase('awaiting_player_tick');
          phaseRef.current = 'awaiting_player_tick';

          const tick = await getNextTick();
          const won = stepWins(pick, entry, tick.lastDigit);
          const compare: SettleCompare = {
            entryDigit: entry,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'player',
            reasonLabel: compareReasonLabel(pick, entry, tick.lastDigit, won, 'player'),
          };
          lastCompareRef.current = compare;
          setSettleCompare(compare);
          setPendingCall(null);
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
          setPendingCall(null);
          setPhase('ready');
          phaseRef.current = 'ready';
          busyRef.current = false;
        }
        return;
      }

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
          setPendingCall({ side: 'player', pick, face: entry });
          setPhase('awaiting_player_tick');
          phaseRef.current = 'awaiting_player_tick';

          const tick = await getNextTick();
          const won = stepWins(pick, entry, tick.lastDigit);
          const compare: SettleCompare = {
            entryDigit: entry,
            settlementDigit: tick.lastDigit,
            pick,
            won,
            side: 'player',
            reasonLabel: compareReasonLabel(pick, entry, tick.lastDigit, won, 'player'),
          };
          lastCompareRef.current = compare;
          setSettleCompare(compare);
          setPendingCall(null);
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
          setPendingCall(null);
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

  const headline = useMemo(() => {
    switch (phase) {
      case 'need_draw':
        return 'Draw to start';
      case 'drawing':
        return 'Drawing face…';
      case 'ready':
        return 'Build your streak';
      case 'awaiting_player_tick':
        return 'Next tick settles your call';
      case 'player_decision':
        return pLen >= 2 ? 'Hold to lock length' : 'Build your streak';
      case 'awaiting_dealer_face':
      case 'awaiting_dealer_tick':
        return "Dealer's turn";
      case 'settled':
        if (result?.outcome === 'WON') return `You lead by Δ${result.delta}`;
        if (result?.outcome === 'REFUNDED') return 'Push';
        return 'Round over';
      default:
        return 'Digit Delta';
    }
  }, [phase, pLen, result]);

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
    pendingCall,
    dealerChip,
    dealerBanner,
    playerDigits:
      round?.player_digits ?? (tableDigit !== null ? [tableDigit] : []),
    dealerDigits: round?.dealer_digits ?? [],
    pLen,
    dLen,
    liveDelta,
    projectedPayoutUsdt,
    holdHint,
    stepId,
    headline,
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
