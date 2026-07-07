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

export type DigitCollectState = 'idle' | 'collecting' | 'cashed_out' | 'knocked_out';

export type DigitPokerState = 'idle' | 'dealt' | 'drawing' | 'evaluated';

export type DigitSlotsPhase =
  | 'idle'
  | 'spinning'
  | 'result'
  | 'gambling'
  | 'gambleWon'
  | 'gambleLost'
  | 'awaitingResume'
  | 'sessionComplete';

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

export type GameIconKey =
  | 'digit-collect'
  | 'digit-poker'
  | 'digit-slots'
  | 'volatility-run'
  | 'barrier-race'
  | 'barrier-predictor'
  | 'barrier-touch'
  | 'synthetic-derby';

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
