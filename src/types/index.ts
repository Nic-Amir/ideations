'use strict';

export interface DerivTick {
  epoch: number;
  quote: string;
  symbol: string;
  pip_size: number;
}

export interface ParsedTick extends DerivTick {
  lastDigit: number;
  numericQuote: number;
  timestamp: Date;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type DerivSymbol = 'R_100' | 'R_50' | 'R_25' | 'R_10' | 'frxBTCUSD';

export interface SymbolInfo {
  id: DerivSymbol;
  name: string;
  tickFreq: string;
  description: string;
}

export const SUPPORTED_SYMBOLS: SymbolInfo[] = [
  { id: 'R_100', name: 'Volatility 100', tickFreq: '~1 sec', description: 'High volatility synthetic' },
  { id: 'R_50', name: 'Volatility 50', tickFreq: '~1 sec', description: 'Medium volatility synthetic' },
  { id: 'R_25', name: 'Volatility 25', tickFreq: '~1 sec', description: 'Low-medium volatility' },
  { id: 'R_10', name: 'Volatility 10', tickFreq: '~1 sec', description: 'Low volatility synthetic' },
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

export type GameIconKey = 'digit-collect' | 'digit-poker' | 'digit-slots' | 'volatility-run';

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
  accent: 'emerald' | 'violet' | 'amber' | 'cyan';
  iconKey: GameIconKey;
  comingSoon?: boolean;
}
