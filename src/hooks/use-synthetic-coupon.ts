'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useSyntheticCouponSound } from '@/hooks/use-synthetic-coupon-sound';
import {
  type CouponRoundState,
  type DistancePresetId,
  type PeriodTicks,
  COUPON_TICK_MS,
  IDLE_TICK_MS,
  PREVIEW_WINDOW,
  SYNTHETIC_COUPON_CONFIG,
  applyCouponTick,
  canCashOutRound,
  centsToUsdt,
  computeBarriers,
  distanceToNearestBarrierSigma,
  getCouponPricing,
  getDistancePreset,
  nextIdleTick,
  openCouponContract,
  positionPayoutUsdt,
  settleCashOut,
  ticksSurvived,
} from '@/lib/games/synthetic-coupon';

export type CouponPhase = 'idle' | 'flying' | 'cashed_out' | 'defaulted';

export interface CouponRoundResult {
  outcome: 'cashed_out' | 'defaulted';
  status: 'WON' | 'LOST';
  stake: number;
  accrued: number;
  payout: number;
  periodsCompleted: number;
  settleTick: number;
  breachSide: 'upper' | 'lower' | null;
  autoHorizon?: boolean;
}

export function useSyntheticCoupon() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const sound = useSyntheticCouponSound();

  const [stake, setStake] = useState(100);
  const [periodTicks, setPeriodTicksState] = useState<PeriodTicks>(10);
  const [distanceId, setDistanceIdState] = useState<DistancePresetId>('standard');
  const [phase, setPhase] = useState<CouponPhase>('idle');
  const [round, setRound] = useState<CouponRoundState | null>(null);
  const [result, setResult] = useState<CouponRoundResult | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [barrierFlash, setBarrierFlash] = useState(false);
  const [couponFlash, setCouponFlash] = useState(false);
  const [previewPrices, setPreviewPrices] = useState<number[]>([
    SYNTHETIC_COUPON_CONFIG.s0,
  ]);

  const phaseRef = useRef<CouponPhase>('idle');
  const roundRef = useRef<CouponRoundState | null>(null);
  const stakeRef = useRef(stake);
  const spotRef = useRef(SYNTHETIC_COUPON_CONFIG.s0);
  const addWinningsRef = useRef(addWinnings);
  const tickTimerRef = useRef<number | null>(null);
  /** Prevents double settlement (cash-out vs tick default). */
  const settlingRef = useRef(false);
  const soundRef = useRef(sound);

  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);
  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const pricing = getCouponPricing(periodTicks, distanceId);
  const spot = previewPrices[previewPrices.length - 1];
  const idleBarriers = computeBarriers(spot, pricing.offsetLog);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canEnter = phase === 'idle' && stake <= balance && balance >= 10 && stake >= 10;

  const setPeriodTicks = useCallback((next: PeriodTicks) => {
    if (phaseRef.current !== 'idle') return;
    setPeriodTicksState(next);
  }, []);

  const setDistanceId = useCallback((next: DistancePresetId) => {
    if (phaseRef.current !== 'idle') return;
    setDistanceIdState(next);
  }, []);

  useEffect(() => {
    if (phase !== 'idle') return;
    const id = window.setInterval(() => {
      setPreviewPrices((prev) => {
        const next = nextIdleTick(prev[prev.length - 1]);
        spotRef.current = next;
        return [...prev, next].slice(-PREVIEW_WINDOW);
      });
    }, IDLE_TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const clearTickTimer = useCallback(() => {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const finishRound = useCallback(
    (
      settled: CouponRoundState,
      outcome: 'cashed_out' | 'defaulted',
      opts?: { autoHorizon?: boolean },
    ) => {
      // Only one settlement per open round.
      if (phaseRef.current !== 'flying') return;
      settlingRef.current = true;
      clearTickTimer();
      roundRef.current = settled;
      setRound(settled);
      setBarrierFlash(outcome === 'defaulted');

      const sd = settled.contract.settlement_data;
      const payout = settled.contract.payout_amount;
      if (outcome === 'cashed_out' && payout > 0) {
        addWinningsRef.current(payout);
      }

      if (outcome === 'cashed_out') soundRef.current.playWin();
      else soundRef.current.playLoss();

      const nextPhase: CouponPhase = outcome === 'cashed_out' ? 'cashed_out' : 'defaulted';
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setResult({
        outcome,
        status: settled.contract.status === 'WON' ? 'WON' : 'LOST',
        stake: settled.contract.stake_amount,
        accrued: centsToUsdt(settled.accruedCents),
        payout,
        periodsCompleted: settled.periodsCompleted,
        settleTick: sd?.settle_tick ?? settled.prices.length - 1,
        breachSide: sd?.breach_side ?? null,
        autoHorizon: opts?.autoHorizon,
      });
    },
    [clearTickTimer],
  );

  const startRound = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    if (settlingRef.current) settlingRef.current = false;

    setPlayError(null);
    setResult(null);
    setBarrierFlash(false);
    setCouponFlash(false);

    const currentStake = stakeRef.current;
    if (currentStake < 10 || currentStake > balance) {
      setPlayError('Not enough credits for this stake.');
      return;
    }
    if (!placeBet(currentStake)) {
      setPlayError('Not enough credits for this stake.');
      return;
    }

    const opened = openCouponContract({
      stakeUsdt: currentStake,
      entrySpot: spotRef.current,
      periodTicks,
      distanceId,
    });

    roundRef.current = opened;
    settlingRef.current = false;
    soundRef.current.resetRound();
    setRound(opened);
    phaseRef.current = 'flying';
    setPhase('flying');

    tickTimerRef.current = window.setInterval(() => {
      if (settlingRef.current) return;
      const current = roundRef.current;
      if (!current || current.contract.status !== 'OPEN') return;

      const applied = applyCouponTick(current);
      if (applied.kind === 'default') {
        finishRound(applied.state, 'defaulted');
        return;
      }
      if (applied.kind === 'auto_cash_out') {
        finishRound(applied.state, 'cashed_out', { autoHorizon: true });
        return;
      }
      roundRef.current = applied.state;
      setRound(applied.state);

      const price = applied.state.prices[applied.state.prices.length - 1];
      const { upper_barrier, lower_barrier } = applied.state.contract.parameters;
      soundRef.current.playApproachTick(
        ticksSurvived(applied.state),
        distanceToNearestBarrierSigma(price, upper_barrier, lower_barrier),
      );

      if (applied.couponAccrued) {
        soundRef.current.playCoupon();
        setCouponFlash(true);
        window.setTimeout(() => setCouponFlash(false), 450);
      }
    }, COUPON_TICK_MS);
  }, [placeBet, periodTicks, distanceId, finishRound, balance]);

  const cashOut = useCallback(() => {
    if (settlingRef.current || phaseRef.current !== 'flying') return;
    const current = roundRef.current;
    if (!current || current.contract.status !== 'OPEN') return;
    if (!canCashOutRound(current)) return;

    settlingRef.current = true;
    clearTickTimer();
    const settled = settleCashOut(current);
    if (settled.contract.status !== 'WON') {
      settlingRef.current = false;
      return;
    }
    // finishRound requires phase still 'flying' — keep phaseRef until it runs.
    settlingRef.current = false;
    finishRound(settled, 'cashed_out');
  }, [clearTickTimer, finishRound]);

  const dismissResult = useCallback(() => {
    clearTickTimer();
    settlingRef.current = false;
    const last = roundRef.current;
    if (last) {
      const seed = last.prices.slice(-PREVIEW_WINDOW);
      spotRef.current = seed[seed.length - 1];
      setPreviewPrices(seed);
    }
    setResult(null);
    setRound(null);
    setBarrierFlash(false);
    setCouponFlash(false);
    roundRef.current = null;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, [clearTickTimer]);

  const playAgain = useCallback(() => {
    if (phaseRef.current !== 'cashed_out' && phaseRef.current !== 'defaulted') return;
    clearTickTimer();
    settlingRef.current = false;
    const last = roundRef.current;
    if (last) {
      const seed = last.prices.slice(-PREVIEW_WINDOW);
      spotRef.current = seed[seed.length - 1];
      setPreviewPrices(seed);
    }
    setResult(null);
    setRound(null);
    setBarrierFlash(false);
    setCouponFlash(false);
    roundRef.current = null;
    phaseRef.current = 'idle';
    setPhase('idle');
    // Start on next macrotask so placeBet sees idle + updated balance from prior settle.
    window.setTimeout(() => {
      startRound();
    }, 0);
  }, [clearTickTimer, startRound]);

  useEffect(() => () => clearTickTimer(), [clearTickTimer]);

  const liveBarriers = round
    ? {
        upper: round.contract.parameters.upper_barrier,
        lower: round.contract.parameters.lower_barrier,
      }
    : idleBarriers;

  const entrySpot = round?.contract.parameters.entry_spot ?? spot;
  const accruedUsdt = round ? centsToUsdt(round.accruedCents) : 0;
  const payoutPreview = round ? positionPayoutUsdt(round) : stake;
  const couponPreview = pricing.couponUsdt(stake);
  const ticksToCoupon = round
    ? Math.max(0, round.contract.parameters.period_ticks - round.ticksInPeriod)
    : periodTicks;
  const ticksInPeriod = round?.ticksInPeriod ?? 0;
  const periodLen = round?.contract.parameters.period_ticks ?? periodTicks;
  const periodProgress = couponFlash
    ? 1
    : periodLen > 0
      ? ticksInPeriod / periodLen
      : 0;
  const survived = round ? ticksSurvived(round) : 0;
  const cashOutReady = phase === 'flying' && !!round && canCashOutRound(round);

  return {
    balance,
    stake,
    setStake,
    maxStake,
    periodTicks,
    setPeriodTicks,
    distanceId,
    setDistanceId,
    distanceLabel: getDistancePreset(distanceId).label,
    pricing,
    phase,
    round,
    result,
    playError,
    barrierFlash,
    couponFlash,
    previewPrices,
    prices: round?.prices ?? previewPrices,
    upper: liveBarriers.upper,
    lower: liveBarriers.lower,
    entrySpot,
    accruedUsdt,
    payoutPreview,
    couponPreview,
    ticksToCoupon,
    ticksInPeriod,
    periodProgress,
    periodsCompleted: round?.periodsCompleted ?? 0,
    ticksSurvived: survived,
    canEnter,
    canCashOut: cashOutReady,
    startRound,
    cashOut,
    dismissResult,
    playAgain,
  };
}
