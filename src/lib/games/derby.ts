'use strict';

/**
 * Synthetic Derby — 16 virtual horses, each a synthetic GBM asset starting at
 * the same price. After T ticks the finish order is the ranking of terminal
 * prices. Bets: Winner, Place (top 3), Couple, Trio and Quinté (each ordered
 * or unordered).
 *
 * Pricing is exact and deterministic: terminal log-prices are independent
 * normals with parameters known at card time, so every event probability
 * reduces to 1D quadrature on a shared grid —
 * - Winner:  P(i wins) = ∫ φ_i(x) · ∏_{j≠i} Φ_j(x) dx
 * - Place:   P(i top 3) = ∫ φ_i(x) · P(≤2 others above x) dx, with the inner
 *   term a Poisson-binomial DP over the other 15 horses
 * - Ordered sequences: chained suffix integrals over the grid, one level per
 *   picked horse, closing with the product of the remaining CDFs
 * - Unordered: sum of the ordered probability over permutations (2/6/120)
 *
 * POC NOTE: odds are FAIR (mult = 1/p, EV = 0). The platform's 3% commission
 * convention is intentionally not applied yet — flip `COMMISSION` when this
 * graduates from proof of concept.
 */

export const HORSE_COUNT = 16;

export type BetMode = 'winner' | 'place' | 'couple' | 'trio' | 'quinte';

export interface BetModeSpec {
  id: BetMode;
  label: string;
  picks: number;
  /** Whether the mode has an ordered variant (winner/place do not). */
  orderable: boolean;
  tag: string;
}

export const BET_MODES: BetModeSpec[] = [
  { id: 'winner', label: 'Winner', picks: 1, orderable: false, tag: 'First past the post' },
  { id: 'place', label: 'Place', picks: 1, orderable: false, tag: 'Top 3 finish' },
  { id: 'couple', label: 'Couple', picks: 2, orderable: true, tag: 'Top 2' },
  { id: 'trio', label: 'Trio', picks: 3, orderable: true, tag: 'Top 3' },
  { id: 'quinte', label: 'Quinté', picks: 5, orderable: true, tag: 'Top 5' },
];

export function getBetModeSpec(id: BetMode): BetModeSpec {
  return BET_MODES.find((m) => m.id === id) ?? BET_MODES[0];
}

export interface DerbyConfig {
  s0: number;
  /** Race length in ticks. */
  ticks: number;
  /** Base per-tick log-return volatility. */
  baseVolPerTick: number;
  /** Per-horse vol multiplier range. */
  volMultRange: [number, number];
  /** Per-horse per-tick log drift range. */
  driftRange: [number, number];
  /** POC: fair odds. Set to 0.03 to adopt the platform margin later. */
  commission: number;
}

export const DERBY_CONFIG: DerbyConfig = {
  s0: 100,
  ticks: 24,
  baseVolPerTick: 0.012,
  volMultRange: [0.7, 1.45],
  driftRange: [-0.0012, 0.0012],
  commission: 0,
};

/** Reveal pacing: one race tick shown every 250 ms (~6 s race). */
export const DERBY_TICK_MS = 250;
export const DERBY_SETTLE_MS = 900;
/** Last quarter of the race gets the final-stretch treatment. */
export const FINAL_STRETCH_FRACTION = 0.75;
export const SLIDING_WINDOW_SIZE = 100;

export const HORSE_NAMES = [
  'Comet',
  'Volatility Queen',
  'Drift King',
  'Sigma Star',
  'Mean Reversion',
  'Fat Tail',
  'Black Swan',
  'Alpha Seeker',
  'Momentum',
  'Long Gamma',
  'Theta Burn',
  'Random Walk',
  'Sharpe Shooter',
  'Kelly Bet',
  'Martingale',
  'Vega Storm',
] as const;

/** Silks palette — distinct hues, readable on the dark card surface. */
export const HORSE_SILKS = [
  '#f43f5e',
  '#fb923c',
  '#facc15',
  '#a3e635',
  '#34d399',
  '#2dd4bf',
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
  '#fbbf24',
] as const;

export type FormTag = 'Front-runner' | 'Erratic' | 'Steady' | 'Stalker' | 'Outsider';

export interface Horse {
  /** Stable index 0..15 — also the tie-break and saddlecloth number. */
  index: number;
  name: string;
  silks: string;
  /** Per-tick log drift. */
  drift: number;
  /** Per-tick log volatility. */
  vol: number;
  /** Terminal log-price mean over the whole race. */
  terminalMean: number;
  /** Terminal log-price standard deviation over the whole race. */
  terminalStd: number;
  form: FormTag;
}

export interface RaceCard {
  id: string;
  horses: Horse[];
  ticks: number;
  /** P(horse i wins), exact. */
  winProbs: number[];
  /** P(horse i finishes top 3), exact. */
  placeProbs: number[];
  /** Fair winner odds per horse (display board). */
  winOdds: number[];
  /** Fair place odds per horse. */
  placeOdds: number[];
}

// --- Randomness ------------------------------------------------------------

function cryptoUniform(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] + 0.5) / 0x100000000;
}

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// --- Normal distribution ------------------------------------------------------

/** Zelen & Severo approximation (A&S 26.2.17), |error| < 7.5e-8. */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// --- Race card ------------------------------------------------------------------

function formTag(drift: number, vol: number, config: DerbyConfig): FormTag {
  const driftSpan = config.driftRange[1] - config.driftRange[0];
  const volSpan = config.volMultRange[1] - config.volMultRange[0];
  const driftPos = (drift - config.driftRange[0]) / driftSpan;
  const volPos = (vol / config.baseVolPerTick - config.volMultRange[0]) / volSpan;

  if (driftPos > 0.72) return 'Front-runner';
  if (volPos > 0.75) return 'Erratic';
  if (volPos < 0.25) return 'Steady';
  if (driftPos < 0.28) return 'Outsider';
  return 'Stalker';
}

export interface HorseParams {
  drift: number;
  vol: number;
}

/**
 * Draws a fresh race card: 16 horses with random drift/vol from calibrated
 * ranges (or explicit params for tests), plus the exact win/place tables.
 */
export function createRaceCard(
  config: DerbyConfig = DERBY_CONFIG,
  explicitParams?: HorseParams[],
): RaceCard {
  const horses: Horse[] = [];
  for (let i = 0; i < HORSE_COUNT; i++) {
    const drift =
      explicitParams?.[i]?.drift ??
      config.driftRange[0] + cryptoUniform() * (config.driftRange[1] - config.driftRange[0]);
    const vol =
      explicitParams?.[i]?.vol ??
      config.baseVolPerTick *
        (config.volMultRange[0] +
          cryptoUniform() * (config.volMultRange[1] - config.volMultRange[0]));

    horses.push({
      index: i,
      name: HORSE_NAMES[i],
      silks: HORSE_SILKS[i],
      drift,
      vol,
      terminalMean: config.ticks * drift,
      terminalStd: vol * Math.sqrt(config.ticks),
      form: formTag(drift, vol, config),
    });
  }

  const winProbs = horses.map((h) => orderedProbability(horses, [h.index]));
  const placeProbs = placeProbabilities(horses);

  return {
    id: crypto.randomUUID(),
    horses,
    ticks: config.ticks,
    winProbs,
    placeProbs,
    winOdds: winProbs.map((p) => fairOdds(p, config)),
    placeOdds: placeProbs.map((p) => fairOdds(p, config)),
  };
}

// --- Quadrature grid ---------------------------------------------------------------

// Midpoint quadrature is second order; 2000 cells over the ±7σ field range
// keeps the total discretization bias under ~1e-5 — far below the 2dp
// rounding applied to the offered odds.
const GRID_CELLS = 2000;

interface Grid {
  /** Cell centers in terminal log-price space. */
  centers: Float64Array;
  /** Per-horse probability mass in each cell (CDF differences). */
  mass: Float64Array[];
  /** Per-horse CDF at each cell center. */
  cdf: Float64Array[];
}

const gridCache = new WeakMap<Horse[], Grid>();

function buildGrid(horses: Horse[]): Grid {
  const cached = gridCache.get(horses);
  if (cached) return cached;

  let lo = Infinity;
  let hi = -Infinity;
  for (const h of horses) {
    lo = Math.min(lo, h.terminalMean - 7 * h.terminalStd);
    hi = Math.max(hi, h.terminalMean + 7 * h.terminalStd);
  }
  const step = (hi - lo) / GRID_CELLS;

  const centers = new Float64Array(GRID_CELLS);
  for (let k = 0; k < GRID_CELLS; k++) centers[k] = lo + (k + 0.5) * step;

  const mass = horses.map((h) => {
    const arr = new Float64Array(GRID_CELLS);
    for (let k = 0; k < GRID_CELLS; k++) {
      const a = (lo + k * step - h.terminalMean) / h.terminalStd;
      const b = (lo + (k + 1) * step - h.terminalMean) / h.terminalStd;
      arr[k] = normCdf(b) - normCdf(a);
    }
    return arr;
  });

  const cdf = horses.map((h) => {
    const arr = new Float64Array(GRID_CELLS);
    for (let k = 0; k < GRID_CELLS; k++) {
      arr[k] = normCdf((centers[k] - h.terminalMean) / h.terminalStd);
    }
    return arr;
  });

  const grid: Grid = { centers, mass, cdf };
  gridCache.set(horses, grid);
  return grid;
}

// --- Exact probabilities --------------------------------------------------------------

/**
 * P(sequence[0] finishes 1st, sequence[1] 2nd, …, and every non-picked horse
 * finishes below the last picked one). Chained suffix integrals: each level k
 * turns A_{k−1} (probability weight of the higher-placed picks being above y)
 * into A_k via one pass down the grid; the final level closes with the
 * product of the remaining horses' CDFs. Trapezoid-style half-cell terms keep
 * the discretization bias second order.
 */
export function orderedProbability(horses: Horse[], sequence: number[]): number {
  const grid = buildGrid(horses);
  const n = GRID_CELLS;

  // A[k] after level t: P(picks 0..t placed in order, all above cell k's price).
  let above: Float64Array | null = null;

  for (let t = 0; t < sequence.length - 1; t++) {
    const m = grid.mass[sequence[t]];
    const next = new Float64Array(n);
    let acc = 0;
    for (let k = n - 1; k >= 0; k--) {
      const cellTerm = above === null ? m[k] : m[k] * above[k];
      next[k] = acc + 0.5 * cellTerm;
      acc += cellTerm;
    }
    above = next;
  }

  const last = sequence[sequence.length - 1];
  const mLast = grid.mass[last];
  const inSeq = new Set(sequence);

  let p = 0;
  for (let k = 0; k < n; k++) {
    let w = above === null ? mLast[k] : mLast[k] * above[k];
    if (w === 0) continue;
    for (const h of horses) {
      if (inSeq.has(h.index)) continue;
      w *= grid.cdf[h.index][k];
      if (w === 0) break;
    }
    p += w;
  }
  return p;
}

/** P(the picked set occupies the top positions, any order). */
export function unorderedProbability(horses: Horse[], picks: number[]): number {
  let total = 0;
  for (const perm of permutations(picks)) {
    total += orderedProbability(horses, perm);
  }
  return total;
}

/**
 * P(horse i finishes in the top 3), for all horses in one grid sweep.
 * Inner term is a Poisson-binomial DP over the other 15 horses, tracking
 * only the 0/1/2-others-above states.
 */
export function placeProbabilities(horses: Horse[]): number[] {
  const grid = buildGrid(horses);
  const n = GRID_CELLS;
  const result = new Array<number>(horses.length).fill(0);

  for (const h of horses) {
    const m = grid.mass[h.index];
    let p = 0;
    for (let k = 0; k < n; k++) {
      if (m[k] === 0) continue;
      // DP over others: probability that exactly 0, 1 or 2 finish above x_k.
      let c0 = 1;
      let c1 = 0;
      let c2 = 0;
      for (const other of horses) {
        if (other.index === h.index) continue;
        const q = 1 - grid.cdf[other.index][k];
        c2 = c2 * (1 - q) + c1 * q;
        c1 = c1 * (1 - q) + c0 * q;
        c0 = c0 * (1 - q);
      }
      p += m[k] * (c0 + c1 + c2);
    }
    result[h.index] = p;
  }
  return result;
}

export function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) {
      out.push([items[i], ...perm]);
    }
  }
  return out;
}

// --- Odds & bet pricing ------------------------------------------------------------

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** POC: fair odds (commission = 0), floored at 1.01×. */
export function fairOdds(p: number, config: DerbyConfig = DERBY_CONFIG): number {
  if (p <= 0) return 0;
  return Math.max(1.01, round2((1 - config.commission) / p));
}

export interface DerbyPick {
  mode: BetMode;
  ordered: boolean;
  /** Horse indices; order matters when `ordered`. */
  horses: number[];
}

export interface PickPricing {
  probability: number;
  multiplier: number;
}

const exoticCache = new Map<string, PickPricing>();

/** Probability and fair multiplier for any pick on a card (memo per card). */
export function pricePick(
  card: RaceCard,
  pick: DerbyPick,
  config: DerbyConfig = DERBY_CONFIG,
): PickPricing {
  if (pick.mode === 'winner') {
    const p = card.winProbs[pick.horses[0]];
    return { probability: p, multiplier: card.winOdds[pick.horses[0]] };
  }
  if (pick.mode === 'place') {
    const p = card.placeProbs[pick.horses[0]];
    return { probability: p, multiplier: card.placeOdds[pick.horses[0]] };
  }

  const key = `${card.id}|${pick.mode}|${pick.ordered ? 'o' : 'u'}|${pick.horses.join(',')}`;
  const cached = exoticCache.get(key);
  if (cached) return cached;

  const p = pick.ordered
    ? orderedProbability(card.horses, pick.horses)
    : unorderedProbability(card.horses, pick.horses);
  const pricing: PickPricing = { probability: p, multiplier: fairOdds(p, config) };

  // Bounded memo — cards churn every race.
  if (exoticCache.size > 500) exoticCache.clear();
  exoticCache.set(key, pricing);
  return pricing;
}

// --- Race simulation & settlement -----------------------------------------------------

export interface RacePath {
  /** prices[horse][tick], tick 0 = start (all equal s0). */
  prices: number[][];
  /** ranks[tick] = horse indices ordered 1st → 16th at that tick. */
  ranks: number[][];
  /** Final finish order, horse indices 1st → 16th. */
  finishOrder: number[];
}

function rankAt(prices: number[][], tick: number): number[] {
  const order = Array.from({ length: prices.length }, (_, i) => i);
  // Ties broken by horse index (measure-zero for continuous prices).
  order.sort((a, b) => prices[b][tick] - prices[a][tick] || a - b);
  return order;
}

/** Pre-generates the full race at bet time; the reveal loop replays it. */
export function generateRacePath(
  card: RaceCard,
  config: DerbyConfig = DERBY_CONFIG,
): RacePath {
  const T = card.ticks;
  const prices: number[][] = card.horses.map(() => [config.s0]);

  for (const h of card.horses) {
    let logP = Math.log(config.s0);
    for (let t = 1; t <= T; t++) {
      logP += h.drift + h.vol * boxMullerTransform();
      prices[h.index].push(Math.exp(logP));
    }
  }

  const ranks: number[][] = [];
  for (let t = 0; t <= T; t++) ranks.push(rankAt(prices, t));

  return { prices, ranks, finishOrder: ranks[T] };
}

export type DerbyOutcome = 'win' | 'lose';

export interface DerbySettlement {
  outcome: DerbyOutcome;
  payout: number;
  multiplier: number;
}

export function settleBet(
  pick: DerbyPick,
  finishOrder: number[],
  stake: number,
  multiplier: number,
): DerbySettlement {
  const spec = getBetModeSpec(pick.mode);
  let won = false;

  if (pick.mode === 'winner') {
    won = finishOrder[0] === pick.horses[0];
  } else if (pick.mode === 'place') {
    won = finishOrder.slice(0, 3).includes(pick.horses[0]);
  } else {
    const top = finishOrder.slice(0, spec.picks);
    won = pick.ordered
      ? pick.horses.every((h, i) => top[i] === h)
      : pick.horses.length === top.length && pick.horses.every((h) => top.includes(h));
  }

  return {
    outcome: won ? 'win' : 'lose',
    payout: won ? Math.round(stake * multiplier) : 0,
    multiplier: won ? multiplier : 0,
  };
}

// --- Monte Carlo validation (tests) ----------------------------------------------------

export interface DerbyMonteCarloResult {
  winFreq: number[];
  placeFreq: number[];
  /** Frequency of a specific ordered couple (first two finishers exact). */
  coupleFreq: (i: number, j: number) => number;
  trioUnorderedFreq: (picks: number[]) => number;
  quinteOrderedFreq: (picks: number[]) => number;
}

/**
 * Samples n terminal outcomes directly from the normal terminal
 * distributions (no path needed) and tabulates event frequencies.
 */
export function monteCarloDerby(card: RaceCard, n: number): DerbyMonteCarloResult {
  const H = card.horses.length;
  const winCounts = new Array<number>(H).fill(0);
  const placeCounts = new Array<number>(H).fill(0);
  const coupleCounts = new Map<string, number>();
  const trioCounts = new Map<string, number>();
  const quinteCounts = new Map<string, number>();

  const terminal = new Array<number>(H).fill(0);
  const order = Array.from({ length: H }, (_, i) => i);

  for (let s = 0; s < n; s++) {
    for (const h of card.horses) {
      terminal[h.index] = h.terminalMean + h.terminalStd * boxMullerTransform();
    }
    order.sort((a, b) => terminal[b] - terminal[a] || a - b);

    winCounts[order[0]]++;
    placeCounts[order[0]]++;
    placeCounts[order[1]]++;
    placeCounts[order[2]]++;

    const coupleKey = `${order[0]},${order[1]}`;
    coupleCounts.set(coupleKey, (coupleCounts.get(coupleKey) ?? 0) + 1);

    const trioKey = order
      .slice(0, 3)
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    trioCounts.set(trioKey, (trioCounts.get(trioKey) ?? 0) + 1);

    const quinteKey = order.slice(0, 5).join(',');
    quinteCounts.set(quinteKey, (quinteCounts.get(quinteKey) ?? 0) + 1);
  }

  return {
    winFreq: winCounts.map((c) => c / n),
    placeFreq: placeCounts.map((c) => c / n),
    coupleFreq: (i, j) => (coupleCounts.get(`${i},${j}`) ?? 0) / n,
    trioUnorderedFreq: (picks) =>
      (trioCounts.get(
        picks
          .slice()
          .sort((a, b) => a - b)
          .join(','),
      ) ?? 0) / n,
    quinteOrderedFreq: (picks) => (quinteCounts.get(picks.join(',')) ?? 0) / n,
  };
}
