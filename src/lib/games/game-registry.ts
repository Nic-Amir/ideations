'use strict';

import type { GameInfo } from '@/types';

export const GAMES: GameInfo[] = [
  {
    slug: 'digit-collect',
    name: 'Digit Collect',
    shortName: 'Collect',
    description: 'Collect unique digits from live ticks and decide when to lock in your multiplier before a duplicate digit knocks you out.',
    shortPitch: 'Push a rising multiplier by collecting unique live-market digits.',
    category: 'Survival',
    risk: 'High',
    sessionLength: '30-90 sec',
    mechanics: 'Draw unique digits, monitor knockout risk, cash out on your timing.',
    marketSource: 'Deriv live ticks',
    status: 'Live',
    accent: 'emerald',
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
    accent: 'violet',
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
    accent: 'amber',
    iconKey: 'digit-slots',
  },
  {
    slug: 'volatility-plinko',
    name: 'Volatility Run',
    shortName: 'Vol Run',
    description: 'Generate a simulated volatility path, watch the trajectory unfold, and get paid based on where the final move lands.',
    shortPitch: 'A price-path simulator with asymmetric payout bands and risk presets.',
    category: 'Simulation',
    risk: 'High',
    sessionLength: '20-60 sec',
    mechanics: 'Choose risk, generate a run, and settle on the terminal move zone.',
    marketSource: 'Client-side simulation',
    status: 'Live',
    accent: 'cyan',
    iconKey: 'volatility-run',
  },
];

export function getGameBySlug(slug: string) {
  return GAMES.find((game) => game.slug === slug);
}
