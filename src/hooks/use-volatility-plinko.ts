'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import {
  getPlinkoConfig,
  PLINKO_PATH_ANIM_MS,
  PLINKO_SETTLE_MS,
  PLINKO_REFERENCE_TICK_COUNT,
  generateVolatilityRun,
  getZoneLabel,
  getZoneColor,
  isNetWin,
  isNearMiss,
  PLINKO_START_PRICE,
  DEFAULT_PLINKO_MODE,
  type VolatilityRun,
  type PlinkoModeId,
} from '@/lib/games/plinko';
import {
  type SessionGoal,
  type SessionGoalProgress,
  type SessionMilestone,
  evaluateGoalProgress,
  pickSessionGoals,
  getMilestoneMessage,
} from '@/lib/games/plinko-session-goals';
import { getPlinkoMode } from '@/lib/games/plinko-modes';
import {
  buildShotCall,
  getCallStake,
  settleCall,
  CALL_GROUP_LABELS,
  type CallGroup,
  type ShotCall,
} from '@/lib/games/plinko-call';
import { usePlinkoSound } from '@/hooks/use-plinko-sound';

export type { SessionGoal, SessionGoalProgress, SessionMilestone } from '@/lib/games/plinko-session-goals';
export type { PlinkoModeId } from '@/lib/games/plinko';
export type { CallGroup, ShotCall } from '@/lib/games/plinko-call';

export const MAX_CONCURRENT_RUNS = 5;
export const MAX_VISIBLE_PATHS_MOBILE = 3;
export const SESSION_OPTIONS = [5, 10, 25] as const;
export const START_PRICE = PLINKO_START_PRICE;
export const TICK_MS = PLINKO_PATH_ANIM_MS / getPlinkoConfig().tickCount;
export const SETTLE_MS = PLINKO_SETTLE_MS;
export const ZONE_FLASH_MS = 600;
export const ZONE_FLASH_BIG_MS = 800;
export const NEAR_MISS_FLASH_MS = 900;
export const SETTLE_FLOAT_MS = 1200;
export const PATH_TRAIL_MS = 2000;
export const MAX_TRAIL_PATHS = 3;
export const SETTLE_CHIP_MS = 1800;

export interface RunDisplay {
  id: number;
  run: VolatilityRun;
  animProgress: number;
  /** 0–1 progress along the path reveal phase (smooth, not stepped). */
  pathRevealProgress: number;
  visibleTickIndex: number;
  startedAt: number;
  stake: number;
  /** Optional call-your-shot side bet captured at drop time. */
  call?: ShotCall;
  settledAt?: number;
}

export interface CallResult {
  group: CallGroup;
  label: string;
  stake: number;
  odds: number;
  hit: boolean;
  net: number;
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
  call?: CallResult;
}

export interface HistoryEntry {
  payout: number;
  pctChange: number;
  zoneIndex: number;
  zoneLabel: string;
  zoneColor: string;
  stake: number;
  winAmount: number;
  /** Net P&L of the call side bet, if one was made. */
  callNet?: number;
}

export interface SessionStats {
  total: number;
  completed: number;
  startBalance: number;
  netPL: number;
  bestPayout: number;
  bestZoneLabel: string;
  bestZoneColor: string;
  wins: number;
  goal: SessionGoal;
  goalProgress: SessionGoalProgress;
  peakStreak: number;
  abortReason?: string;
}

export type SessionStatus = 'running' | 'settling' | 'ended' | 'aborted';

export type PlayMode =
  | { kind: 'idle' }
  | { kind: 'single' }
  | {
      kind: 'session';
      total: number;
      completed: number;
      startBalance: number;
      netPL: number;
      wins: number;
      bestPayout: number;
      bestZoneLabel: string;
      bestZoneColor: string;
      peakStreak: number;
      minPayoutHits: number;
      goal: SessionGoal;
      status: SessionStatus;
      abortReason?: string;
    };

export interface ZoneFlash {
  runId: number;
  zoneIndex: number;
  until: number;
}

export interface NearMissFlash {
  runId: number;
  until: number;
}

export interface SettleFloat {
  id: number;
  runId: number;
  netPL: number;
  payout: number;
  zoneIndex: number;
  until: number;
}

export type SettleChipVariant = 'core' | 'nearMiss' | 'micro' | 'win' | 'batch';

export interface SettleChipNotice {
  id: number;
  kind: 'single' | 'batch';
  variant?: SettleChipVariant;
  payout?: number;
  zoneLabel?: string;
  zoneColor?: string;
  netPL: number;
  count?: number;
  wins?: number;
  until: number;
}

function computePathRevealProgress(elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= PLINKO_PATH_ANIM_MS) return 1;
  const t = elapsed / PLINKO_PATH_ANIM_MS;
  // Ease-out: smooth deceleration into settlement
  return 1 - (1 - t) ** 3;
}

function computeVisibleTickIndex(
  pathRevealProgress: number,
  quoteCount: number,
): number {
  const pathTicks = quoteCount - 1;
  return Math.min(Math.floor(pathRevealProgress * pathTicks), pathTicks);
}

function computeAnimProgress(elapsed: number): number {
  const total = PLINKO_PATH_ANIM_MS + PLINKO_SETTLE_MS;
  return Math.min(elapsed / total, 1);
}

function resolveSettleVariant(run: VolatilityRun, modeId: PlinkoModeId): SettleChipVariant {
  if (isNearMiss(run.zoneIndex, run.zScore, modeId)) return 'nearMiss';
  const coreIdx = getPlinkoMode(modeId).coreZoneIndex;
  if ((coreIdx !== null && run.zoneIndex === coreIdx) || run.payout < 1) return 'core';
  if (run.payout <= 1.5) return 'micro';
  return 'win';
}

function buildSessionStats(mode: Extract<PlayMode, { kind: 'session' }>): SessionStats {
  const goalProgress = evaluateGoalProgress(mode.goal, {
    wins: mode.wins,
    netPL: mode.netPL,
    bestPayout: mode.bestPayout,
    peakStreak: mode.peakStreak,
    minPayoutHits: mode.minPayoutHits,
  });
  return {
    total: mode.total,
    completed: mode.completed,
    startBalance: mode.startBalance,
    netPL: mode.netPL,
    bestPayout: mode.bestPayout,
    bestZoneLabel: mode.bestZoneLabel,
    bestZoneColor: mode.bestZoneColor,
    wins: mode.wins,
    goal: mode.goal,
    goalProgress,
    peakStreak: mode.peakStreak,
  };
}

function sessionFromPlayMode(mode: PlayMode): SessionStats | null {
  if (mode.kind !== 'session') return null;
  return buildSessionStats(mode);
}

function advanceSessionMode(
  mode: PlayMode,
  justCompleted: RunDisplay[],
  modeId: PlinkoModeId,
  sessionStreak: number,
): { playMode: PlayMode; summary: SessionStats | null; sessionStreak: number; milestone: string | null } {
  if (mode.kind !== 'session' || mode.status === 'settling' || mode.status === 'aborted') {
    return { playMode: mode, summary: null, sessionStreak, milestone: null };
  }

  let netPL = mode.netPL;
  let bestPayout = mode.bestPayout;
  let bestZoneLabel = mode.bestZoneLabel;
  let bestZoneColor = mode.bestZoneColor;
  let wins = mode.wins;
  let peakStreak = mode.peakStreak;
  let minPayoutHits = mode.minPayoutHits;
  let streak = sessionStreak;

  for (const r of justCompleted) {
    const winAmount = r.stake * r.run.payout;
    netPL += winAmount - r.stake;
    if (r.run.payout > bestPayout) {
      bestPayout = r.run.payout;
      bestZoneLabel = getZoneLabel(r.run.zoneIndex, modeId);
      bestZoneColor = getZoneColor(r.run.zoneIndex, modeId);
    }
    if (isNetWin(r.run.payout)) {
      wins += 1;
      streak += 1;
      peakStreak = Math.max(peakStreak, streak);
    } else {
      streak = 0;
    }
    if (mode.goal.kind === 'minPayout' && r.run.payout >= mode.goal.threshold) {
      minPayoutHits += 1;
    }
  }

  const completed = mode.completed + justCompleted.length;
  const nextStats: Extract<PlayMode, { kind: 'session' }> = {
    ...mode,
    completed,
    netPL,
    bestPayout,
    bestZoneLabel,
    bestZoneColor,
    wins,
    peakStreak,
    minPayoutHits,
  };

  const goalProgress = evaluateGoalProgress(nextStats.goal, {
    wins,
    netPL,
    bestPayout,
    peakStreak,
    minPayoutHits,
  });
  const milestone = getMilestoneMessage(completed, mode.total, goalProgress);

  if (completed >= mode.total) {
    return {
      playMode: { kind: 'idle' },
      summary: buildSessionStats(nextStats),
      sessionStreak: streak,
      milestone,
    };
  }
  return { playMode: nextStats, summary: null, sessionStreak: streak, milestone };
}

export function canAffordSession(total: number, stake: number, balance: number): boolean {
  return total > 0 && stake > 0 && total * stake <= balance && balance > 0;
}

export function useVolatilityPlinko() {
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { playTick, playLand, playBigWin, clearRunTicks } = usePlinkoSound();

  const [stake, setStake] = useState(100);
  const [runs, setRuns] = useState<RunDisplay[]>([]);
  const [activeRuns, setActiveRuns] = useState<RunDisplay[]>([]);
  const [lastResult, setLastResult] = useState<PlinkoResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>({ kind: 'idle' });
  const [sessionSummary, setSessionSummary] = useState<SessionStats | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [zoneFlashes, setZoneFlashes] = useState<ZoneFlash[]>([]);
  const [nearMissFlashes, setNearMissFlashes] = useState<NearMissFlash[]>([]);
  const [settleFloats, setSettleFloats] = useState<SettleFloat[]>([]);
  const [settleChip, setSettleChip] = useState<SettleChipNotice | null>(null);
  const [netWinStreak, setNetWinStreak] = useState(0);
  const [chartPulse, setChartPulse] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [selectedMode, setSelectedMode] = useState<PlinkoModeId>(DEFAULT_PLINKO_MODE);
  const [pendingSessionSize, setPendingSessionSize] = useState<number | null>(null);
  const [offeredGoals, setOfferedGoals] = useState<SessionGoal[]>([]);
  const [sessionMilestone, setSessionMilestone] = useState<SessionMilestone | null>(null);
  const [focusedRunId, setFocusedRunId] = useState<number | null>(null);
  const [calledGroup, setCalledGroup] = useState<CallGroup | null>(null);
  const [animEpoch, setAnimEpoch] = useState(0);

  const runIdRef = useRef(0);
  const floatIdRef = useRef(0);
  const chipIdRef = useRef(0);
  const milestoneIdRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const activeRunsRef = useRef<RunDisplay[]>([]);
  const modeRef = useRef<PlinkoModeId>(DEFAULT_PLINKO_MODE);
  const sessionStreakRef = useRef(0);
  const addWinningsRef = useRef(addWinnings);
  const placeBetRef = useRef(placeBet);
  const stakeRef = useRef(stake);
  const playModeRef = useRef(playMode);
  const pendingStopRef = useRef(false);
  const loopActiveRef = useRef(false);
  const lastTickPlayedRef = useRef<Map<number, number>>(new Map());
  const calledGroupRef = useRef<CallGroup | null>(null);

  useEffect(() => { activeRunsRef.current = activeRuns; }, [activeRuns]);
  useEffect(() => { addWinningsRef.current = addWinnings; }, [addWinnings]);
  useEffect(() => { placeBetRef.current = placeBet; }, [placeBet]);
  useEffect(() => { stakeRef.current = stake; }, [stake]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  useEffect(() => { modeRef.current = selectedMode; }, [selectedMode]);
  useEffect(() => { calledGroupRef.current = calledGroup; }, [calledGroup]);

  // Mode switch clears any pending call when the target mode lacks call support.
  const selectMode = useCallback((mode: PlinkoModeId) => {
    setSelectedMode(mode);
    if (!getPlinkoMode(mode).supportsCalls) setCalledGroup(null);
  }, []);

  const queueRuns = useCallback((count: number, call?: ShotCall | null): number => {
    const current = activeRunsRef.current;
    const available = MAX_CONCURRENT_RUNS - current.length;
    const toAdd = Math.min(count, available);
    if (toAdd <= 0) return 0;

    const currentStake = stakeRef.current;
    const newRuns: RunDisplay[] = [];

    for (let i = 0; i < toAdd; i++) {
      const totalCost = currentStake + (call ? call.stake : 0);
      if (!placeBetRef.current(totalCost)) break;
      const run = generateVolatilityRun(modeRef.current);
      const id = runIdRef.current++;
      newRuns.push({
        id,
        run,
        animProgress: 0,
        pathRevealProgress: 0,
        visibleTickIndex: 0,
        startedAt: performance.now(),
        stake: currentStake,
        call: call ?? undefined,
      });
    }

    if (newRuns.length === 0) return 0;

    if (current.length === 0 && playModeRef.current.kind === 'session') {
      setRuns([]);
    }

    const next = [...current, ...newRuns];
    activeRunsRef.current = next;
    setActiveRuns(next);
    setAnimEpoch((e) => e + 1);
    return newRuns.length;
  }, []);

  const runAnimTickRef = useRef<() => void>(() => {});

  const abortSession = useCallback((reason: string) => {
    const mode = playModeRef.current;
    if (mode.kind !== 'session') return;
    const summary = buildSessionStats(mode);
    setPlayMode({ kind: 'idle' });
    playModeRef.current = { kind: 'idle' };
    setSessionSummary({ ...summary, abortReason: reason });
    setPlayError(reason);
  }, []);


  const queueRun = useCallback((): boolean => {
    // Call side bets apply to single drops only, never to session paths,
    // and only in modes that support them.
    const group =
      playModeRef.current.kind === 'session' || !getPlinkoMode(modeRef.current).supportsCalls
        ? null
        : calledGroupRef.current;
    const call = group ? buildShotCall(group, stakeRef.current) : null;
    return queueRuns(1, call) === 1;
  }, [queueRuns]);

  const generate = useCallback(() => {
    setPlayError(null);
    setSessionSummary(null);
    setRuns([]);
    if (!queueRun()) {
      setPlayError('Not enough credits for this stake.');
      return;
    }
    setPlayMode((prev) => (prev.kind === 'idle' ? { kind: 'single' } : prev));
    if (playModeRef.current.kind === 'idle') {
      playModeRef.current = { kind: 'single' };
    }
  }, [queueRun]);

  const prepareSession = useCallback(
    (total: number) => {
      setPlayError(null);
      if (!canAffordSession(total, stakeRef.current, balance)) {
        setPlayError(`Need ${(total * stakeRef.current).toLocaleString()} credits for ${total} paths.`);
        return;
      }
      setPendingSessionSize(total);
      setOfferedGoals(pickSessionGoals(modeRef.current, total, 2));
    },
    [balance],
  );

  const cancelSessionPrepare = useCallback(() => {
    setPendingSessionSize(null);
    setOfferedGoals([]);
  }, []);

  const startSession = useCallback(
    (total: number, goal: SessionGoal) => {
      setPlayError(null);
      setSessionSummary(null);
      setPendingSessionSize(null);
      setOfferedGoals([]);
      const currentStake = stakeRef.current;
      if (!canAffordSession(total, currentStake, balance)) {
        setPlayError(`Need ${(total * currentStake).toLocaleString()} credits for ${total} paths.`);
        return false;
      }

      sessionStreakRef.current = 0;
      const newMode: PlayMode = {
        kind: 'session',
        total,
        completed: 0,
        startBalance: balance,
        netPL: 0,
        bestPayout: 0,
        bestZoneLabel: '',
        bestZoneColor: '#7B8794',
        wins: 0,
        peakStreak: 0,
        minPayoutHits: 0,
        goal,
        status: 'running',
      };
      playModeRef.current = newMode;
      setPlayMode(newMode);
      setRuns([]);

      const placed = queueRuns(Math.min(MAX_CONCURRENT_RUNS, total));
      if (placed === 0) {
        setPlayMode({ kind: 'idle' });
        playModeRef.current = { kind: 'idle' };
        setPlayError('Not enough credits to start session.');
        return false;
      }
      return true;
    },
    [balance, queueRuns],
  );

  const finalizeStopSession = useCallback(() => {
    const mode = playModeRef.current;
    if (mode.kind !== 'session') return;
    setSessionSummary(buildSessionStats(mode));
    setPlayMode({ kind: 'idle' });
    playModeRef.current = { kind: 'idle' };
    pendingStopRef.current = false;
  }, []);

  const stopSession = useCallback(() => {
    const mode = playModeRef.current;
    if (mode.kind !== 'session') return;

    if (activeRunsRef.current.length > 0) {
      pendingStopRef.current = true;
      setPlayMode({ ...mode, status: 'settling' });
      playModeRef.current = { ...mode, status: 'settling' };
      return;
    }
    finalizeStopSession();
  }, [finalizeStopSession]);

  const dismissSessionSummary = useCallback(() => {
    setSessionSummary(null);
    setPlayError(null);
    setPlayMode({ kind: 'idle' });
    playModeRef.current = { kind: 'idle' };
  }, []);

  const returnToIdle = useCallback(() => {
    if (activeRunsRef.current.length > 0) return;
    setPlayMode((prev) => {
      if (prev.kind === 'single') {
        playModeRef.current = { kind: 'idle' };
        return { kind: 'idle' };
      }
      return prev;
    });
  }, []);

  // Animation loop — ref-driven so batch handoffs (5→5 paths) keep ticking
  useEffect(() => {
    function tick() {
      const now = performance.now();
      const current = activeRunsRef.current;

      if (current.length === 0) {
        loopActiveRef.current = false;
        if (pendingStopRef.current) finalizeStopSession();
        else returnToIdle();
        return;
      }

      const nextActive: RunDisplay[] = [];
      const justCompleted: RunDisplay[] = [];

      for (const r of current) {
        const elapsed = now - r.startedAt;
        const pathRevealProgress = computePathRevealProgress(elapsed);
        const visibleTickIndex = computeVisibleTickIndex(
          pathRevealProgress,
          r.run.quotes.length,
        );
        const animProgress = computeAnimProgress(elapsed);

        const prevTick = lastTickPlayedRef.current.get(r.id);
        const tickStride = Math.max(1, Math.floor((r.run.quotes.length - 1) / PLINKO_REFERENCE_TICK_COUNT));
        if (
          visibleTickIndex !== prevTick &&
          visibleTickIndex > 0 &&
          (visibleTickIndex % tickStride === 0 || visibleTickIndex === r.run.quotes.length - 1)
        ) {
          playTick(r.id, visibleTickIndex);
          lastTickPlayedRef.current.set(r.id, visibleTickIndex);
        }

        if (animProgress >= 1) {
          justCompleted.push({
            ...r,
            animProgress: 1,
            pathRevealProgress: 1,
            visibleTickIndex: r.run.quotes.length - 1,
          });
        } else {
          nextActive.push({ ...r, animProgress, pathRevealProgress, visibleTickIndex });
        }
      }

      if (justCompleted.length > 0) {
        const flashes: ZoneFlash[] = [];
        const nearMisses: NearMissFlash[] = [];
        const floats: SettleFloat[] = [];
        const modeAtSettle = playModeRef.current;
        const isBatch = justCompleted.length > 1;

        const modeId = modeRef.current;
        const callResults = new Map<number, CallResult>();

        for (const r of justCompleted) {
          const winAmount = r.stake * r.run.payout;
          let netPL = winAmount - r.stake;
          if (winAmount > 0) addWinningsRef.current(winAmount);

          if (r.call) {
            const outcome = settleCall(r.call, r.run.zoneIndex, modeId);
            if (outcome.winAmount > 0) addWinningsRef.current(outcome.winAmount);
            netPL += outcome.net;
            callResults.set(r.id, {
              group: r.call.group,
              label: CALL_GROUP_LABELS[r.call.group],
              stake: r.call.stake,
              odds: r.call.odds,
              hit: outcome.hit,
              net: outcome.net,
            });
            if (outcome.hit && r.call.odds >= 5) playBigWin();
          }

          playLand(r.run.payout);
          if (r.run.payout > 10) playBigWin();
          clearRunTicks(r.id);
          lastTickPlayedRef.current.delete(r.id);

          const flashMs = r.run.payout > 5 ? ZONE_FLASH_BIG_MS : ZONE_FLASH_MS;
          flashes.push({
            runId: r.id,
            zoneIndex: r.run.zoneIndex,
            until: now + flashMs,
          });

          if (isNearMiss(r.run.zoneIndex, r.run.zScore, modeId)) {
            nearMisses.push({ runId: r.id, until: now + NEAR_MISS_FLASH_MS });
          }

          if (!isBatch) {
            floats.push({
              id: floatIdRef.current++,
              runId: r.id,
              netPL,
              payout: r.run.payout,
              zoneIndex: r.run.zoneIndex,
              until: now + SETTLE_FLOAT_MS,
            });
          }

          if (r.run.payout > 5) {
            setChartPulse(true);
            setTimeout(() => setChartPulse(false), 600);
          }
        }

        setNetWinStreak((prev) => {
          let streak = prev;
          for (const r of justCompleted) {
            if (isNetWin(r.run.payout)) streak += 1;
            else streak = 0;
          }
          return streak;
        });

        if (isBatch) {
          const batchNet = justCompleted.reduce(
            (sum, r) => sum + r.stake * r.run.payout - r.stake,
            0,
          );
          const batchWins = justCompleted.filter((r) => isNetWin(r.run.payout)).length;
          setSettleChip({
            id: chipIdRef.current++,
            kind: 'batch',
            variant: 'batch',
            netPL: batchNet,
            count: justCompleted.length,
            wins: batchWins,
            until: now + SETTLE_CHIP_MS,
          });
        } else if (modeAtSettle.kind === 'single') {
          const r = justCompleted[0];
          const callNet = callResults.get(r.id)?.net ?? 0;
          const netPL = r.stake * r.run.payout - r.stake + callNet;
          const zoneLabel = getZoneLabel(r.run.zoneIndex, modeId);
          const zoneColor = getZoneColor(r.run.zoneIndex, modeId);
          const variant = resolveSettleVariant(r.run, modeId);

          if (r.run.payout <= 5) {
            setSettleChip({
              id: chipIdRef.current++,
              kind: 'single',
              variant,
              payout: r.run.payout,
              zoneLabel,
              zoneColor,
              netPL,
              until: now + SETTLE_CHIP_MS,
            });
            setSettleFloats((prev) => prev.filter((f) => f.runId !== r.id));
          }
        }

        setZoneFlashes((prev) => [...prev, ...flashes]);
        setNearMissFlashes((prev) => [...prev, ...nearMisses]);
        if (!isBatch) {
          setSettleFloats((prev) => [...prev, ...floats]);
        }

        const latest = justCompleted[justCompleted.length - 1];
        const zoneLabel = getZoneLabel(latest.run.zoneIndex, modeId);
        const zoneColor = getZoneColor(latest.run.zoneIndex, modeId);
        const amount = latest.stake * latest.run.payout;
        const pctStr = (latest.run.percentChange * 100).toFixed(2);
        const sign = latest.run.percentChange >= 0 ? 'plus' : 'minus';

        const latestCall = callResults.get(latest.id);

        setLastResult({
          payout: latest.run.payout,
          amount,
          stake: latest.stake,
          pctChange: latest.run.percentChange,
          zScore: latest.run.zScore,
          zoneIndex: latest.run.zoneIndex,
          zoneLabel,
          zoneColor,
          call: latestCall,
        });

        setLiveAnnouncement(
          `${latest.run.payout} times payout in ${zoneLabel} zone, ${sign} ${pctStr} percent move` +
            (latestCall
              ? latestCall.hit
                ? `. Called shot hit, plus ${latestCall.net.toFixed(0)} credits`
                : '. Called shot missed'
              : ''),
        );

        setHistory((prev) =>
          [
            ...justCompleted.map((r) => ({
              payout: r.run.payout,
              pctChange: r.run.percentChange,
              zoneIndex: r.run.zoneIndex,
              zoneLabel: getZoneLabel(r.run.zoneIndex, modeId),
              zoneColor: getZoneColor(r.run.zoneIndex, modeId),
              stake: r.stake,
              winAmount: r.stake * r.run.payout,
              callNet: callResults.get(r.id)?.net,
            })),
            ...prev,
          ].slice(0, 20),
        );

        setRuns((prev) => {
          const fresh = justCompleted.map((r) => ({ ...r, settledAt: now }));
          const kept = prev.filter(
            (r) => r.settledAt !== undefined && now - r.settledAt < PATH_TRAIL_MS,
          );
          return [...kept, ...fresh].slice(-MAX_TRAIL_PATHS);
        });

        const mode = playModeRef.current;
        if (mode.kind === 'session' && mode.status === 'running') {
          const {
            playMode: nextMode,
            summary,
            sessionStreak,
            milestone,
          } = advanceSessionMode(mode, justCompleted, modeId, sessionStreakRef.current);
          sessionStreakRef.current = sessionStreak;
          playModeRef.current = nextMode;
          setPlayMode(nextMode);
          if (milestone) {
            setSessionMilestone({
              id: milestoneIdRef.current++,
              message: milestone,
              until: performance.now() + 2200,
            });
          }
          if (summary) {
            setSessionSummary(summary);
          }
        }
      }

      setActiveRuns(nextActive);
      activeRunsRef.current = nextActive;

      setRuns((prev) =>
        prev.filter((r) => r.settledAt === undefined || now - r.settledAt < PATH_TRAIL_MS),
      );

      setZoneFlashes((prev) => prev.filter((f) => f.until > now));
      setNearMissFlashes((prev) => prev.filter((f) => f.until > now));
      setSettleFloats((prev) => prev.filter((f) => f.until > now));
      setSettleChip((prev) => (prev && prev.until > now ? prev : null));

      setSessionMilestone((prev) => (prev && prev.until > now ? prev : null));

      if (nextActive.length === 0 && justCompleted.length > 0) {
        const mode = playModeRef.current;
        if (mode.kind === 'session' && mode.status === 'running') {
          const remaining = mode.total - mode.completed;
          if (remaining > 0) {
            const placed = queueRuns(Math.min(MAX_CONCURRENT_RUNS, remaining));
            if (placed === 0) {
              abortSession('Not enough credits to continue session.');
            }
          }
        }
        if (activeRunsRef.current.length === 0) {
          loopActiveRef.current = false;
          if (pendingStopRef.current) finalizeStopSession();
          else returnToIdle();
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(() => runAnimTickRef.current());
    }

    runAnimTickRef.current = tick;

    loopActiveRef.current = false;
    if (activeRunsRef.current.length > 0) {
      loopActiveRef.current = true;
      animFrameRef.current = requestAnimationFrame(() => runAnimTickRef.current());
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      loopActiveRef.current = false;
    };
  }, [
    animEpoch,
    playTick,
    playLand,
    playBigWin,
    clearRunTicks,
    queueRuns,
    abortSession,
    finalizeStopSession,
    returnToIdle,
  ]);

  // Keyboard shortcuts — single mode only
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
        const mode = playModeRef.current;
        if (mode.kind === 'session') return;
        const atMax = activeRunsRef.current.length >= MAX_CONCURRENT_RUNS;
        if (stakeRef.current <= balance && balance > 0 && !atMax) {
          generate();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [balance, generate, stopSession]);

  const config = getPlinkoConfig(selectedMode);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isAnimating = activeRuns.length > 0;
  const sessionActive = playMode.kind === 'session' && playMode.status === 'running';
  const sessionSettling = playMode.kind === 'session' && playMode.status === 'settling';
  const dropCost = stake + (calledGroup ? getCallStake(stake) : 0);
  const canGenerate =
    dropCost <= balance && balance > 0 && activeRuns.length < MAX_CONCURRENT_RUNS && !sessionActive && !sessionSettling;

  const session = sessionFromPlayMode(playMode);

  return {
    stake,
    setStake,
    runs,
    activeRuns,
    lastResult,
    history,
    playMode,
    session,
    sessionSummary,
    playError,
    zoneFlashes,
    nearMissFlashes,
    settleFloats,
    settleChip,
    netWinStreak,
    chartPulse,
    liveAnnouncement,
    config,
    balance,
    maxStake,
    isAnimating,
    sessionActive,
    sessionSettling,
    canGenerate,
    canAffordSession: (total: number) => canAffordSession(total, stake, balance),
    selectedMode,
    setSelectedMode: selectMode,
    pendingSessionSize,
    offeredGoals,
    prepareSession,
    cancelSessionPrepare,
    sessionMilestone,
    focusedRunId,
    setFocusedRunId,
    calledGroup,
    setCalledGroup,
    dropCost,
    generate,
    startSession,
    stopSession,
    dismissSessionSummary,
  };
}
