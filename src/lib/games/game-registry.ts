'use strict';

import type { GameInfo } from '@/types';

export const GAMES: GameInfo[] = [
  {
    slug: 'index-ascent',
    name: 'Index Ascent',
    shortName: 'Ascent',
    description:
      'Watch a live Crash index climb tick by tick. Your multiplier grows as it rises — cash out before the index corrects.',
    shortPitch: 'Ride a rising Crash index. Cash out before it drops.',
    category: 'Momentum',
    risk: 'High',
    sessionLength: '10 sec - 5 min',
    mechanics:
      'Pick Crash 50/150/300, enter on any tick, and exit manually or at a target — an index correction closes the position.',
    marketSource: 'Deriv live ticks (Crash indices)',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'index-ascent',
  },
  {
    slug: 'digit-collect',
    name: 'Digit Sync',
    shortName: 'Sync',
    description:
      'Collect unique digits from live ticks. Your multiplier rises with each new digit — cash out before a duplicate ends the round.',
    shortPitch: 'Collect unique digits. Cash out before a repeat knocks you out.',
    category: 'Survival',
    risk: 'High',
    sessionLength: '30-90 sec',
    mechanics: 'Draw unique digits, monitor knockout risk, cash out on your timing.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'digit-collect',
  },
  {
    slug: 'digit-poker',
    name: 'Digit Poker',
    shortName: 'Poker',
    description:
      'Five digits from live ticks. Hold the strong ones, redraw the rest, and hit the pay table.',
    shortPitch: 'Hold and draw digits like video poker.',
    category: 'Strategy',
    risk: 'Medium',
    sessionLength: '45-120 sec',
    mechanics: 'Deal five digits, hold strong positions, and optimize the redraw.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'other',
    iconKey: 'digit-poker',
  },
  {
    slug: 'digit-slots',
    name: 'Digit Slots',
    shortName: 'Slots',
    description:
      'A 3×3 live-digit slot with one market feed per row, eight additive paylines, and automatic win credit.',
    shortPitch: 'Fill a 3×3 from three feeds. Multi-line wins credit instantly.',
    category: 'Arcade',
    risk: 'Medium',
    sessionLength: '10-45 sec',
    mechanics:
      'Pick three distinct feeds, fill a 3×3 in parallel, evaluate eight paylines, and credit wins automatically.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'other',
    iconKey: 'digit-slots',
  },
  {
    slug: 'volatility-plinko',
    name: 'Volatility Plinko',
    shortName: 'Plinko',
    description:
      'Simulate a volatility path, watch it fall through payout bands, and settle on where the final move lands.',
    shortPitch: 'Drop a price path. Get paid for where it lands.',
    category: 'Simulation',
    risk: 'High',
    sessionLength: '20-60 sec',
    mechanics: 'Drop a path and settle on the terminal move zone — start Simple, graduate to Split/Stripes with calls and sessions.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'volatility-run',
  },
  {
    slug: 'barrier-race',
    name: 'Barrier Race',
    shortName: 'Race',
    description:
      'Two simulated assets race to the same price barrier. Pick which one touches first and take the multiplier.',
    shortPitch: 'Two prices race to a barrier. Pick the winner.',
    category: 'Race',
    risk: 'Medium',
    sessionLength: '5-30 sec',
    mechanics: 'Select Drift or Vol and watch the correlated paths race to the barrier — or play cash-out mode and sell your position mid-race at the live price.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'barrier-race',
  },
  {
    slug: 'barrier-predictor',
    name: 'Barrier Predictor',
    shortName: 'Predictor',
    description:
      'A simulated price sits between an upper and lower barrier. Call which it touches first — no touch refunds your stake.',
    shortPitch: 'Price is trapped between two barriers. Call which one breaks first.',
    category: 'Prediction',
    risk: 'Medium',
    sessionLength: '5-15 sec',
    mechanics: 'Set duration and barrier distance, tap Upper or Lower, and watch the price race to a first touch — no touch refunds your stake.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'barrier-predictor',
  },
  {
    slug: 'barrier-touch',
    name: 'Barrier Touch',
    shortName: 'Touch',
    description:
      'Bet on touches, not direction. Count crossings of the entry line, or call a round trip: one barrier first, then the other.',
    shortPitch: 'Call how many times price crosses a line — or the order it hits both barriers.',
    category: 'Prediction',
    risk: 'Medium',
    sessionLength: '5-15 sec',
    mechanics: 'Pick Count mode and a crossing bucket (0/1/2/3+), or Sequence mode and a barrier order — then watch the touch events play out tick by tick.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'barrier-touch',
  },
  {
    slug: 'synthetic-derby',
    name: 'Synthetic Derby',
    shortName: 'Derby',
    description:
      'Sixteen simulated assets race to the highest final price. Bet Winner, Place, Couple, Trio, or Quinté at model odds.',
    shortPitch: 'Sixteen synthetic horses race. Bet the finish order.',
    category: 'Race',
    risk: 'High',
    sessionLength: '10-30 sec',
    mechanics: 'Read the odds board, build a bet from Winner up to an ordered Quinté, and watch the field race — the finish order is the ranking of final prices.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'other',
    iconKey: 'synthetic-derby',
  },
  {
    slug: 'digit-derby',
    name: 'Digit Derby',
    shortName: 'Digits',
    description:
      'Ten digits race on live ticks. Trade Outright, Top 3, Pair, Trio, Top 5, Spread (Long vs Short), or Margin (Photo / Wide / Blowout) — settle against the finish leaderboard.',
    shortPitch: 'Digit contracts including Spread and Margin on a live finish board.',
    category: 'Race',
    risk: 'Medium',
    sessionLength: '15-60 sec',
    mechanics:
      'Pick a contract, fill your ticket (digits or a margin threshold), open a position. Live ticks advance runners; first to the finish line ranks the board.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'other',
    iconKey: 'digit-derby',
  },
  {
    slug: 'corridor',
    name: 'Corridor',
    shortName: 'Corridor',
    description:
      'Stay in / Goes out over a fixed duration. Tap Inside or Outside on the time strip — live multipliers on the board. No-touch wins Stay; first barrier touch wins Goes. No mid-path cash-out.',
    shortPitch: 'Tap Inside or Outside on the strip. Stay wins on no-touch; Goes wins on first touch.',
    category: 'Barrier',
    risk: 'Medium',
    sessionLength: '5-20 sec',
    mechanics:
      'Stake equals notional. Fixed log-symmetric barriers for T ticks. Pick Stay in (no touch) or Goes out (first touch). Multipliers lock at place from discrete double-barrier odds.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'other',
    iconKey: 'corridor',
  },
  {
    slug: 'digit-ladder',
    name: 'Digit Ladder',
    shortName: 'Ladder',
    description:
      'Call Higher or Lower on the next tick’s last digit vs the face digit. Cash out after a win, or climb the ladder and parlay the whole pot.',
    shortPitch: 'Ride the next digit up or down. Cash out or climb the ladder.',
    category: 'Prediction',
    risk: 'Medium',
    sessionLength: '2-30 sec',
    mechanics:
      'Stake once. Strict Higher/Lower vs the live last digit; next tick settles. Wins roll into a parlay pot — cash out or continue. Ties bust.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'other',
    iconKey: 'digit-ladder',
  },
];

export const LIVE_GAMES = GAMES.filter((game) => game.status === 'Live');
export const ROADMAP_GAMES = GAMES.filter((game) => game.track === 'roadmap');
export const OTHER_GAMES = GAMES.filter((game) => game.track === 'other');

export function getGameBySlug(slug: string) {
  return GAMES.find((game) => game.slug === slug);
}

export function isGameLive(slug: string) {
  return LIVE_GAMES.some((game) => game.slug === slug);
}
