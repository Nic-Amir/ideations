'use strict';

/** Calibrate all Plinko modes — run: node scripts/calibrate-plinko.mjs */

const REF_TICKS = 60;
const GBM_HORIZON = 0.6;
const TICK_COUNT = 3600;
const START_PRICE = 10000;
const TARGET_RTP = 0.98;
const MC_TRIALS = 25_000;
const MC_VERIFY = 80_000;

const BASE = { sigma: 0.35, tickCount: TICK_COUNT };

function boxMuller() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u1 = (buf[0] + 1) / (0xffffffff + 2);
  const u2 = (buf[1] + 1) / (0xffffffff + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function getScaledSigma(sigma, tickCount = TICK_COUNT) {
  return sigma / Math.sqrt(tickCount / REF_TICKS);
}

function getStepDt(tickCount) {
  return GBM_HORIZON / tickCount;
}

function computeSigmaEff(sigma, tickCount) {
  const scaledSigma = getScaledSigma(sigma, tickCount);
  const dt = getStepDt(tickCount);
  return scaledSigma * Math.sqrt(tickCount * dt);
}

function sampleTerminalLogReturn(sigma, tickCount) {
  const scaledSigma = getScaledSigma(sigma, tickCount);
  const dt = getStepDt(tickCount);
  const mu = (-(scaledSigma * scaledSigma) / 2) * tickCount * dt;
  const sigmaEff = computeSigmaEff(sigma, tickCount);
  return mu + sigmaEff * boxMuller();
}

function buildSplitZones(p) {
  const scale = (v) => Math.round(v * 100) / 100;
  return [
    { minSigma: 4, maxSigma: Infinity, payout: scale(p.extreme) },
    { minSigma: 3, maxSigma: 4, payout: scale(p.outer) },
    { minSigma: 2, maxSigma: 3, payout: scale(p.mid) },
    { minSigma: 1, maxSigma: 2, payout: scale(p.inner) },
    { minSigma: 0.5, maxSigma: 1, payout: scale(p.micro) },
    { minSigma: 0, maxSigma: 0.5, payout: p.core },
    { minSigma: 0.5, maxSigma: 1, payout: scale(p.micro) },
    { minSigma: 1, maxSigma: 2, payout: scale(p.inner) },
    { minSigma: 2, maxSigma: 3, payout: scale(p.mid) },
    { minSigma: 3, maxSigma: 4, payout: scale(p.outer) },
    { minSigma: 4, maxSigma: Infinity, payout: scale(p.extreme) },
  ];
}

function buildStripeZones(p) {
  return buildSplitZones(p);
}

const CORE_IDX = 5;

function resolveSigned(logReturn, sigmaEff, payouts) {
  const zones = buildSplitZones(payouts);
  const zScore = sigmaEff > 0 ? logReturn / sigmaEff : 0;
  const absZ = Math.abs(zScore);
  if (absZ < 0.5) return zones[CORE_IDX].payout;
  if (zScore >= 0) {
    for (let i = 0; i < CORE_IDX; i++) {
      const z = zones[i];
      if (absZ >= z.minSigma && (absZ < z.maxSigma || z.maxSigma === Infinity)) return z.payout;
    }
  } else {
    for (let i = zones.length - 1; i > CORE_IDX; i--) {
      const z = zones[i];
      if (absZ >= z.minSigma && (absZ < z.maxSigma || z.maxSigma === Infinity)) return z.payout;
    }
  }
  return zones[CORE_IDX].payout;
}

function mcRtp(resolveFn, payouts, n) {
  const { sigma, tickCount } = BASE;
  const sigmaEff = computeSigmaEff(sigma, tickCount);
  let total = 0;
  let netWins = 0;
  for (let i = 0; i < n; i++) {
    const lr = sampleTerminalLogReturn(sigma, tickCount);
    const payout = resolveFn(lr, sigmaEff, payouts);
    total += payout;
    if (payout >= 1) netWins++;
  }
  return { rtp: total / n, netWinRate: netWins / n };
}

function findScaleSplit() {
  const base = { core: 0.23, micro: 1.2, inner: 1.43, mid: 2.77, outer: 9.17, extreme: 37.72 };
  let lo = 0.85;
  let hi = 1.2;
  for (let iter = 0; iter < 20; iter++) {
    const k = (lo + hi) / 2;
    const p = {
      core: base.core,
      micro: base.micro * k,
      inner: base.inner * k,
      mid: base.mid * k,
      outer: base.outer * k,
      extreme: base.extreme * k,
    };
    const { rtp } = mcRtp(resolveSigned, p, MC_TRIALS);
    if (rtp < TARGET_RTP) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const payouts = {
    core: base.core,
    micro: Math.round(base.micro * k * 100) / 100,
    inner: Math.round(base.inner * k * 100) / 100,
    mid: Math.round(base.mid * k * 100) / 100,
    outer: Math.round(base.outer * k * 100) / 100,
    extreme: Math.round(base.extreme * k * 100) / 100,
  };
  const stats = mcRtp(resolveSigned, payouts, MC_VERIFY);
  return { mode: 'split', payouts, k, ...stats };
}

function findScaleStripe() {
  const base = {
    core: 0.72,
    micro: 1.18,
    inner: 0.48,
    mid: 1.52,
    outer: 0.32,
    extreme: 2.85,
  };
  let lo = 0.85;
  let hi = 1.2;
  for (let iter = 0; iter < 20; iter++) {
    const k = (lo + hi) / 2;
    const p = {
      core: base.core,
      micro: base.micro * k,
      inner: base.inner,
      mid: base.mid * k,
      outer: base.outer,
      extreme: base.extreme * k,
    };
    const { rtp } = mcRtp(resolveSigned, p, MC_TRIALS);
    if (rtp < TARGET_RTP) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const payouts = {
    core: base.core,
    micro: Math.round(base.micro * k * 100) / 100,
    inner: base.inner,
    mid: Math.round(base.mid * k * 100) / 100,
    outer: base.outer,
    extreme: Math.round(base.extreme * k * 100) / 100,
  };
  const stats = mcRtp(resolveSigned, payouts, MC_VERIFY);
  return { mode: 'stripes', payouts, k, ...stats };
}

for (const r of [findScaleSplit(), findScaleStripe()]) {
  console.log(
    JSON.stringify({
      mode: r.mode,
      payouts: r.payouts,
      k: r.k.toFixed(4),
      rtp: r.rtp.toFixed(4),
      netWinRate: r.netWinRate.toFixed(4),
    }),
  );
}
