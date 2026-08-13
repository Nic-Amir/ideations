'use strict';

export interface DerivTick {
  epoch: number;
  quote: string;
  symbol: string;
  pip_size: number;
}

function inferPipSize(quote: string): number {
  const dotIdx = quote.indexOf('.');
  return dotIdx === -1 ? 0 : quote.length - dotIdx - 1;
}

export function normalizePipSize(raw: { quote: string; pip_size?: number }): number {
  return raw.pip_size ?? inferPipSize(raw.quote);
}

export interface ParsedTick extends DerivTick {
  lastDigit: number;
  numericQuote: number;
  timestamp: Date;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type DerivSymbol =
  | '1HZ100V'
  | '1HZ75V'
  | '1HZ50V'
  | '1HZ25V'
  | '1HZ10V';

export interface SymbolInfo {
  id: DerivSymbol;
  name: string;
  tickFreq: string;
  description: string;
}

export const SUPPORTED_SYMBOLS: SymbolInfo[] = [
  { id: '1HZ100V', name: 'Volatility 100 (1s)', tickFreq: '1 sec', description: 'High volatility, 1-second ticks' },
  { id: '1HZ75V', name: 'Volatility 75 (1s)', tickFreq: '1 sec', description: 'Medium-high volatility, 1-second ticks' },
  { id: '1HZ50V', name: 'Volatility 50 (1s)', tickFreq: '1 sec', description: 'Medium volatility, 1-second ticks' },
  { id: '1HZ25V', name: 'Volatility 25 (1s)', tickFreq: '1 sec', description: 'Low-medium volatility, 1-second ticks' },
  { id: '1HZ10V', name: 'Volatility 10 (1s)', tickFreq: '1 sec', description: 'Low volatility, 1-second ticks' },
];

/** Synthetic Index Ascent instruments (house-rounded N for labeled growth). */
export type CrashSymbol = 'ASCENT1' | 'ASCENT5' | 'ASCENT10';

export interface CrashSymbolInfo {
  id: CrashSymbol;
  name: string;
  /** Average ticks between crash events (house-rounded N). */
  avgTicksPerCrash: number;
  /** Advertised per-survived-tick growth rate used for M(k)=(1+g)^k. */
  growthRate: number;
  description: string;
}

export const CRASH_SYMBOLS: CrashSymbolInfo[] = [
  {
    id: 'ASCENT1',
    name: 'Ascent 1%',
    avgTicksPerCrash: 100,
    growthRate: 0.01,
    description: 'Grows 1% per survived tick — crashes about every 100 ticks',
  },
  {
    id: 'ASCENT5',
    name: 'Ascent 5%',
    avgTicksPerCrash: 20,
    growthRate: 0.05,
    description: 'Grows 5% per survived tick — crashes about every 20 ticks',
  },
  {
    id: 'ASCENT10',
    name: 'Ascent 10%',
    avgTicksPerCrash: 10,
    growthRate: 0.1,
    description: 'Grows 10% per survived tick — crashes about every 10 ticks',
  },
];

export type IndexAscentState = 'idle' | 'flying' | 'cashed_out' | 'crashed';

export type DigitCollectState = 'idle' | 'collecting' | 'cashed_out' | 'knocked_out';

export type DigitPokerState = 'idle' | 'dealt' | 'drawing' | 'evaluated';

export type DigitSlotsPhase = 'idle' | 'spinning' | 'result';

export type PlinkoRisk = 'low' | 'medium' | 'high';

export type PlinkoState = 'idle' | 'dropping' | 'landed';

export type HandRank =
  | 'five_of_a_kind'
  | 'four_of_a_kind'
  | 'full_house'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'one_pair'
  | 'high_card';

export interface HandResult {
  rank: HandRank;
  label: string;
  multiplier: number;
}

export type SlotOutcome = 'triple_seven' | 'triple' | 'pair' | 'sequential' | 'none';

export interface SlotResult {
  outcome: SlotOutcome;
  label: string;
  multiplier: number;
  digits: [number, number, number];
}

export type PaylineId =
  | 'row0'
  | 'row1'
  | 'row2'
  | 'col0'
  | 'col1'
  | 'col2'
  | 'diagMain'
  | 'diagAnti';

export interface LineResult {
  paylineId: PaylineId;
  paylineName: string;
  indices: [number, number, number];
  digits: [number, number, number];
  outcome: SlotOutcome;
  outcomeLabel: string;
  multiplier: number;
  payout: number;
}

export type SlotGridDigits = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type SlotGridCells = [
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export type SlotRowSymbols = [DerivSymbol, DerivSymbol, DerivSymbol];

export interface GridSpinResult {
  grid: SlotGridDigits;
  lines: LineResult[];
  totalPayout: number;
  totalMultiplier: number;
}

export type GameIconKey =
  | 'index-ascent'
  | 'digit-collect'
  | 'digit-poker'
  | 'digit-slots'
  | 'volatility-run'
  | 'barrier-race'
  | 'barrier-predictor'
  | 'barrier-touch'
  | 'synthetic-derby'
  | 'digit-derby'
  | 'corridor'
  | 'digit-ladder'
  | 'digit-delta';

export type GameTrack = 'roadmap' | 'other';

export interface GameInfo {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  shortPitch: string;
  category: string;
  risk: 'Low' | 'Medium' | 'High';
  sessionLength: string;
  mechanics: string;
  marketSource: string;
  status: 'Live' | 'Preview';
  track: GameTrack;
  iconKey: GameIconKey;
  comingSoon?: boolean;
}
