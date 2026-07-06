'use strict';

/**
 * Barrier Race — two correlated GBM assets race to touch a shared barrier first.
 *
 * Pricing constants are derived from the numerical grid engine in
 * trading-game/specs/products/barrier_race/product_spec.md (§5.2–5.5).
 * Monte Carlo validation lives in barrier-race.test.ts.
 */

export type AssetId = 'drift' | 'vol';

export type RaceOutcome = 'win' | 'lose' | 'tie' | 'timeout';

export interface BarrierRaceConfig {
  s0: number;
  barrier: number;
  mu: [number, number];
  sigma: [number, number];
  rho: number;
  dt: number;
  maxTicks: number;
  commission: number;
}

export const BARRIER_RACE_CONFIG: BarrierRaceConfig = {
  s0: 100,
  barrier: 102,
  mu: [0.002, 0.0007],
  sigma: [0.004, 0.006],
  rho: -0.5,
  dt: 1,
  maxTicks: 3000,
  commission: 0.03,
};

/** Grid-derived win probabilities (spec §5.5). */
export const GRID_PROBABILITIES = {
  drift: 0.6369,
  vol: 0.3535,
  tie: 0.0097,
  timeout: 0,
} as const;

export const ASSET_LABELS: Record<AssetId, { name: string; tag: string }> = {
  drift: { name: 'Drift', tag: 'Steady climber' },
  vol: { name: 'Vol', tag: 'Wild swinger' },
};

export const RACE_TICK_MS = 250;
export const RACE_SETTLE_MS = 600;
/** Cap on total reveal time — long races fast-forward instead of dragging. */
export const MAX_RACE_ANIM_MS = 15_000;
export const SLIDING_WINDOW_SIZE = 100;

export interface DerivedParams {
  drift: [number, number];
  vol: [number, number];
  logBarrier: number;
  logS0: [number, number];
}

export interface RacePath {
  prices1: number[];
  prices2: number[];
  hitTick1: number | null;
  hitTick2: number | null;
  winner: AssetId | 'tie' | 'timeout';
  settleTick: number;
}

export interface SettlementResult {
  outcome: RaceOutcome;
  payout: number;
  multiplier: number;
  winner: AssetId | 'tie' | 'timeout';
  settleTick: number;
}

export interface MonteCarloResult {
  pDrift: number;
  pVol: number;
  pTie: number;
  pTimeout: number;
  seDrift: number;
  seVol: number;
  seTie: number;
  seTimeout: number;
}

function boxMullerTransform(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function deriveParams(config: BarrierRaceConfig = BARRIER_RACE_CONFIG): DerivedParams {
  const drift: [number, number] = [
    (config.mu[0] - 0.5 * config.sigma[0] ** 2) * config.dt,
    (config.mu[1] - 0.5 * config.sigma[1] ** 2) * config.dt,
  ];
  const vol: [number, number] = [
    config.sigma[0] * Math.sqrt(config.dt),
    config.sigma[1] * Math.sqrt(config.dt),
  ];
  return {
    drift,
    vol,
    logBarrier: Math.log(config.barrier),
    logS0: [Math.log(config.s0), Math.log(config.s0)],
  };
}

export function getFairOdds(asset: AssetId): number {
  const p = asset === 'drift' ? GRID_PROBABILITIES.drift : GRID_PROBABILITIES.vol;
  return 1 / p;
}

export function getOfferedOdds(
  asset: AssetId,
  commission: number = BARRIER_RACE_CONFIG.commission,
): number {
  const p = asset === 'drift' ? GRID_PROBABILITIES.drift : GRID_PROBABILITIES.vol;
  const raw = 1 / (p + commission);
  return Math.round(raw * 100) / 100;
}

export function computeOverround(commission: number = BARRIER_RACE_CONFIG.commission): number {
  return (
    GRID_PROBABILITIES.drift +
    commission +
    GRID_PROBABILITIES.vol +
    commission
  );
}

export function computeExpectedValue(
  asset: AssetId,
  commission: number = BARRIER_RACE_CONFIG.commission,
): number {
  const pWin = asset === 'drift' ? GRID_PROBABILITIES.drift : GRID_PROBABILITIES.vol;
  const odds = getOfferedOdds(asset, commission);
  return pWin * odds + GRID_PROBABILITIES.tie * 1 + GRID_PROBABILITIES.timeout * 1 - 1;
}

export function sampleCorrelatedShocks(rho: number): [number, number] {
  const z1 = boxMullerTransform();
  const x = boxMullerTransform();
  const z2 = rho * z1 + Math.sqrt(1 - rho * rho) * x;
  return [z1, z2];
}

export function classifyWinner(
  hitTick1: number | null,
  hitTick2: number | null,
): AssetId | 'tie' | 'timeout' {
  if (hitTick1 === null && hitTick2 === null) return 'timeout';
  if (hitTick1 !== null && hitTick2 !== null && hitTick1 === hitTick2) return 'tie';
  if (hitTick1 !== null && (hitTick2 === null || hitTick1 < hitTick2)) return 'drift';
  if (hitTick2 !== null && (hitTick1 === null || hitTick2 < hitTick1)) return 'vol';
  return 'timeout';
}

export function generateRacePath(
  config: BarrierRaceConfig = BARRIER_RACE_CONFIG,
): RacePath {
  const { drift, vol, logBarrier, logS0 } = deriveParams(config);
  const prices1: number[] = [config.s0];
  const prices2: number[] = [config.s0];
  let logS1 = logS0[0];
  let logS2 = logS0[1];
  let hitTick1: number | null = null;
  let hitTick2: number | null = null;

  for (let t = 1; t <= config.maxTicks; t++) {
    const [z1, z2] = sampleCorrelatedShocks(config.rho);
    logS1 += drift[0] + vol[0] * z1;
    logS2 += drift[1] + vol[1] * z2;
    const p1 = Math.exp(logS1);
    const p2 = Math.exp(logS2);
    prices1.push(p1);
    prices2.push(p2);

    if (hitTick1 === null && logS1 >= logBarrier) hitTick1 = t;
    if (hitTick2 === null && logS2 >= logBarrier) hitTick2 = t;

    if (hitTick1 !== null || hitTick2 !== null) {
      const winner = classifyWinner(hitTick1, hitTick2);
      const settleTick = winner === 'tie'
        ? Math.max(hitTick1 ?? 0, hitTick2 ?? 0)
        : winner === 'drift'
          ? hitTick1!
          : winner === 'vol'
            ? hitTick2!
            : t;
      return {
        prices1: prices1.slice(0, settleTick + 1),
        prices2: prices2.slice(0, settleTick + 1),
        hitTick1,
        hitTick2,
        winner,
        settleTick,
      };
    }
  }

  return {
    prices1,
    prices2,
    hitTick1,
    hitTick2,
    winner: 'timeout',
    settleTick: config.maxTicks,
  };
}

export function settleRace(
  pick: AssetId,
  path: RacePath,
  stake: number,
  commission: number = BARRIER_RACE_CONFIG.commission,
): SettlementResult {
  const { winner, settleTick } = path;

  if (winner === 'tie' || winner === 'timeout') {
    return {
      outcome: winner === 'tie' ? 'tie' : 'timeout',
      payout: stake,
      multiplier: 1,
      winner,
      settleTick,
    };
  }

  if (winner === pick) {
    const multiplier = getOfferedOdds(pick, commission);
    return {
      outcome: 'win',
      payout: stake * multiplier,
      multiplier,
      winner,
      settleTick,
    };
  }

  return {
    outcome: 'lose',
    payout: 0,
    multiplier: 0,
    winner,
    settleTick,
  };
}

export function monteCarloEstimate(
  n: number,
  config: BarrierRaceConfig = BARRIER_RACE_CONFIG,
): MonteCarloResult {
  let driftWins = 0;
  let volWins = 0;
  let ties = 0;
  let timeouts = 0;

  for (let i = 0; i < n; i++) {
    const path = generateRacePath(config);
    if (path.winner === 'drift') driftWins++;
    else if (path.winner === 'vol') volWins++;
    else if (path.winner === 'tie') ties++;
    else timeouts++;
  }

  const pDrift = driftWins / n;
  const pVol = volWins / n;
  const pTie = ties / n;
  const pTimeout = timeouts / n;

  return {
    pDrift,
    pVol,
    pTie,
    pTimeout,
    seDrift: Math.sqrt((pDrift * (1 - pDrift)) / n),
    seVol: Math.sqrt((pVol * (1 - pVol)) / n),
    seTie: Math.sqrt((pTie * (1 - pTie)) / n),
    seTimeout: Math.sqrt((pTimeout * (1 - pTimeout)) / n),
  };
}

export function getRaceDurationMs(tickCount: number): number {
  return tickCount * RACE_TICK_MS + RACE_SETTLE_MS;
}

// --- Live cash-out pricing -------------------------------------------------

/** Margin the house takes on a mid-race cash-out, on top of the entry edge. */
export const CASH_OUT_FEE = 0.03;
/** Forward-simulation paths per live quote. SE ≈ 0.005 at p ≈ 0.6. */
export const LIVE_MC_PATHS = 8000;
/** Horizon cap for the live estimator (median remaining race is ~8 ticks). */
export const LIVE_MC_HORIZON = 300;

export interface LiveProbabilities {
  pWin1: number;
  pWin2: number;
  /** Ties and horizon timeouts — both settle at 1.0x, so they price together. */
  pRefund: number;
}

/**
 * Fast non-crypto gaussian for the live estimator only. Quote estimation does
 * not need a secure RNG — the actual race path is pre-generated with the
 * crypto-based sampler and is unaffected by these draws.
 */
function fastGaussian(): number {
  let u1 = Math.random();
  if (u1 <= Number.EPSILON) u1 = Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Estimate outcome probabilities from an arbitrary mid-race state via forward
 * Monte Carlo. Used to quote live cash-out offers; never used for settlement.
 */
export function estimateLiveProbabilities(
  logS1: number,
  logS2: number,
  nPaths: number = LIVE_MC_PATHS,
  config: BarrierRaceConfig = BARRIER_RACE_CONFIG,
): LiveProbabilities {
  const { drift, vol, logBarrier } = deriveParams(config);

  const hit1 = logS1 >= logBarrier;
  const hit2 = logS2 >= logBarrier;
  if (hit1 && hit2) return { pWin1: 0, pWin2: 0, pRefund: 1 };
  if (hit1) return { pWin1: 1, pWin2: 0, pRefund: 0 };
  if (hit2) return { pWin1: 0, pWin2: 1, pRefund: 0 };

  const rho = config.rho;
  const rhoComp = Math.sqrt(1 - rho * rho);
  let wins1 = 0;
  let wins2 = 0;
  let refunds = 0;

  for (let i = 0; i < nPaths; i++) {
    let x1 = logS1;
    let x2 = logS2;
    let resolved = false;

    for (let t = 0; t < LIVE_MC_HORIZON; t++) {
      const z1 = fastGaussian();
      const z2 = rho * z1 + rhoComp * fastGaussian();
      x1 += drift[0] + vol[0] * z1;
      x2 += drift[1] + vol[1] * z2;

      const b1 = x1 >= logBarrier;
      const b2 = x2 >= logBarrier;
      if (b1 || b2) {
        if (b1 && b2) refunds++;
        else if (b1) wins1++;
        else wins2++;
        resolved = true;
        break;
      }
    }
    if (!resolved) refunds++;
  }

  return {
    pWin1: wins1 / nPaths,
    pWin2: wins2 / nPaths,
    pRefund: refunds / nPaths,
  };
}

/**
 * Value of an open position discounted by the cash-out fee, in whole credits.
 * Fair value = stake × (pWin × multiplier + pRefund × 1).
 */
export function computeCashOutOffer(
  stake: number,
  multiplier: number,
  pWin: number,
  pRefund: number,
  fee: number = CASH_OUT_FEE,
): number {
  const fairValue = stake * (pWin * multiplier + pRefund);
  return Math.max(0, Math.floor(fairValue * (1 - fee)));
}

/**
 * Distance from a price to the barrier, measured in that asset's per-tick
 * standard deviations (the spec's d/s metric). Zero or negative once touched.
 */
export function distanceToBarrierSigma(
  price: number,
  asset: AssetId,
  config: BarrierRaceConfig = BARRIER_RACE_CONFIG,
): number {
  const idx = asset === 'drift' ? 0 : 1;
  const s = config.sigma[idx] * Math.sqrt(config.dt);
  return Math.log(config.barrier / price) / s;
}

/** A losing pick that came within this many per-tick σ of the barrier counts as a near miss. */
export const NEAR_MISS_SIGMA = 0.75;

export interface NearMissInfo {
  isNearMiss: boolean;
  /** Closest price gap to the barrier reached by the picked asset. */
  closestGap: number;
  /** Same gap in per-tick standard deviations. */
  closestSigma: number;
}

export function getNearMiss(
  pick: AssetId,
  path: RacePath,
  config: BarrierRaceConfig = BARRIER_RACE_CONFIG,
): NearMissInfo {
  const prices = pick === 'drift' ? path.prices1 : path.prices2;
  let closestSigma = Infinity;
  let closestGap = Infinity;

  for (const p of prices) {
    const dSigma = distanceToBarrierSigma(p, pick, config);
    if (dSigma < closestSigma) {
      closestSigma = dSigma;
      closestGap = config.barrier - p;
    }
  }

  return {
    isNearMiss: closestSigma > 0 && closestSigma <= NEAR_MISS_SIGMA,
    closestGap,
    closestSigma,
  };
}
