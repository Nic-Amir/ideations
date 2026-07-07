'use strict';

import type { GameInfo } from '@/types';

export const GAMES: GameInfo[] = [
  {
    slug: 'digit-collect',
    name: 'Digit Sync',
    shortName: 'Sync',
    description: 'Collect unique digits from live ticks and decide when to lock in your multiplier before a duplicate digit knocks you out.',
    shortPitch: 'Push a rising multiplier by collecting unique live-market digits.',
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
    description: 'Video poker built from digits 0-9. Deal from live ticks, hold strategically, and draw into the pay table.',
    shortPitch: 'A decision-heavy hold-and-draw game driven by live tick digits.',
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
    description: 'A 3-reel slot machine powered by live-market digits, with autoplay and an optional double-or-nothing gamble round.',
    shortPitch: 'Fast reel spins, clear outcomes, and a follow-up gamble option.',
    category: 'Arcade',
    risk: 'Medium',
    sessionLength: '10-45 sec',
    mechanics: 'Spin three live digits, evaluate the line, then collect or gamble.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    track: 'other',
    iconKey: 'digit-slots',
  },
  {
    slug: 'volatility-plinko',
    name: 'Volatility Plinko',
    shortName: 'Plinko',
    description: 'Generate a simulated volatility path, watch the trajectory unfold, and get paid based on where the final move lands.',
    shortPitch: 'A price-path simulator with asymmetric payout bands and risk presets.',
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
      'Two simulated assets race toward a shared price barrier. Pick which one touches the target first and collect the offered multiplier.',
    shortPitch: 'A first-to-touch race between steady drift and wild volatility.',
    category: 'Race',
    risk: 'Medium',
    sessionLength: '5-30 sec',
    mechanics: 'Select Drift or Vol and watch the correlated paths race to the barrier — or play cash-out mode and sell your position mid-race at the live price.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    track: 'roadmap',
    iconKey: 'barrier-race',
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
