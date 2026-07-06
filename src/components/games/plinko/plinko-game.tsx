'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getPlinkoConfig,
  getMaxPayout,
  isNetWin,
} from '@/lib/games/plinko';
import { Button } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { useIsLandscape } from '@/hooks/use-landscape';
import { useIsDesktop } from '@/hooks/use-media-query';
import { PlinkoChart } from '@/components/games/plinko/plinko-chart';
import { PlinkoSessionHud } from '@/components/games/plinko/plinko-session-hud';
import { PlinkoSettleChip } from '@/components/games/plinko/plinko-settle-chip';
import { PlinkoModePicker } from '@/components/games/plinko/plinko-mode-picker';
import { PlinkoGoalPicker } from '@/components/games/plinko/plinko-goal-picker';
import { PlinkoDistanceChip } from '@/components/games/plinko/plinko-distance-chip';
import { PlinkoStreakBadge, formatZoneRange } from '@/components/games/plinko/plinko-ui';
import { getPlinkoMode, type BarrierZone } from '@/lib/games/plinko-modes';
import '@/components/games/plinko/plinko-game.css';
import {
  useVolatilityPlinko,
  MAX_CONCURRENT_RUNS,
  SESSION_OPTIONS,
} from '@/hooks/use-volatility-plinko';

const HINT_KEY = 'ideations-plinko-hint-seen';

function PlinkoFirstHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="absolute inset-0 z-10 flex items-center justify-center bg-overlay/40 p-4"
      aria-label="Dismiss hint"
    >
      <span className="plinko-hint-pill">
        Path lands in a zone — the multiplier on the right is what you get paid.
      </span>
    </button>
  );
}

export function PlinkoGame() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 320, height: 240 });
  const [showHint, setShowHint] = useState(false);
  const isLandscape = useIsLandscape();
  const isDesktop = useIsDesktop();

  const {
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
    canAffordSession,
    selectedMode,
    setSelectedMode,
    pendingSessionSize,
    offeredGoals,
    prepareSession,
    cancelSessionPrepare,
    sessionMilestone,
    focusedRunId,
    setFocusedRunId,
    generate,
    startSession,
    stopSession,
    dismissSessionSummary,
  } = useVolatilityPlinko();

  const isEmpty = runs.length === 0 && activeRuns.length === 0;
  const [showResult, setShowResult] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShowHint(!localStorage.getItem(HINT_KEY));
  }, []);

  const dismissHint = useCallback(() => {
    localStorage.setItem(HINT_KEY, '1');
    setShowHint(false);
  }, []);

  useEffect(() => {
    if (!lastResult) return;
    if (playMode.kind !== 'single') return;
    if (showSessionSummary) return;
    if (lastResult.payout <= 5) return;
    setShowResult(true);
  }, [lastResult, playMode.kind, showSessionSummary]);

  useEffect(() => {
    if (sessionSummary) setShowSessionSummary(true);
  }, [sessionSummary]);

  const dismissPathResult = useCallback(() => setShowResult(false), []);

  const handleGenerate = useCallback(() => {
    setShowResult(false);
    generate();
  }, [generate]);

  const handleStartSession = useCallback(
    (total: number, goal: Parameters<typeof startSession>[1]) => {
      setShowResult(false);
      setStopConfirm(false);
      startSession(total, goal);
    },
    [startSession],
  );

  const handleStopSession = useCallback(() => {
    if (
      session &&
      session.total - session.completed > 10 &&
      !stopConfirm
    ) {
      setStopConfirm(true);
      return;
    }
    setStopConfirm(false);
    stopSession();
  }, [session, stopConfirm, stopSession]);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        const h = Math.floor(e.contentRect.height);
        if (w > 0 && h > 0) setChartSize({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const generateLabel =
    activeRuns.length >= MAX_CONCURRENT_RUNS
      ? 'Max paths in flight'
      : activeRuns.length > 0
        ? 'Generate another'
        : 'Generate path';

  const pathNetPL =
    lastResult && showResult ? lastResult.amount - lastResult.stake : 0;

  const modeDef = getPlinkoMode(selectedMode);

  const infoSections: GameInfoSection[] = [
    {
      id: 'about',
      label: 'About',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Two pricing modes share the same payout wall. Split pays more the
            further you land from center; Stripes mixes win/lose bands at each
            distance. 98% RTP on both.
          </p>
          <Link
            href="/provably-fair#volatility-plinko"
            className="inline-block text-xs text-primary hover:underline"
          >
            View full math &amp; payout model →
          </Link>
        </div>
      ),
    },
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          {config.zones.map((zone: BarrierZone, i: number) => (
            <div key={i} className="rounded-lg bg-subtle px-3 py-2 body-xs space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="font-medium text-on-prominent">{zone.label}</span>
                <span
                  className={cn(
                    'ml-auto font-display tabular-nums font-medium',
                    zone.payout >= 1 ? 'text-semantic-win' : 'text-semantic-loss',
                  )}
                >
                  {zone.payout}×
                </span>
              </div>
              <p className="text-on-subtle pl-4">{formatZoneRange(zone)}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'history',
      label: 'History',
      content: (
        <div className="space-y-2">
          {history.length ? (
            history.map((entry, index) => {
              const net = entry.winAmount - entry.stake;
              const won = isNetWin(entry.payout);
              return (
                <div
                  key={`${entry.zoneIndex}-${entry.payout}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-xs"
                >
                  <span className="text-on-subtle truncate">{entry.zoneLabel}</span>
                  <span className="font-display tabular-nums">{entry.payout}×</span>
                  <span
                    className={cn(
                      'font-display tabular-nums',
                      won ? 'text-semantic-win' : 'text-semantic-loss',
                    )}
                  >
                    {net >= 0 ? '+' : ''}
                    {net.toFixed(0)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-on-subtle">No paths generated yet.</p>
          )}
        </div>
      ),
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Select stake, pick a mode, and start a session with a goal — or quick-generate a single path. {(config.targetRTP * 100).toFixed(0)}% RTP · up to {getMaxPayout(selectedMode)}×.</p>
          <p>Session mode runs 5/10/25 paths in batches of up to {MAX_CONCURRENT_RUNS}.</p>
        </div>
      ),
    },
  ];

  return (
    <GameShell infoSections={infoSections} showSymbolPicker={false}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <GameViewport
        play={
          <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 px-layout-margin-inline py-2 space-y-2 border-b border-border-subtle bg-prominent">
              <PlinkoModePicker
                value={selectedMode}
                onChange={setSelectedMode}
                disabled={sessionActive || sessionSettling || isAnimating}
              />
              {session ? (
                <PlinkoSessionHud
                  session={session}
                  stake={stake}
                  netWinStreak={netWinStreak}
                  status={sessionSettling ? 'settling' : 'running'}
                  milestone={sessionMilestone}
                />
              ) : (
                <PlinkoStreakBadge count={netWinStreak} />
              )}
            </div>
            <div
              ref={chartContainerRef}
              className={cn('plinko-chart-root', chartPulse && 'is-pulse')}
            >
              <PlinkoChart
                runs={runs}
                activeRuns={activeRuns}
                width={chartSize.width}
                height={chartSize.height}
                zoneFlashes={zoneFlashes}
                nearMissFlashes={nearMissFlashes}
                settleFloats={settleFloats}
                isEmpty={isEmpty}
                modeId={selectedMode}
                focusedRunId={focusedRunId}
                onFocusRun={setFocusedRunId}
              />
              <PlinkoDistanceChip activeRuns={activeRuns} modeId={selectedMode} />
              {showHint && isEmpty ? <PlinkoFirstHint onDismiss={dismissHint} /> : null}
              <div className="absolute bottom-2 left-0 right-0 z-10 pointer-events-none">
                <PlinkoSettleChip chip={settleChip} />
              </div>
            </div>
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={sessionActive || sessionSettling}
            showSlider={!sessionActive && !sessionSettling && isDesktop}
            footer={
              playError ? (
                <span className="text-semantic-loss">{playError}</span>
              ) : isAnimating ? (
                `${activeRuns.length} path${activeRuns.length === 1 ? '' : 's'} live`
              ) : isLandscape ? (
                `${modeDef.label} · 98% RTP`
              ) : (
                `${modeDef.shortPitch}`
              )
            }
            actions={
              <>
                {pendingSessionSize && offeredGoals.length > 0 ? (
                  <PlinkoGoalPicker
                    total={pendingSessionSize}
                    modeId={selectedMode}
                    goals={offeredGoals}
                    onPick={(goal) => handleStartSession(pendingSessionSize, goal)}
                    onCancel={cancelSessionPrepare}
                  />
                ) : null}
                {sessionActive || sessionSettling ? (
                  <>
                    <div className="text-center text-xs text-on-subtle py-1">
                      {sessionSettling
                        ? 'Finishing in-flight paths…'
                        : `Session running · ${session?.completed ?? 0}/${session?.total ?? 0}`}
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full min-h-[44px]"
                      onClick={handleStopSession}
                    >
                      {stopConfirm ? 'Tap again to stop' : 'Stop session'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      className="w-full min-h-[44px]"
                      disabled={!canGenerate}
                      aria-busy={isAnimating}
                      onClick={handleGenerate}
                    >
                      {generateLabel}
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      {SESSION_OPTIONS.map((n) => {
                        const cost = n * stake;
                        const affordable = canAffordSession(n);
                        return (
                          <Button
                            key={n}
                            variant="secondary"
                            size="sm"
                            className="min-h-[44px] flex flex-col gap-0.5 py-1"
                            disabled={!affordable || isAnimating}
                            onClick={() => prepareSession(n)}
                          >
                            <span>{n} paths</span>
                            <span className="body-xs opacity-80 tabular-nums">
                              {cost.toLocaleString()} cr
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            }
          />
        }
      />

      <ResultOverlay
        open={showResult && !!lastResult && playMode.kind === 'single' && (lastResult.payout > 5)}
        won={isNetWin(lastResult?.payout ?? 0)}
        tier={getResultTierFromPayout(lastResult?.payout ?? 0)}
        title={lastResult ? `${lastResult.payout}× · ${lastResult.zoneLabel}` : ''}
        subtitle={
          lastResult
            ? `${lastResult.pctChange >= 0 ? '+' : ''}${(lastResult.pctChange * 100).toFixed(2)}% move`
            : undefined
        }
        amount={lastResult ? Math.abs(pathNetPL) : undefined}
        amountLabel={pathNetPL >= 0 ? 'net' : 'lost'}
        autoDismissMs={(lastResult?.payout ?? 0) > 5 ? 0 : 1500}
        onDismiss={dismissPathResult}
      />

      <ResultOverlay
        open={showSessionSummary && !!sessionSummary}
        won={(sessionSummary?.netPL ?? 0) >= 0}
        title={
          sessionSummary && sessionSummary.completed < sessionSummary.total
            ? 'Session ended early'
            : 'Session complete'
        }
        subtitle={
          sessionSummary
            ? `${sessionSummary.completed}/${sessionSummary.total} paths · Best ${sessionSummary.bestPayout}× · Goal ${sessionSummary.goalProgress.met ? 'met' : 'missed'}`
            : undefined
        }
        amount={sessionSummary?.netPL}
        amountLabel="net"
        onDismiss={() => {
          setShowSessionSummary(false);
          dismissSessionSummary();
        }}
        primaryAction={{
          label: 'Continue',
          onClick: () => {
            setShowSessionSummary(false);
            dismissSessionSummary();
          },
        }}
      />
    </GameShell>
  );
}
