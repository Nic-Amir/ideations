'use client';

import { useReducer, useCallback, useRef, useState } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import {
  CELL_COUNT,
  evaluateGrid,
  GRID_SIZE,
  assignRowSymbol,
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

export interface SlotRowFeed {
  symbol: DerivSymbol;
  ticks: ParsedTick[];
  highlightedTicks: ParsedTick[];
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
}

export interface SlotState {
  phase: DigitSlotsPhase;
  stake: number;
  grid: SlotGridCells;
  result: GridSpinResult | null;
  error: string | null;
}

type SlotAction =
  | { type: 'SPIN' }
  | { type: 'CELL_LAND'; index: number; digit: number }
  | { type: 'SPIN_COMPLETE'; result: GridSpinResult }
  | { type: 'SET_STAKE'; value: number }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

const EMPTY_GRID: SlotGridCells = [null, null, null, null, null, null, null, null, null];

export const DEFAULT_ROW_SYMBOLS: SlotRowSymbols = ['1HZ100V', '1HZ75V', '1HZ50V'];

const INITIAL_STATE: SlotState = {
  phase: 'idle',
  stake: 100,
  grid: EMPTY_GRID,
  result: null,
  error: null,
};

function slotReducer(state: SlotState, action: SlotAction): SlotState {
  switch (action.type) {
    case 'SPIN': {
      if (state.phase !== 'idle' && state.phase !== 'result') return state;
      return {
        ...state,
        phase: 'spinning',
        grid: EMPTY_GRID,
        result: null,
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
      };
    }

    case 'SET_STAKE': {
      if (state.phase === 'spinning') return state;
      return { ...state, stake: action.value };
    }

    case 'ERROR': {
      return {
        ...INITIAL_STATE,
        stake: state.stake,
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

type RowFeedMeta = {
  highlightedTicks: ParsedTick[];
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
};

const EMPTY_FEED_META: RowFeedMeta = {
  highlightedTicks: [],
  lastConsumedTick: null,
  extractionKey: 0,
};

export function useDigitSlots() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const [rowSymbols, setRowSymbolsState] = useState<SlotRowSymbols>(DEFAULT_ROW_SYMBOLS);

  const getNextTick0 = useNextTick(rowSymbols[0]);
  const getNextTick1 = useNextTick(rowSymbols[1]);
  const getNextTick2 = useNextTick(rowSymbols[2]);
  const nextTickByRow = [getNextTick0, getNextTick1, getNextTick2] as const;

  const stream0 = useTickStream(rowSymbols[0]);
  const stream1 = useTickStream(rowSymbols[1]);
  const stream2 = useTickStream(rowSymbols[2]);
  const streams = [stream0, stream1, stream2] as const;

  const [state, dispatch] = useReducer(slotReducer, INITIAL_STATE);
  const [rowFeedMeta, setRowFeedMeta] = useState<RowFeedMeta[]>([
    EMPTY_FEED_META,
    EMPTY_FEED_META,
    EMPTY_FEED_META,
  ]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const nextTickByRowRef = useRef(nextTickByRow);
  nextTickByRowRef.current = nextTickByRow;

  const spinningRef = useRef(false);

  const setRowSymbol = useCallback((row: number, symbol: DerivSymbol) => {
    setRowSymbolsState((prev) => assignRowSymbol(prev, row, symbol));
  }, []);

  const recordRowTick = useCallback((row: number, tick: ParsedTick) => {
    setRowFeedMeta((prev) => {
      const next = [...prev];
      const cur = next[row] ?? EMPTY_FEED_META;
      next[row] = {
        highlightedTicks: [...cur.highlightedTicks, tick],
        lastConsumedTick: tick,
        extractionKey: cur.extractionKey + 1,
      };
      return next;
    });
  }, []);

  const clearRowHighlights = useCallback(() => {
    setRowFeedMeta([EMPTY_FEED_META, EMPTY_FEED_META, EMPTY_FEED_META]);
  }, []);

  const performSpin = useCallback(async () => {
    if (spinningRef.current) return;

    const s = stateRef.current;
    if (s.phase !== 'idle' && s.phase !== 'result') return;

    if (!placeBet(s.stake)) return;

    spinningRef.current = true;
    dispatch({ type: 'SPIN' });
    clearRowHighlights();

    const stake = s.stake;
    const getters = nextTickByRowRef.current;
    const digits: number[] = new Array(CELL_COUNT).fill(-1);

    try {
      await Promise.all(
        [0, 1, 2].map(async (row) => {
          const getNext = getters[row];
          for (let col = 0; col < GRID_SIZE; col++) {
            const tick = await getNext();
            recordRowTick(row, tick);
            const index = row * GRID_SIZE + col;
            digits[index] = tick.lastDigit;
            dispatch({ type: 'CELL_LAND', index, digit: tick.lastDigit });
          }
        }),
      );

      const result = evaluateGrid(digits, stake);
      if (result.totalPayout > 0) {
        addWinnings(result.totalPayout);
      }
      dispatch({ type: 'SPIN_COMPLETE', result });
    } catch {
      addWinnings(stake);
      dispatch({ type: 'ERROR', message: 'Connection issue — check your stream and try again.' });
    } finally {
      spinningRef.current = false;
    }
  }, [placeBet, addWinnings, recordRowTick, clearRowHighlights]);

  const setStake = useCallback((value: number) => {
    dispatch({ type: 'SET_STAKE', value });
  }, []);

  const rowFeeds: SlotRowFeed[] = [0, 1, 2].map((row) => ({
    symbol: rowSymbols[row],
    ticks: streams[row].ticks,
    highlightedTicks: rowFeedMeta[row]?.highlightedTicks ?? [],
    lastConsumedTick: rowFeedMeta[row]?.lastConsumedTick ?? null,
    extractionKey: rowFeedMeta[row]?.extractionKey ?? 0,
  }));

  const marketReady = rowFeeds.some((f) => f.ticks.length > 0 || f.lastConsumedTick !== null);

  return {
    state,
    balance,
    rowSymbols,
    setRowSymbol,
    performSpin,
    setStake,
    rowFeeds,
    marketReady,
  };
}
