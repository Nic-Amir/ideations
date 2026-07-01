'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import {
  getRiskConfig,
  generateVolatilityRun,
  getZoneLabel,
  getZoneColor,
  type VolatilityRun,
} from '@/lib/games/plinko';
import type { PlinkoRisk } from '@/types';
import { usePlinkoSound } from '@/hooks/use-plinko-sound';

export { isNetWin } from '@/lib/games/plinko';

export const MAX_CONCURRENT_RUNS = 5;
export const SESSION_OPTIONS = [5, 10, 25] as const;
export const START_PRICE = 1000;
export const TICK_MS = 70;
export const SETTLE_MS = 400;
export const ZONE_FLASH_MS = 600;

export interface RunDisplay {
  id: number;
  run: VolatilityRun;
  animProgress: number;
  visibleTickIndex: number;
  startedAt: number;
  stake: number;
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
}

export interface HistoryEntry {
  payout: number;
  pctChange: number;
  zoneIndex: number;
  zoneLabel: string;
  zoneColor: string;
  stake: number;
  winAmount: number;
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

export interface ZoneFlash {
  runId: number;
  zoneIndex: number;
  until: number;
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
  const [runs, setRuns] = useState<RunDisplay[]>([]);
  const [activeRuns, setActiveRuns] = useState<RunDisplay[]>([]);
  const [lastResult, setLastResult] = useState<PlinkoResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [session, setSession] = useState<PlinkoSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<PlinkoSession | null>(null);
  const [zoneFlashes, setZoneFlashes] = useState<ZoneFlash[]>([]);
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
  const sessionRef = useRef(session);
  const lastTickPlayedRef = useRef<Map<number, number>>(new Map());

  useEffect(() => { activeRunsRef.current = activeRuns; }, [activeRuns]);
  useEffect(() => { configRef.current = getRiskConfig(risk); }, [risk]);
  useEffect(() => { addWinningsRef.current = addWinnings; }, [addWinnings]);
  useEffect(() => { placeBetRef.current = placeBet; }, [placeBet]);
  useEffect(() => { riskRef.current = risk; }, [risk]);
  useEffect(() => { stakeRef.current = stake; }, [stake]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const queueRun = useCallback((): boolean => {
    let placed = false;
    setActiveRuns((prev) => {
      if (prev.length >= MAX_CONCURRENT_RUNS) return prev;
      const currentStake = stakeRef.current;
      const currentRisk = riskRef.current;
      if (!placeBetRef.current(currentStake)) return prev;

      const run = generateVolatilityRun(currentRisk);
      const id = runIdRef.current++;
      placed = true;
      return [
        ...prev,
        {
          id,
          run,
          animProgress: 0,
          visibleTickIndex: 0,
          startedAt: performance.now(),
          stake: currentStake,
        },
      ];
    });
    return placed;
  }, []);

  const queueRuns = useCallback((count: number) => {
    setActiveRuns((prev) => {
      const available = MAX_CONCURRENT_RUNS - prev.length;
      const toAdd = Math.min(count, available);
      if (toAdd <= 0) return prev;

      const currentStake = stakeRef.current;
      const currentRisk = riskRef.current;
      const newRuns: RunDisplay[] = [];

      for (let i = 0; i < toAdd; i++) {
        if (!placeBetRef.current(currentStake)) break;
        const run = generateVolatilityRun(currentRisk);
        const id = runIdRef.current++;
        newRuns.push({
          id,
          run,
          animProgress: 0,
          visibleTickIndex: 0,
          startedAt: performance.now(),
          stake: currentStake,
        });
      }

      if (newRuns.length === 0) return prev;
      return [...prev, ...newRuns];
    });
  }, []);

  const generate = useCallback(() => {
    queueRun();
  }, [queueRun]);

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
      queueRun();
    },
    [balance, queueRun],
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
          justCompleted.push({ ...r, animProgress: 1, visibleTickIndex: r.run.quotes.length - 1 });
        } else {
          nextActive.push({ ...r, animProgress, visibleTickIndex });
        }
      }

      if (justCompleted.length > 0) {
        const flashes: ZoneFlash[] = [];
        for (const r of justCompleted) {
          const winAmount = r.stake * r.run.payout;
          if (winAmount > 0) addWinningsRef.current(winAmount);

          playLand(r.run.payout);
          if (r.run.payout > 10) playBigWin();
          clearRunTicks(r.id);
          lastTickPlayedRef.current.delete(r.id);

          flashes.push({
            runId: r.id,
            zoneIndex: r.run.zoneIndex,
            until: now + ZONE_FLASH_MS,
          });

          if (r.run.payout > 5) {
            setChartPulse(true);
            setTimeout(() => setChartPulse(false), 600);
          }
        }

        setZoneFlashes((prev) => [...prev, ...flashes]);

        const latest = justCompleted[justCompleted.length - 1];
        const zoneLabel = getZoneLabel(riskRef.current, latest.run.zoneIndex);
        const zoneColor = getZoneColor(riskRef.current, latest.run.zoneIndex);
        const amount = latest.stake * latest.run.payout;
        const pctStr = (latest.run.percentChange * 100).toFixed(2);
        const sign = latest.run.percentChange >= 0 ? 'plus' : 'minus';

        setLastResult({
          payout: latest.run.payout,
          amount,
          stake: latest.stake,
          pctChange: latest.run.percentChange,
          zScore: latest.run.zScore,
          zoneIndex: latest.run.zoneIndex,
          zoneLabel,
          zoneColor,
        });

        setLiveAnnouncement(
          `${latest.run.payout} times payout in ${zoneLabel} zone, ${sign} ${pctStr} percent move`,
        );

        setHistory((prev) =>
          [
            ...justCompleted.map((r) => ({
              payout: r.run.payout,
              pctChange: r.run.percentChange,
              zoneIndex: r.run.zoneIndex,
              zoneLabel: getZoneLabel(riskRef.current, r.run.zoneIndex),
              zoneColor: getZoneColor(riskRef.current, r.run.zoneIndex),
              stake: r.stake,
              winAmount: r.stake * r.run.payout,
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
            const winAmount = r.stake * r.run.payout;
            netPL += winAmount - r.stake;
            bestPayout = Math.max(bestPayout, r.run.payout);
            if (r.run.payout >= 1) wins += 1;
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

      setZoneFlashes((prev) => prev.filter((f) => f.until > now));

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
        const isAnimating = activeRunsRef.current.length > 0;
        const atMax = activeRunsRef.current.length >= MAX_CONCURRENT_RUNS;
        if (
          stakeRef.current <= balance &&
          balance > 0 &&
          !atMax &&
          !sessionRef.current?.running
        ) {
          generate();
        } else if (sessionRef.current?.running && !atMax) {
          queueRun();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [balance, generate, queueRun, stopSession]);

  const config = getRiskConfig(risk);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isAnimating = activeRuns.length > 0;
  const canGenerate =
    stake <= balance && balance > 0 && activeRuns.length < MAX_CONCURRENT_RUNS;

  return {
    risk,
    setRisk,
    stake,
    setStake,
    runs,
    activeRuns,
    lastResult,
    history,
    session,
    sessionSummary,
    zoneFlashes,
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
