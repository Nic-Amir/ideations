'use client';

import { Card, CardContent, Progress } from '@trading-game/design-intelligence-layer';
import { cn } from '@/lib/utils';
import { PlinkoStreakBadge } from '@/components/games/plinko/plinko-ui';
import type { SessionMilestone, SessionStats } from '@/hooks/use-volatility-plinko';

export interface PlinkoSessionHudProps {
  session: SessionStats;
  stake: number;
  netWinStreak: number;
  status?: 'running' | 'settling';
  milestone?: SessionMilestone | null;
}

export function PlinkoSessionHud({
  session,
  stake,
  netWinStreak,
  status = 'running',
  milestone,
}: PlinkoSessionHudProps) {
  const pct = Math.round((session.completed / session.total) * 100);
  const remaining = session.total - session.completed;
  const atRisk = remaining * stake;
  const netPositive = session.netPL >= 0;
  const { goalProgress } = session;

  const goalCurrent =
    goalProgress.goal.kind === 'finishPositive'
      ? netPositive
        ? 1
        : 0
      : goalProgress.current;
  const goalTarget = goalProgress.target;
  const goalPct = goalTarget > 0 ? Math.min(100, Math.round((goalCurrent / goalTarget) * 100)) : 0;

  return (
    <Card className="border-border-subtle bg-subtle shadow-none py-0 gap-0">
      <CardContent className="space-y-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="body-sm font-display tabular-nums text-on-prominent">
            {session.completed}/{session.total} paths
          </span>
          {status === 'settling' ? (
            <span className="body-xs text-on-subtle">Settling…</span>
          ) : (
            <span className="body-xs text-on-subtle tabular-nums">
              {session.wins} wins · {atRisk.toLocaleString()} cr at risk
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="body-xs text-on-subtle">P/L</span>
            <span
              className={cn(
                'body-sm font-display font-semibold tabular-nums',
                netPositive ? 'text-semantic-win' : 'text-semantic-loss',
              )}
            >
              {netPositive ? '+' : ''}
              {session.netPL.toFixed(0)}
            </span>
            <PlinkoStreakBadge count={netWinStreak} />
          </div>
        </div>

        <Progress value={pct} className="h-1" />

        <div className="rounded-md bg-card/80 px-2.5 py-2 space-y-1.5 border border-border-subtle">
          <div className="flex items-center justify-between gap-2">
            <span className="body-xs text-on-subtle">Goal</span>
            <span
              className={cn(
                'body-xs font-display tabular-nums',
                goalProgress.met ? 'text-semantic-win' : 'text-on-prominent',
              )}
            >
              {goalProgress.label}
              {goalProgress.met ? ' ✓' : ''}
            </span>
          </div>
          {goalProgress.goal.kind !== 'finishPositive' ? (
            <Progress
              value={goalPct}
              className={cn('h-0.5', goalProgress.met && '[&>div]:bg-semantic-win')}
            />
          ) : null}
        </div>

        {milestone ? (
          <p className="body-xs text-center text-primary font-display">{milestone.message}</p>
        ) : null}

        {session.bestPayout > 0 ? (
          <div className="flex items-center justify-between gap-2 body-xs text-on-subtle">
            <span>Best hit</span>
            <span className="inline-flex items-center gap-1.5 font-display tabular-nums text-on-prominent">
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: session.bestZoneColor }}
              />
              {session.bestPayout}× · {session.bestZoneLabel}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
