'use client';

import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import {
  CELL_COUNT,
  evaluateGrid,
  GRID_SIZE,
  assignRowSymbol,
  resolveGamble,
} from '@/lib/games/digit-slots';
import type {
  DerivSymbol,
  DigitSlotsPhase,
  GridSpinResult,
  ParsedTick,
  SlotGridCells,
  SlotRowSymbols,
} from '@/types';

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
  grid: SlotGridCells;
  result: GridSpinResult | null;
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
  | { type: 'CELL_LAND'; index: number; digit: number }
  | { type: 'SPIN_COMPLETE'; result: GridSpinResult; bank: number }
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

const EMPTY_GRID: SlotGridCells = [null, null, null, null, null, null, null, null, null];

export const DEFAULT_ROW_SYMBOLS: SlotRowSymbols = ['1HZ100V', '1HZ75V', '1HZ50V'];

const INITIAL_STATE: SlotState = {
  phase: 'idle',
  stake: 100,
  grid: EMPTY_GRID,
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
        grid: EMPTY_GRID,
        result: null,
        bank: 0,
        gambleRound: 0,
        gambleDigit: null,
        error: null,
      };
    }

    case 'CELL_LAND': {
      if (state.phase !== 'spinning') return state;
      if (action.index < 0 || action.index >= CELL_COUNT) return state;
      const grid = [...state.grid] as SlotGridCells;
      grid[action.index] = action.digit;
      return { ...state, grid };
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
      if (state.phase !== 'awaitingResume' && state.phase !== 'result') {
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
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const [rowSymbols, setRowSymbolsState] = useState<SlotRowSymbols>(DEFAULT_ROW_SYMBOLS);

  // Three independent feeds — one per row. Gamble uses row 0.
  const getNextTick0 = useNextTick(rowSymbols[0]);
  const getNextTick1 = useNextTick(rowSymbols[1]);
  const getNextTick2 = useNextTick(rowSymbols[2]);
  const nextTickByRow = [getNextTick0, getNextTick1, getNextTick2] as const;

  const { ticks } = useTickStream(rowSymbols[0]);

  const [state, dispatch] = useReducer(slotReducer, INITIAL_STATE);

  const [highlightedTicks, setHighlightedTicks] = useState<ParsedTick[]>([]);
  const [lastConsumedTick, setLastConsumedTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const nextTickByRowRef = useRef(nextTickByRow);
  nextTickByRowRef.current = nextTickByRow;

  const spinningRef = useRef(false);

  const setRowSymbol = useCallback((row: number, symbol: DerivSymbol) => {
    setRowSymbolsState((prev) => assignRowSymbol(prev, row, symbol));
  }, []);

  const recordTick = useCallback((tick: ParsedTick) => {
    setLastConsumedTick(tick);
    setExtractionKey((k) => k + 1);
    setHighlightedTicks((prev) => [...prev, tick]);
  }, []);

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

    const stake = s.stake;
    const getters = nextTickByRowRef.current;
    const digits: number[] = new Array(CELL_COUNT).fill(-1);

    try {
      // Fill each row in parallel: 3 sequential ticks per row feed (~3s wall clock).
      await Promise.all(
        [0, 1, 2].map(async (row) => {
          const getNext = getters[row];
          for (let col = 0; col < GRID_SIZE; col++) {
            const tick = await getNext();
            recordTick(tick);
            const index = row * GRID_SIZE + col;
            digits[index] = tick.lastDigit;
            dispatch({ type: 'CELL_LAND', index, digit: tick.lastDigit });
          }
        }),
      );

      const result = evaluateGrid(digits, stake);
      const bank = result.totalPayout > 0 ? result.totalPayout : 0;
      dispatch({ type: 'SPIN_COMPLETE', result, bank });
    } catch {
      addWinnings(stake);
      dispatch({ type: 'ERROR', message: 'Connection issue — check your stream and try again.' });
    } finally {
      spinningRef.current = false;
    }
  }, [placeBet, addWinnings, recordTick]);

  /** Gamble resolves on the next tick from row 0's feed. */
  const performGamble = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== 'result' && s.phase !== 'gambleWon') return;
    if (s.bank <= 0 || s.gambleRound >= MAX_GAMBLE_ROUNDS) return;

    dispatch({ type: 'GAMBLE' });

    try {
      const tick = await nextTickByRowRef.current[0]();
      recordTick(tick);
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
  }, [recordTick]);

  const cashOut = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'result' && s.phase !== 'gambleWon') return;
    if (s.bank > 0) {
      addWinnings(s.bank);
    }
    dispatch({ type: 'CASH_OUT' });
  }, [addWinnings]);

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

  const setStake = useCallback((value: number) => {
    dispatch({ type: 'SET_STAKE', value });
  }, []);

  useEffect(() => {
    const { phase, session, result } = stateRef.current;
    if (!session) return;

    const isLossInSession = phase === 'result' && (result?.totalMultiplier ?? 0) <= 0;

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

  useEffect(() => {
    if (state.phase === 'gambleLost' && state.session) {
      dispatch({ type: 'SESSION_PAUSE' });
    }
  }, [state.phase, state.session]);

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
    rowSymbols,
    setRowSymbol,
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
