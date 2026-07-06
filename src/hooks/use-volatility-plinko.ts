'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import {
  getRiskConfig,
  generateVolatilityRun,
  getZoneLabel,
  getZoneColor,
  getTargetPayout,
  type VolatilityRun,
} from '@/lib/games/plinko';
import type { PlinkoRisk } from '@/types';
import { usePlinkoSound } from '@/hooks/use-plinko-sound';
import type { SettlementFx } from '@/components/games/plinko/plinko-renderer';

export { isNetWin } from '@/lib/games/plinko';

export const MAX_CONCURRENT_RUNS = 5;
export const SESSION_OPTIONS = [5, 10, 25] as const;
export const START_PRICE = 1000;
export const TICK_MS = 70;
export const SETTLE_MS = 400;
export const FX_DURATION_MS = 1100;

/** Spread: paid by wherever the path lands. Target: pick a zone, priced by hit probability. */
export type PlinkoBetMode = 'spread' | 'target';

/** Explicit phase, Swipe-cards style, instead of implicit booleans. */
export type PlinkoPhase = 'ready' | 'running' | 'settled';

export interface RunDisplay {
  id: number;
  run: VolatilityRun;
  animProgress: number;
  visibleTickIndex: number;
  startedAt: number;
  stake: number;
  /** Terms locked at placement (Box-O pattern). */
  mode: PlinkoBetMode;
  targetZoneIndex: number | null;
  lockedTargetPayout: number | null;
  /** Payout actually credited; resolved at settlement. */
  effectivePayout: number;
}

export interface PlinkoResult {
  payout: number;
  amount: number;
  stake: number;
  pctChange: number;
  zScore: number;
  zoneIndex: number;
  zoneLabel: string;
  zoneColor: string;
  mode: PlinkoBetMode;
  targetZoneIndex: number | null;
  targetHit: boolean;
}

export interface HistoryEntry {
  payout: number;
  pctChange: number;
  zoneIndex: number;
  zoneLabel: string;
  zoneColor: string;
  stake: number;
  winAmount: number;
  mode: PlinkoBetMode;
  targetHit: boolean;
}

export interface PlinkoSession {
  total: number;
  completed: number;
  startBalance: number;
  running: boolean;
  netPL: number;
  bestPayout: number;
  wins: number;
}

function resolveEffectivePayout(
  run: VolatilityRun,
  mode: PlinkoBetMode,
  targetZoneIndex: number | null,
  lockedTargetPayout: number | null,
): number {
  if (mode === 'target') {
    if (targetZoneIndex !== null && run.zoneIndex === targetZoneIndex) {
      return lockedTargetPayout ?? getTargetPayout(targetZoneIndex);
    }
    return 0;
  }
  return run.payout;
}

function computeVisibleTickIndex(elapsed: number, quoteCount: number, tickCount: number): number {
  const pathTicks = quoteCount - 1;
  if (elapsed >= tickCount * TICK_MS + SETTLE_MS) return pathTicks;
  const tickStep = Math.floor(elapsed / TICK_MS);
  return Math.min(tickStep, pathTicks);
}

function computeAnimProgress(elapsed: number, tickCount: number): number {
  const total = tickCount * TICK_MS + SETTLE_MS;
  return Math.min(elapsed / total, 1);
}

export function useVolatilityPlinko() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { playTick, playLand, playBigWin, clearRunTicks } = usePlinkoSound();

  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [stake, setStake] = useState(100);
  const [betMode, setBetMode] = useState<PlinkoBetMode>('spread');
  const [targetZoneIndex, setTargetZoneIndex] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunDisplay[]>([]);
  const [activeRuns, setActiveRuns] = useState<RunDisplay[]>([]);
  const [lastResult, setLastResult] = useState<PlinkoResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [session, setSession] = useState<PlinkoSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<PlinkoSession | null>(null);
  const [settlementFx, setSettlementFx] = useState<SettlementFx[]>([]);
  const [chartPulse, setChartPulse] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const runIdRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const activeRunsRef = useRef<RunDisplay[]>([]);
  const configRef = useRef(getRiskConfig(risk));
  const addWinningsRef = useRef(addWinnings);
  const placeBetRef = useRef(placeBet);
  const riskRef = useRef(risk);
  const stakeRef = useRef(stake);
  const betModeRef = useRef(betMode);
  const targetZoneRef = useRef(targetZoneIndex);
  const sessionRef = useRef(session);
  const lastTickPlayedRef = useRef<Map<number, number>>(new Map());

  useEffect(() => { activeRunsRef.current = activeRuns; }, [activeRuns]);
  useEffect(() => { configRef.current = getRiskConfig(risk); }, [risk]);
  useEffect(() => { addWinningsRef.current = addWinnings; }, [addWinnings]);
  useEffect(() => { placeBetRef.current = placeBet; }, [placeBet]);
  useEffect(() => { riskRef.current = risk; }, [risk]);
  useEffect(() => { stakeRef.current = stake; }, [stake]);
  useEffect(() => { betModeRef.current = betMode; }, [betMode]);
  useEffect(() => { targetZoneRef.current = targetZoneIndex; }, [targetZoneIndex]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const buildRun = useCallback((): Omit<RunDisplay, 'id'> | null => {
    const mode = betModeRef.current;
    const target = mode === 'target' ? targetZoneRef.current : null;
    if (mode === 'target' && target === null) return null;
    return {
      run: generateVolatilityRun(riskRef.current),
      animProgress: 0,
      visibleTickIndex: 0,
      startedAt: performance.now(),
      stake: stakeRef.current,
      mode,
      targetZoneIndex: target,
      lockedTargetPayout: target !== null ? getTargetPayout(target) : null,
      effectivePayout: 0,
    };
  }, []);

  const buildRunRef = useRef(buildRun);
  useEffect(() => { buildRunRef.current = buildRun; }, [buildRun]);

  const queueRuns = useCallback((count: number) => {
    setActiveRuns((prev) => {
      const available = MAX_CONCURRENT_RUNS - prev.length;
      const toAdd = Math.min(count, available);
      if (toAdd <= 0) return prev;

      const newRuns: RunDisplay[] = [];
      for (let i = 0; i < toAdd; i++) {
        const base = buildRunRef.current();
        if (!base) break;
        if (!placeBetRef.current(base.stake)) break;
        newRuns.push({ ...base, id: runIdRef.current++ });
      }

      if (newRuns.length === 0) return prev;
      return [...prev, ...newRuns];
    });
  }, []);

  const generate = useCallback(() => {
    queueRuns(1);
  }, [queueRuns]);

  const startSession = useCallback(
    (total: number) => {
      setSessionSummary(null);
      const newSession: PlinkoSession = {
        total,
        completed: 0,
        startBalance: balance,
        running: true,
        netPL: 0,
        bestPayout: 0,
        wins: 0,
      };
      sessionRef.current = newSession;
      setSession(newSession);
      queueRuns(1);
    },
    [balance, queueRuns],
  );

  const stopSession = useCallback(() => {
    const prev = sessionRef.current;
    if (!prev) return;
    const summary = { ...prev, running: false };
    sessionRef.current = null;
    setSessionSummary(summary);
    setSession(null);
  }, []);

  const dismissSessionSummary = useCallback(() => {
    setSessionSummary(null);
  }, []);

  // Animation loop
  useEffect(() => {
    if (activeRuns.length === 0) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const tickCount = configRef.current.tickCount;

    function tick() {
      const now = performance.now();
      const current = activeRunsRef.current;

      const nextActive: RunDisplay[] = [];
      const justCompleted: RunDisplay[] = [];

      for (const r of current) {
        const elapsed = now - r.startedAt;
        const visibleTickIndex = computeVisibleTickIndex(
          elapsed,
          r.run.quotes.length,
          tickCount,
        );
        const animProgress = computeAnimProgress(elapsed, tickCount);

        const prevTick = lastTickPlayedRef.current.get(r.id);
        if (visibleTickIndex !== prevTick && visibleTickIndex > 0) {
          playTick(r.id, visibleTickIndex);
          lastTickPlayedRef.current.set(r.id, visibleTickIndex);
        }

        if (animProgress >= 1) {
          const effectivePayout = resolveEffectivePayout(
            r.run,
            r.mode,
            r.targetZoneIndex,
            r.lockedTargetPayout,
          );
          justCompleted.push({
            ...r,
            animProgress: 1,
            visibleTickIndex: r.run.quotes.length - 1,
            effectivePayout,
          });
        } else {
          nextActive.push({ ...r, animProgress, visibleTickIndex });
        }
      }

      if (justCompleted.length > 0) {
        const fxItems: SettlementFx[] = [];
        for (const r of justCompleted) {
          const winAmount = r.stake * r.effectivePayout;
          if (winAmount > 0) addWinningsRef.current(winAmount);

          playLand(r.effectivePayout);
          if (r.effectivePayout > 10) playBigWin();
          clearRunTicks(r.id);
          lastTickPlayedRef.current.delete(r.id);

          fxItems.push({
            runId: r.id,
            zoneIndex: r.run.zoneIndex,
            payout: r.effectivePayout,
            won: r.effectivePayout >= 1,
            startedAt: now,
            durationMs: FX_DURATION_MS,
          });

          if (r.effectivePayout > 5) {
            setChartPulse(true);
            setTimeout(() => setChartPulse(false), 600);
          }
        }

        setSettlementFx((prev) => [
          ...prev.filter((f) => now - f.startedAt < f.durationMs),
          ...fxItems,
        ]);

        const latest = justCompleted[justCompleted.length - 1];
        const zoneLabel = getZoneLabel(riskRef.current, latest.run.zoneIndex);
        const zoneColor = getZoneColor(riskRef.current, latest.run.zoneIndex);
        const amount = latest.stake * latest.effectivePayout;
        const pctStr = (latest.run.percentChange * 100).toFixed(2);
        const sign = latest.run.percentChange >= 0 ? 'plus' : 'minus';
        const targetHit =
          latest.mode === 'target' && latest.run.zoneIndex === latest.targetZoneIndex;

        setLastResult({
          payout: latest.effectivePayout,
          amount,
          stake: latest.stake,
          pctChange: latest.run.percentChange,
          zScore: latest.run.zScore,
          zoneIndex: latest.run.zoneIndex,
          zoneLabel,
          zoneColor,
          mode: latest.mode,
          targetZoneIndex: latest.targetZoneIndex,
          targetHit,
        });

        setLiveAnnouncement(
          latest.mode === 'target'
            ? targetHit
              ? `Target hit. ${latest.effectivePayout} times payout in ${zoneLabel} zone`
              : `Target missed. Path landed in ${zoneLabel} zone`
            : `${latest.effectivePayout} times payout in ${zoneLabel} zone, ${sign} ${pctStr} percent move`,
        );

        setHistory((prev) =>
          [
            ...justCompleted.map((r) => ({
              payout: r.effectivePayout,
              pctChange: r.run.percentChange,
              zoneIndex: r.run.zoneIndex,
              zoneLabel: getZoneLabel(riskRef.current, r.run.zoneIndex),
              zoneColor: getZoneColor(riskRef.current, r.run.zoneIndex),
              stake: r.stake,
              winAmount: r.stake * r.effectivePayout,
              mode: r.mode,
              targetHit: r.mode === 'target' && r.run.zoneIndex === r.targetZoneIndex,
            })),
            ...prev,
          ].slice(0, 20),
        );

        setRuns((prev) => [
          ...prev.slice(-(10 - justCompleted.length)),
          ...justCompleted,
        ]);

        setSession((prev) => {
          if (!prev) return null;
          let netPL = prev.netPL;
          let bestPayout = prev.bestPayout;
          let wins = prev.wins;
          for (const r of justCompleted) {
            const winAmount = r.stake * r.effectivePayout;
            netPL += winAmount - r.stake;
            bestPayout = Math.max(bestPayout, r.effectivePayout);
            if (r.effectivePayout >= 1) wins += 1;
          }
          const completed = prev.completed + justCompleted.length;
          const next = { ...prev, completed, netPL, bestPayout, wins };
          if (completed >= prev.total) {
            const summary = { ...next, running: false };
            sessionRef.current = null;
            setSessionSummary(summary);
            return null;
          }
          sessionRef.current = next;
          return next;
        });
      }

      setActiveRuns(nextActive);
      activeRunsRef.current = nextActive;

      if (nextActive.length > 0) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else if (justCompleted.length > 0) {
        const sess = sessionRef.current;
        if (sess?.running) {
          const remaining = sess.total - sess.completed;
          queueRuns(Math.min(MAX_CONCURRENT_RUNS, remaining));
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeRuns.length, playTick, playLand, playBigWin, clearRunTicks, queueRuns]);

  // Clear expired settlement FX once runs go quiet (the chart runs its own
  // rAF while FX are live, so state cleanup here is just housekeeping)
  useEffect(() => {
    if (settlementFx.length === 0) return;
    const maxRemaining = Math.max(
      ...settlementFx.map((f) => f.startedAt + f.durationMs - performance.now()),
    );
    const t = setTimeout(
      () => setSettlementFx((prev) =>
        prev.filter((f) => performance.now() - f.startedAt < f.durationMs),
      ),
      Math.max(50, maxRemaining + 100),
    );
    return () => clearTimeout(t);
  }, [settlementFx]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        stopSession();
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (e.key === ' ') e.preventDefault();
        const atMax = activeRunsRef.current.length >= MAX_CONCURRENT_RUNS;
        const targetReady =
          betModeRef.current !== 'target' || targetZoneRef.current !== null;
        if (
          stakeRef.current <= balance &&
          balance > 0 &&
          !atMax &&
          targetReady &&
          !sessionRef.current?.running
        ) {
          generate();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [balance, generate, stopSession]);

  const config = getRiskConfig(risk);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isAnimating = activeRuns.length > 0;
  const isEmpty = runs.length === 0 && activeRuns.length === 0;
  const phase: PlinkoPhase = isAnimating ? 'running' : isEmpty ? 'ready' : 'settled';
  const targetPayout = targetZoneIndex !== null ? getTargetPayout(targetZoneIndex) : null;
  const canGenerate =
    stake <= balance &&
    balance > 0 &&
    activeRuns.length < MAX_CONCURRENT_RUNS &&
    (betMode !== 'target' || targetZoneIndex !== null);

  return {
    risk,
    setRisk,
    stake,
    setStake,
    betMode,
    setBetMode,
    targetZoneIndex,
    setTargetZoneIndex,
    targetPayout,
    phase,
    runs,
    activeRuns,
    lastResult,
    history,
    session,
    sessionSummary,
    settlementFx,
    chartPulse,
    liveAnnouncement,
    config,
    balance,
    maxStake,
    isAnimating,
    canGenerate,
    generate,
    startSession,
    stopSession,
    dismissSessionSummary,
  };
}
