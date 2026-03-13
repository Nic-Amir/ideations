'use client';

import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import { evaluateSpin, resolveGamble } from '@/lib/games/digit-slots';
import type { SlotResult, ParsedTick, DigitSlotsPhase } from '@/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SlotSession {
  total: number;
  completed: number;
  startBalance: number;
}

export interface SlotState {
  phase: DigitSlotsPhase;
  stake: number;
  reels: [number | null, number | null, number | null];
  result: SlotResult | null;
  bank: number;
  gambleRound: number;
  gambleDigit: number | null;
  error: string | null;
  session: SlotSession | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type SlotAction =
  | { type: 'SPIN' }
  | { type: 'REEL_LAND'; index: number; digit: number }
  | { type: 'SPIN_COMPLETE'; result: SlotResult; bank: number }
  | { type: 'GAMBLE' }
  | { type: 'GAMBLE_WON'; digit: number; newBank: number }
  | { type: 'GAMBLE_LOST'; digit: number }
  | { type: 'CASH_OUT' }
  | { type: 'SET_STAKE'; value: number }
  | { type: 'START_SESSION'; total: number; startBalance: number }
  | { type: 'CONTINUE_SESSION' }
  | { type: 'STOP_SESSION' }
  | { type: 'SESSION_PAUSE' }
  | { type: 'DISMISS' }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: SlotState = {
  phase: 'idle',
  stake: 100,
  reels: [null, null, null],
  result: null,
  bank: 0,
  gambleRound: 0,
  gambleDigit: null,
  error: null,
  session: null,
};

// ---------------------------------------------------------------------------
// Reducer — pure, synchronous, no side-effects
// ---------------------------------------------------------------------------

function bumpSession(s: SlotSession | null): SlotSession | null {
  if (!s) return null;
  return { ...s, completed: s.completed + 1 };
}

function slotReducer(state: SlotState, action: SlotAction): SlotState {
  switch (action.type) {
    case 'SPIN': {
      if (
        state.phase !== 'idle' &&
        state.phase !== 'result' &&
        state.phase !== 'gambleLost' &&
        state.phase !== 'awaitingResume'
      ) {
        return state;
      }
      return {
        ...state,
        phase: 'spinning',
        reels: [null, null, null],
        result: null,
        bank: 0,
        gambleRound: 0,
        gambleDigit: null,
        error: null,
      };
    }

    case 'REEL_LAND': {
      if (state.phase !== 'spinning') return state;
      const reels = [...state.reels] as [number | null, number | null, number | null];
      reels[action.index] = action.digit;
      return { ...state, reels };
    }

    case 'SPIN_COMPLETE': {
      if (state.phase !== 'spinning') return state;
      return {
        ...state,
        phase: 'result',
        result: action.result,
        bank: action.bank,
        session: bumpSession(state.session),
      };
    }

    case 'GAMBLE': {
      if (state.phase !== 'result' && state.phase !== 'gambleWon') return state;
      if (state.bank <= 0) return state;
      return { ...state, phase: 'gambling' };
    }

    case 'GAMBLE_WON': {
      if (state.phase !== 'gambling') return state;
      return {
        ...state,
        phase: 'gambleWon',
        gambleDigit: action.digit,
        bank: action.newBank,
        gambleRound: state.gambleRound + 1,
      };
    }

    case 'GAMBLE_LOST': {
      if (state.phase !== 'gambling') return state;
      return {
        ...state,
        phase: 'gambleLost',
        gambleDigit: action.digit,
        bank: 0,
      };
    }

    case 'CASH_OUT': {
      if (state.phase !== 'result' && state.phase !== 'gambleWon') return state;
      if (state.session) {
        return { ...state, phase: 'awaitingResume', bank: 0 };
      }
      return { ...INITIAL_STATE, stake: state.stake };
    }

    case 'SESSION_PAUSE': {
      if (state.phase !== 'gambleLost') return state;
      if (!state.session) return state;
      return { ...state, phase: 'awaitingResume' };
    }

    case 'CONTINUE_SESSION': {
      if (state.phase !== 'awaitingResume') return state;
      return state;
    }

    case 'STOP_SESSION': {
      if (
        state.phase !== 'awaitingResume' &&
        state.phase !== 'result'
      ) {
        return state;
      }
      return { ...state, phase: 'sessionComplete' };
    }

    case 'DISMISS': {
      if (state.phase !== 'sessionComplete') return state;
      return { ...INITIAL_STATE, stake: state.stake };
    }

    case 'SET_STAKE': {
      if (state.phase !== 'idle') return state;
      return { ...state, stake: action.value };
    }

    case 'START_SESSION': {
      if (state.phase !== 'idle') return state;
      return {
        ...state,
        session: {
          total: action.total,
          completed: 0,
          startBalance: action.startBalance,
        },
      };
    }

    case 'ERROR': {
      return {
        ...INITIAL_STATE,
        stake: state.stake,
        session: state.session,
        error: action.message,
      };
    }

    case 'RESET': {
      return { ...INITIAL_STATE, stake: state.stake };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MAX_GAMBLE_ROUNDS = 5;
const AUTO_CONTINUE_DELAY_MS = 1_500;

export function useDigitSlots() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [state, dispatch] = useReducer(slotReducer, INITIAL_STATE);

  const [highlightedTicks, setHighlightedTicks] = useState<ParsedTick[]>([]);
  const [lastConsumedTick, setLastConsumedTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const spinningRef = useRef(false);

  // -- helpers ---------------------------------------------------------------

  const consumeTick = useCallback(
    async () => {
      const tick = await getNextTick();
      setLastConsumedTick(tick);
      setExtractionKey((k) => k + 1);
      setHighlightedTicks((prev) => [...prev, tick]);
      return tick;
    },
    [getNextTick],
  );

  // -- performSpin -----------------------------------------------------------

  const performSpin = useCallback(async () => {
    if (spinningRef.current) return;

    const s = stateRef.current;
    if (
      s.phase !== 'idle' &&
      s.phase !== 'result' &&
      s.phase !== 'gambleLost' &&
      s.phase !== 'awaitingResume'
    ) {
      return;
    }

    if (s.session && s.session.completed >= s.session.total) {
      dispatch({ type: 'STOP_SESSION' });
      return;
    }

    if (!placeBet(s.stake)) {
      if (s.session) {
        dispatch({ type: 'STOP_SESSION' });
      }
      return;
    }

    spinningRef.current = true;
    dispatch({ type: 'SPIN' });
    setHighlightedTicks([]);

    try {
      const digits: number[] = [];
      for (let i = 0; i < 3; i++) {
        const tick = await consumeTick();
        digits.push(tick.lastDigit);
        dispatch({ type: 'REEL_LAND', index: i, digit: tick.lastDigit });
      }

      const result = evaluateSpin(digits[0], digits[1], digits[2]);
      const bank = result.multiplier > 0 ? s.stake * result.multiplier : 0;
      dispatch({ type: 'SPIN_COMPLETE', result, bank });
    } catch {
      addWinnings(s.stake);
      dispatch({ type: 'ERROR', message: 'Connection issue — check your stream and try again.' });
    } finally {
      spinningRef.current = false;
    }
  }, [placeBet, addWinnings, consumeTick]);

  // -- performGamble ---------------------------------------------------------

  const performGamble = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== 'result' && s.phase !== 'gambleWon') return;
    if (s.bank <= 0 || s.gambleRound >= MAX_GAMBLE_ROUNDS) return;

    dispatch({ type: 'GAMBLE' });

    try {
      const tick = await consumeTick();
      const digit = tick.lastDigit;
      const won = resolveGamble(digit);

      if (won) {
        dispatch({ type: 'GAMBLE_WON', digit, newBank: s.bank * 2 });
      } else {
        dispatch({ type: 'GAMBLE_LOST', digit });
      }
    } catch {
      dispatch({ type: 'ERROR', message: 'Connection issue — try again.' });
    }
  }, [consumeTick]);

  // -- cashOut ---------------------------------------------------------------

  const cashOut = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'result' && s.phase !== 'gambleWon') return;
    if (s.bank > 0) {
      addWinnings(s.bank);
    }
    dispatch({ type: 'CASH_OUT' });
  }, [addWinnings]);

  // -- session controls ------------------------------------------------------

  const startSession = useCallback(
    (total: number) => {
      dispatch({ type: 'START_SESSION', total, startBalance: balance });
    },
    [balance],
  );

  const continueSession = useCallback(() => {
    dispatch({ type: 'CONTINUE_SESSION' });
    void performSpin();
  }, [performSpin]);

  const stopSession = useCallback(() => {
    dispatch({ type: 'STOP_SESSION' });
  }, []);

  const dismissSummary = useCallback(() => {
    dispatch({ type: 'DISMISS' });
  }, []);

  // -- simple dispatchers ----------------------------------------------------

  const setStake = useCallback((value: number) => {
    dispatch({ type: 'SET_STAKE', value });
  }, []);

  // -- auto-continue on loss during session ----------------------------------

  useEffect(() => {
    const { phase, session, result } = stateRef.current;
    if (!session) return;

    const isLossInSession =
      phase === 'result' && (result?.multiplier ?? 0) <= 0;

    if (!isLossInSession) return;

    if (session.completed >= session.total) {
      dispatch({ type: 'STOP_SESSION' });
      return;
    }

    const timer = setTimeout(() => {
      void performSpin();
    }, AUTO_CONTINUE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [state.phase, state.session?.completed, performSpin]);

  // -- auto-transition gambleLost → awaitingResume in session ----------------

  useEffect(() => {
    if (state.phase === 'gambleLost' && state.session) {
      dispatch({ type: 'SESSION_PAUSE' });
    }
  }, [state.phase, state.session]);

  // -- auto-start first spin when session is created -------------------------

  const prevSessionRef = useRef<SlotSession | null>(null);
  useEffect(() => {
    if (state.session && !prevSessionRef.current && state.phase === 'idle') {
      void performSpin();
    }
    prevSessionRef.current = state.session;
  }, [state.session, state.phase, performSpin]);

  return {
    state,
    balance,
    performSpin,
    performGamble,
    cashOut,
    continueSession,
    stopSession,
    dismissSummary,
    setStake,
    startSession,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
  };
}
