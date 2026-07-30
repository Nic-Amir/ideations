'use strict';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useCorridorSound } from '@/hooks/use-corridor-sound';
import { distanceToNearestBarrierSigma } from '@/lib/games/barrier-predictor';
import {
  type CorridorPick,
  type CorridorPath,
  type CorridorPricingView,
  type DistancePresetId,
  type DurationTicks,
  CORRIDOR_CONFIG,
  CORRIDOR_TICK_MS,
  CORRIDOR_SETTLE_MS,
  IDLE_TICK_MS,
  PREVIEW_WINDOW,
  getCorridorPricing,
  nextIdleTick,
  openCorridorContract,
  settleCorridorContract,
} from '@/lib/games/corridor';

export type CorridorPhase = 'idle' | 'running' | 'settled';

export interface CorridorHistoryEntry {
  pick: CorridorPick;
  outcome: 'WON' | 'LOST';
  payoutUsdt: number;
  stakeUsdt: number;
}

export interface CorridorResult {
  outcome: 'WON' | 'LOST';
  payoutUsdt: number;
  stakeUsdt: number;
  netPL: number;
  pick: CorridorPick;
  touched: 'upper' | 'lower' | null;
  multiplier: number;
  settleTick: number;
}

const HISTORY_CAP = 100;

export function useCorridor() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const sound = useCorridorSound();

  const [stake, setStake] = useState(100);
  const [ticks, setTicksState] = useState<DurationTicks>(10);
  const [distanceId, setDistanceIdState] = useState<DistancePresetId>('standard');
  const [phase, setPhase] = useState<CorridorPhase>('idle');
  const [pick, setPick] = useState<CorridorPick | null>(null);
  const [path, setPath] = useState<CorridorPath | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const [result, setResult] = useState<CorridorResult | null>(null);
  const [history, setHistory] = useState<CorridorHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [barrierFlash, setBarrierFlash] = useState(false);
  const [previewPrices, setPreviewPrices] = useState<number[]>([CORRIDOR_CONFIG.s0]);

  const pathRef = useRef<CorridorPath | null>(null);
  const roundRef = useRef<ReturnType<typeof openCorridorContract> | null>(null);
  const pickRef = useRef<CorridorPick | null>(null);
  const spotRef = useRef(CORRIDOR_CONFIG.s0);
  const stakeRef = useRef(stake);
  const roundStakeRef = useRef(stake);
  const lockedMultRef = useRef(0);
  const animFrameRef = useRef(0);
  const roundStartRef = useRef(0);
  const phaseRef = useRef<CorridorPhase>('idle');
  const soundRef = useRef(sound);
  const addWinningsRef = useRef(addWinnings);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);
  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const pricing: CorridorPricingView = useMemo(
    () => getCorridorPricing(ticks, distanceId),
    [ticks, distanceId],
  );

  const spot = previewPrices[previewPrices.length - 1];
  const idleBarriers = useMemo(
    () => ({
      upper: spot * Math.exp(pricing.offsetLog),
      lower: spot * Math.exp(-pricing.offsetLog),
    }),
    [spot, pricing.offsetLog],
  );

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade = phase === 'idle' && stake <= balance && balance >= 10 && stake >= 10;

  const setTicks = useCallback((next: DurationTicks) => {
    if (phaseRef.current !== 'idle') return;
    setTicksState(next);
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

  const startRound = useCallback(
    (selected: CorridorPick) => {
      if (phaseRef.current !== 'idle') return;

      setPlayError(null);
      setResult(null);
      setBarrierFlash(false);

      const currentStake = stakeRef.current;
      if (currentStake > balance || currentStake < 10) {
        setPlayError('Not enough credits for this stake.');
        return;
      }
      if (!placeBet(currentStake)) {
        setPlayError('Not enough credits for this stake.');
        return;
      }

      roundStakeRef.current = currentStake;
      soundRef.current.playPlace();
      soundRef.current.resetRound();

      const round = openCorridorContract({
        stakeUsdt: currentStake,
        pick: selected,
        ticks,
        distanceId,
        entrySpot: spotRef.current,
      });

      lockedMultRef.current = round.contract.parameters.locked_multiplier;
      pathRef.current = round.path;
      roundRef.current = round;
      pickRef.current = selected;
      roundStartRef.current = performance.now();

      phaseRef.current = 'running';
      setPick(selected);
      setPath(round.path);
      setVisibleTick(0);
      setPhase('running');
    },
    [placeBet, ticks, distanceId, balance],
  );

  const dismissResult = useCallback(() => {
    const lastPath = pathRef.current;
    if (lastPath) {
      const seed = lastPath.prices.slice(-PREVIEW_WINDOW);
      spotRef.current = seed[seed.length - 1];
      setPreviewPrices(seed);
    }
    setResult(null);
    setPath(null);
    setPick(null);
    setVisibleTick(0);
    setBarrierFlash(false);
    pathRef.current = null;
    roundRef.current = null;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  const playAgain = useCallback(() => {
    const lastPick = pickRef.current;
    if (phaseRef.current !== 'settled' || !lastPick) return;
    dismissResult();
    // Defer so balance updates from prior settle land before placeBet.
    window.setTimeout(() => startRound(lastPick), 0);
  }, [dismissResult, startRound]);

  useEffect(() => {
    if (phase !== 'running' || !pathRef.current || !roundRef.current) return;

    const roundPath = pathRef.current;
    const openRound = roundRef.current;
    const totalTicks = roundPath.settleTick;
    const revealDuration = totalTicks * CORRIDOR_TICK_MS;
    let flashed = false;

    function tick() {
      const selected = pickRef.current;
      if (!roundPath || !selected) return;

      const elapsed = performance.now() - roundStartRef.current;
      const tickIndex = Math.min(
        Math.floor(elapsed / CORRIDOR_TICK_MS),
        roundPath.settleTick,
      );
      setVisibleTick(tickIndex);

      if (tickIndex > 0 && tickIndex < roundPath.settleTick) {
        const price = roundPath.prices[tickIndex];
        soundRef.current.playApproachTick(
          tickIndex,
          distanceToNearestBarrierSigma(price, roundPath.upper, roundPath.lower),
        );
      }

      if (!flashed && tickIndex >= roundPath.settleTick) {
        flashed = true;
        if (roundPath.touched !== null) {
          setBarrierFlash(true);
          soundRef.current.playBarrierHit();
        }
      }

      if (
        tickIndex >= roundPath.settleTick &&
        elapsed >= revealDuration + CORRIDOR_SETTLE_MS
      ) {
        const settled = settleCorridorContract(openRound);
        const tradeStake = roundStakeRef.current;
        const payoutUsdt = settled.contract.payout_amount;
        const outcome = settled.contract.status as 'WON' | 'LOST';

        if (outcome === 'WON') {
          addWinningsRef.current(payoutUsdt);
          soundRef.current.playWin();
        } else {
          soundRef.current.playLoss();
        }

        setResult({
          outcome,
          payoutUsdt,
          stakeUsdt: tradeStake,
          netPL: payoutUsdt - tradeStake,
          pick: selected,
          touched: settled.contract.settlement_data?.touched ?? null,
          multiplier: lockedMultRef.current,
          settleTick: settled.contract.settlement_data?.settle_tick ?? roundPath.settleTick,
        });
        setHistory((prev) =>
          [
            {
              pick: selected,
              outcome,
              payoutUsdt,
              stakeUsdt: tradeStake,
            },
            ...prev,
          ].slice(0, HISTORY_CAP),
        );

        phaseRef.current = 'settled';
        setPhase('settled');
        return;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase]);

  const ticksLeft =
    phase === 'running' && path ? Math.max(path.settleTick - visibleTick, 0) : null;

  return {
    stake,
    setStake,
    ticks,
    setTicks,
    distanceId,
    setDistanceId,
    phase,
    pick,
    path,
    visibleTick,
    result,
    history,
    playError,
    barrierFlash,
    balance,
    maxStake,
    canTrade,
    pricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    startRound,
    dismissResult,
    playAgain,
  };
}
