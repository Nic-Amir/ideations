'use strict';

import type { PlinkoModeId } from '@/lib/games/plinko-modes';
import { isNetWin } from '@/lib/games/plinko';

export type SessionGoal =
  | { kind: 'netWins'; target: number }
  | { kind: 'minPayout'; threshold: number; count: number }
  | { kind: 'streak'; target: number }
  | { kind: 'jackpot'; threshold: number }
  | { kind: 'finishPositive' };

export interface SessionGoalProgress {
  goal: SessionGoal;
  current: number;
  target: number;
  met: boolean;
  label: string;
}

export interface SessionMilestone {
  id: number;
  message: string;
  until: number;
}

function goalLabel(goal: SessionGoal): string {
  switch (goal.kind) {
    case 'netWins':
      return `Win ${goal.target} paths`;
    case 'minPayout':
      return `Hit ${goal.threshold}×+ ${goal.count}×`;
    case 'streak':
      return `Reach ${goal.target}-win streak`;
    case 'jackpot':
      return `Land ${goal.threshold}×+ once`;
    case 'finishPositive':
      return 'Finish in profit';
    default:
      return 'Session goal';
  }
}

export function formatSessionGoal(goal: SessionGoal): string {
  return goalLabel(goal);
}

export function createInitialGoalProgress(goal: SessionGoal): SessionGoalProgress {
  let target = 1;
  switch (goal.kind) {
    case 'minPayout':
      target = goal.count;
      break;
    case 'netWins':
    case 'streak':
      target = goal.target;
      break;
    case 'jackpot':
    case 'finishPositive':
      target = 1;
      break;
    default:
      break;
  }
  return {
    goal,
    current: 0,
    target,
    met: false,
    label: goalLabel(goal),
  };
}

export function evaluateGoalProgress(
  goal: SessionGoal,
  stats: {
    wins: number;
    netPL: number;
    bestPayout: number;
    peakStreak: number;
    minPayoutHits: number;
  },
): SessionGoalProgress {
  let current = 0;
  let target = 1;
  let met = false;

  switch (goal.kind) {
    case 'netWins':
      current = stats.wins;
      target = goal.target;
      met = current >= target;
      break;
    case 'minPayout':
      current = stats.minPayoutHits;
      target = goal.count;
      met = current >= target;
      break;
    case 'streak':
      current = stats.peakStreak;
      target = goal.target;
      met = current >= target;
      break;
    case 'jackpot':
      current = stats.bestPayout >= goal.threshold ? 1 : 0;
      target = 1;
      met = stats.bestPayout >= goal.threshold;
      break;
    case 'finishPositive':
      current = stats.netPL > 0 ? 1 : 0;
      target = 1;
      met = stats.netPL > 0;
      break;
    default:
      break;
  }

  return {
    goal,
    current,
    target,
    met,
    label: goalLabel(goal),
  };
}

function scaledWinsTarget(total: number): number {
  return Math.max(2, Math.ceil(total * 0.55));
}

export function generateSessionGoalOptions(
  modeId: PlinkoModeId,
  total: number,
): SessionGoal[] {
  const winsTarget = scaledWinsTarget(total);
  const streakTarget = total >= 15 ? 3 : 2;

  if (modeId === 'balanced') {
    return [
      { kind: 'minPayout', threshold: 1.5, count: Math.max(2, Math.ceil(total * 0.4)) },
      { kind: 'jackpot', threshold: 3 },
      { kind: 'streak', target: streakTarget },
    ];
  }
  return [
    { kind: 'minPayout', threshold: 1, count: 1 },
    { kind: 'jackpot', threshold: 9 },
    { kind: 'streak', target: streakTarget },
  ];
}

export function pickSessionGoals(
  modeId: PlinkoModeId,
  total: number,
  count = 2,
): SessionGoal[] {
  const pool = generateSessionGoalOptions(modeId, total);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function pickRandomSessionGoal(modeId: PlinkoModeId, total: number): SessionGoal {
  const pool = generateSessionGoalOptions(modeId, total);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getMilestoneMessage(
  completed: number,
  total: number,
  goalProgress: SessionGoalProgress,
): string | null {
  const pct = completed / total;
  if (pct >= 0.75 && completed < total) {
    if (!goalProgress.met) {
      const remaining =
        goalProgress.goal.kind === 'netWins'
          ? goalProgress.target - goalProgress.current
          : goalProgress.goal.kind === 'minPayout'
            ? goalProgress.target - goalProgress.current
            : null;
      if (remaining !== null && remaining > 0) {
        return `${remaining} more for your goal`;
      }
    }
    return 'Final stretch';
  }
  if (pct >= 0.5 && pct < 0.75) return 'Halfway there';
  if (pct >= 0.25 && pct < 0.5) return 'Session warming up';
  return null;
}

export function isWinForMode(_modeId: PlinkoModeId, payout: number, _zScore: number): boolean {
  return isNetWin(payout);
}
