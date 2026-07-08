'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDerivClient } from '@/lib/deriv/provider';
import { useBalanceStore } from '@/stores/balance-store';
import {
  applyTick,
  getCrashSymbolInfo,
  getDisplayedMultiplier,
  isCrashTick,
  MIN_CASHOUT_MULTIPLIER,
} from '@/lib/games/crash-pilot';
import type { CrashPilotState, CrashSymbol, ParsedTick } from '@/types';

const MAX_CHART_TICKS = 100;
const MAX_MARKET_CRASHES = 12;
const MAX_ROUND_HISTORY = 20;
const MAX_CURVE_POINTS = 600;

export interface CrashRoundResult {
  id: number;
  outcome: 'crashed' | 'cashed_out';
  multiplier: number;
  stake: number;
  winAmount: number;
}

interface ActiveRound {
  stake: number;
  autoCashoutTarget: number | null;
  ticksSurvived: number;
}

export function useCrashPilot(symbol: CrashSymbol) {
  const client = useDerivClient();
  const { placeBet, addWinnings } = useBalanceStore();
  const info = getCrashSymbolInfo(symbol);

  const [phase, setPhase] = useState<CrashPilotState>('idle');
  const [multiplier, setMultiplier] = useState(1);
  const [ticksSurvived, setTicksSurvived] = useState(0);
  const [curve, setCurve] = useState<number[]>([]);
  const [ticks, setTicks] = useState<ParsedTick[]>([]);
  const [marketStreak, setMarketStreak] = useState(0);
  const [marketCrashes, setMarketCrashes] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<CrashRoundResult | null>(null);
  const [roundHistory, setRoundHistory] = useState<CrashRoundResult[]>([]);

  const roundRef = useRef<ActiveRound | null>(null);
  const prevQuoteRef = useRef<number | null>(null);
  const streakRef = useRef(0);
  const roundIdRef = useRef(0);
  const avgTicksRef = useRef(info.avgTicksPerCrash);
  avgTicksRef.current = info.avgTicksPerCrash;

  const settleRound = useCallback(
    (outcome: 'crashed' | 'cashed_out', settledMultiplier: number) => {
      const round = roundRef.current;
      if (!round) return;
      roundRef.current = null;

      const winAmount = outcome === 'cashed_out' ? round.stake * settledMultiplier : 0;
      if (winAmount > 0) addWinnings(winAmount);

      const result: CrashRoundResult = {
        id: ++roundIdRef.current,
        outcome,
        multiplier: settledMultiplier,
        stake: round.stake,
        winAmount,
      };
      setLastResult(result);
      setRoundHistory((prev) => [result, ...prev].slice(0, MAX_ROUND_HISTORY));
      setPhase(outcome === 'cashed_out' ? 'cashed_out' : 'crashed');
      setMultiplier(settledMultiplier);
    },
    [addWinnings]
  );

  const settleRoundRef = useRef(settleRound);
  settleRoundRef.current = settleRound;

  useEffect(() => {
    prevQuoteRef.current = null;
    streakRef.current = 0;
    setTicks([]);
    setMarketStreak(0);
    setMarketCrashes([]);

    const unsubscribe = client.subscribe(symbol, (tick) => {
      const quote = tick.numericQuote;
      const prevQuote = prevQuoteRef.current;
      prevQuoteRef.current = quote;

      setTicks((prev) => {
        const next = [...prev, tick];
        return next.length > MAX_CHART_TICKS ? next.slice(-MAX_CHART_TICKS) : next;
      });

      if (prevQuote === null) return;

      // Market-wide crash tracking (independent of any active bet).
      if (isCrashTick(prevQuote, quote)) {
        const climbMultiplier = getDisplayedMultiplier(streakRef.current, avgTicksRef.current);
        setMarketCrashes((prev) => [climbMultiplier, ...prev].slice(0, MAX_MARKET_CRASHES));
        streakRef.current = 0;
      } else {
        streakRef.current += 1;
      }
      setMarketStreak(streakRef.current);

      // Active round progression.
      const round = roundRef.current;
      if (!round) return;

      const outcome = applyTick(
        prevQuote,
        quote,
        round.ticksSurvived,
        avgTicksRef.current,
        round.autoCashoutTarget
      );

      if (outcome.crashed) {
        settleRoundRef.current('crashed', outcome.multiplier);
        return;
      }

      round.ticksSurvived = outcome.ticksSurvived;
      setTicksSurvived(outcome.ticksSurvived);
      setMultiplier(outcome.multiplier);
      setCurve((prev) => {
        const next = [...prev, outcome.multiplier];
        return next.length > MAX_CURVE_POINTS ? next.slice(-MAX_CURVE_POINTS) : next;
      });

      if (outcome.autoCashedOut) {
        const target = round.autoCashoutTarget;
        const settled =
          target !== null ? Math.min(target, outcome.multiplier) : outcome.multiplier;
        settleRoundRef.current('cashed_out', Math.max(settled, MIN_CASHOUT_MULTIPLIER));
      }
    });

    return () => {
      unsubscribe();
      // A symbol switch or unmount mid-flight forfeits nothing: refund the stake.
      const round = roundRef.current;
      if (round) {
        roundRef.current = null;
        useBalanceStore.getState().addWinnings(round.stake);
      }
    };
  }, [client, symbol]);

  const launch = useCallback(
    (stake: number, autoCashoutTarget: number | null) => {
      if (roundRef.current) return false;
      if (!placeBet(stake)) return false;
      roundRef.current = {
        stake,
        autoCashoutTarget:
          autoCashoutTarget !== null && autoCashoutTarget >= MIN_CASHOUT_MULTIPLIER
            ? autoCashoutTarget
            : null,
        ticksSurvived: 0,
      };
      setPhase('flying');
      setMultiplier(1);
      setTicksSurvived(0);
      setCurve([1]);
      setLastResult(null);
      return true;
    },
    [placeBet]
  );

  const cashOut = useCallback(() => {
    const round = roundRef.current;
    if (!round || round.ticksSurvived < 1) return;
    const settled = getDisplayedMultiplier(round.ticksSurvived, avgTicksRef.current);
    settleRoundRef.current('cashed_out', settled);
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setMultiplier(1);
    setTicksSurvived(0);
    setCurve([]);
    setLastResult(null);
  }, []);

  return {
    phase,
    multiplier,
    ticksSurvived,
    curve,
    ticks,
    marketStreak,
    marketCrashes,
    lastResult,
    roundHistory,
    launch,
    cashOut,
    reset,
  };
}
