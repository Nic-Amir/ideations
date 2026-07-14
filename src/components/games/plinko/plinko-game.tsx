'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMaxPayout, isNetWin } from '@/lib/games/plinko';
import {
  CALL_GROUP_LABELS,
  getCallOdds,
  getCallStake,
  type CallGroup,
} from '@/lib/games/plinko-call';
import { Button } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { useIsDesktop } from '@/hooks/use-media-query';
import { PlinkoChart } from '@/components/games/plinko/plinko-chart';
import { PlinkoSessionHud } from '@/components/games/plinko/plinko-session-hud';
import { PlinkoSettleChip } from '@/components/games/plinko/plinko-settle-chip';
import { PlinkoGoalPicker } from '@/components/games/plinko/plinko-goal-picker';
import { PlinkoDistanceChip } from '@/components/games/plinko/plinko-distance-chip';
import { PlinkoStreakBadge, formatZoneRange } from '@/components/games/plinko/plinko-ui';
import {
  getPlinkoMode,
  PLINKO_MODE_IDS,
  type BarrierZone,
  type PlinkoModeId,
} from '@/lib/games/plinko-modes';
import '@/components/games/plinko/plinko-game.css';
import {
  useVolatilityPlinko,
  MAX_CONCURRENT_RUNS,
  SESSION_OPTIONS,
} from '@/hooks/use-volatility-plinko';

const HINT_KEY = 'ideations-plinko-hint-seen';

function PlinkoFirstHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
      <button
        type="button"
        onClick={onDismiss}
        className="plinko-hint-pill pointer-events-auto flex items-center gap-2"
        aria-label="Dismiss hint"
      >
        <span>Drop a path. Its landing band sets your payout.</span>
        <X className="size-3.5 shrink-0" aria-hidden />
      </button>
    </div>
  );
}

/** Compact on-chart mode switch (Box-O instrument-chip style). */
function PlinkoModeChip({
  value,
  onChange,
  disabled,
}: {
  value: PlinkoModeId;
  onChange: (mode: PlinkoModeId) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Pricing mode"
      className="flex rounded-full border border-border-subtle bg-card/90 p-0.5 backdrop-blur-sm"
    >
      {PLINKO_MODE_IDS.map((id) => {
        const mode = getPlinkoMode(id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              'rounded-full px-3 py-1 text-[10px] font-semibold transition-colors min-h-[32px]',
              value === id
                ? 'bg-prominent text-on-prominent shadow-sm'
                : 'text-on-subtle hover:text-on-prominent',
              disabled && 'opacity-60',
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function PlinkoSessionSheet({
  open,
  stake,
  modeId,
  pendingSize,
  goals,
  canAfford,
  playError,
  onPickSize,
  onPickGoal,
  onBackToSizes,
  onClose,
}: {
  open: boolean;
  stake: number;
  modeId: PlinkoModeId;
  pendingSize: number | null;
  goals: Parameters<typeof PlinkoGoalPicker>[0]['goals'];
  canAfford: (n: number) => boolean;
  playError: string | null;
  onPickSize: (n: number) => void;
  onPickGoal: (goal: Parameters<typeof PlinkoGoalPicker>[0]['goals'][number]) => void;
  onBackToSizes: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl border border-border-subtle bg-card p-4 pb-safe"
          >
            <div className="flex items-center justify-between gap-2 pb-3">
              <p className="font-display text-sm font-bold text-on-prominent">
                {pendingSize && goals.length > 0
                  ? `Pick a goal — ${pendingSize} paths`
                  : 'Start a session'}
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-full p-1.5 text-on-subtle hover:text-on-prominent"
              >
                <X className="size-4" />
              </button>
            </div>

            {playError ? (
              <p className="pb-2 text-xs text-semantic-loss">{playError}</p>
            ) : null}

            {pendingSize && goals.length > 0 ? (
              <PlinkoGoalPicker
                total={pendingSize}
                modeId={modeId}
                goals={goals}
                onPick={onPickGoal}
                onCancel={onBackToSizes}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {SESSION_OPTIONS.map((n) => {
                  const cost = n * stake;
                  const affordable = canAfford(n);
                  return (
                    <Button
                      key={n}
                      variant="secondary"
                      size="sm"
                      className="min-h-[56px] flex flex-col gap-0.5 py-1"
                      disabled={!affordable}
                      onClick={() => onPickSize(n)}
                    >
                      <span className="font-display font-bold">{n} paths</span>
                      <span className="body-xs opacity-80 tabular-nums">
                        {cost.toLocaleString()} cr
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function PlinkoGame() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 320, height: 240 });
  const [showHint, setShowHint] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    calledGroup,
    setCalledGroup,
    dropCost,
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
    if (lastResult.payout <= 5 && !lastResult.call?.hit) return;
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

  const supportsCalls = getPlinkoMode(selectedMode).supportsCalls;
  const supportsSessions = getPlinkoMode(selectedMode).supportsSessions;

  const toggleCallGroup = useCallback(
    (group: CallGroup) => {
      if (sessionActive || sessionSettling || !supportsCalls) return;
      setCalledGroup((prev) => (prev === group ? null : group));
    },
    [sessionActive, sessionSettling, supportsCalls, setCalledGroup],
  );

  const handleStartSession = useCallback(
    (total: number, goal: Parameters<typeof startSession>[1]) => {
      setShowResult(false);
      setStopConfirm(false);
      setSheetOpen(false);
      startSession(total, goal);
    },
    [startSession],
  );

  const closeSheet = useCallback(() => {
    cancelSessionPrepare();
    setSheetOpen(false);
  }, [cancelSessionPrepare]);

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

  const pathNetPL =
    lastResult && showResult
      ? lastResult.amount - lastResult.stake + (lastResult.call?.net ?? 0)
      : 0;

  const modeDef = getPlinkoMode(selectedMode);
  const callOdds = calledGroup ? getCallOdds(calledGroup) : null;
  const callStake = calledGroup ? getCallStake(stake) : null;

  // Simple mode collapses the 11-zone wall into two readable payout rows.
  const payoutRows: BarrierZone[] =
    modeDef.chartStyle === 'simple'
      ? [
          { ...config.zones[3], label: 'Win', maxSigma: Infinity },
          { ...config.zones[5], label: 'Refund', minSigma: 0, maxSigma: 1 },
        ]
      : config.zones;

  const infoSections: GameInfoSection[] = [
    {
      id: 'about',
      label: 'About',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Three modes on the same volatility wall, easiest first. Simple:
            land outside the ±1σ lines and your stake doubles, inside refunds
            half. Split pays more the further you land from center; Stripes
            mixes win/lose bands at each distance. ~98% RTP on all three.
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
    ...(supportsCalls
      ? [
          {
            id: 'call',
            label: 'Call your shot',
            content: (
              <div className="space-y-2 text-sm text-on-subtle">
                <p>
                  Tap a payout band before dropping to call where the path will
                  land. The call is a side bet of 25% of your stake, priced at
                  fair odds from the exact band probability with the same 98%
                  RTP — rarer bands pay bigger call odds.
                </p>
                <p>Calls apply to single drops only, not session paths.</p>
              </div>
            ),
          } satisfies GameInfoSection,
        ]
      : []),
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          {payoutRows.map((zone, i) => (
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
              const net = entry.winAmount - entry.stake + (entry.callNet ?? 0);
              const won = net >= 0 && isNetWin(entry.payout);
              return (
                <div
                  key={`${entry.zoneIndex}-${entry.payout}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-xs"
                >
                  <span className="text-on-subtle truncate">
                    {entry.zoneLabel}
                    {entry.callNet !== undefined
                      ? entry.callNet > 0
                        ? ' · call ✓'
                        : ' · call ✕'
                      : ''}
                  </span>
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
          <p>Press Drop (or tap the chart) to send one path down the wall — where it ends is your multiplier. {(config.targetRTP * 100).toFixed(0)}% RTP · up to {getMaxPayout(selectedMode)}×.</p>
          {supportsSessions ? (
            <p>Session mode runs 5/10/25 paths in batches of up to {MAX_CONCURRENT_RUNS}.</p>
          ) : (
            <p>Switch to Split or Stripes for sessions and call-your-shot side bets.</p>
          )}
        </div>
      ),
    },
  ];

  const resultSubtitle = lastResult
    ? `${lastResult.pctChange >= 0 ? '+' : ''}${(lastResult.pctChange * 100).toFixed(2)}% move` +
      (lastResult.call
        ? lastResult.call.hit
          ? ` · Called ${lastResult.call.label} ✓ +${(lastResult.call.net).toFixed(0)}`
          : ` · Called ${lastResult.call.label} ✕`
        : '')
    : undefined;

  return (
    <GameShell infoSections={infoSections} showSymbolPicker={false}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <GameViewport
        play={
          <div className="flex flex-col flex-1 min-h-0">
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
                calledGroup={sessionActive || sessionSettling || !supportsCalls ? null : calledGroup}
                onSelectGroup={supportsCalls ? toggleCallGroup : undefined}
                onDropTap={canGenerate ? handleGenerate : undefined}
                canDrop={canGenerate}
              />

              <PlinkoDistanceChip activeRuns={activeRuns} modeId={selectedMode} />

              {/* On-chart chrome: mode chip + streak (Box-O floating-chip style) */}
              {session ? (
                <div className="absolute inset-x-2 top-2 z-10">
                  <PlinkoSessionHud
                    session={session}
                    stake={stake}
                    netWinStreak={netWinStreak}
                    status={sessionSettling ? 'settling' : 'running'}
                    milestone={sessionMilestone}
                  />
                </div>
              ) : (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                  <PlinkoStreakBadge count={netWinStreak} />
                  <PlinkoModeChip
                    value={selectedMode}
                    onChange={setSelectedMode}
                    disabled={isAnimating}
                  />
                </div>
              )}

              {/* Active call chip */}
              {calledGroup && !session ? (
                <div className="absolute bottom-2 left-2 z-10">
                  <button
                    type="button"
                    onClick={() => setCalledGroup(null)}
                    className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-card/90 py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-on-prominent backdrop-blur-sm"
                  >
                    <span className="tabular-nums">
                      Call {CALL_GROUP_LABELS[calledGroup]} · {callOdds}× ·{' '}
                      {callStake} cr
                    </span>
                    <X className="size-3.5 text-on-subtle" aria-hidden />
                  </button>
                </div>
              ) : null}

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
              playError && !sheetOpen ? (
                <span className="text-semantic-loss">{playError}</span>
              ) : isAnimating ? (
                `${activeRuns.length} path${activeRuns.length === 1 ? '' : 's'} live`
              ) : calledGroup && !sessionActive ? (
                `${dropCost.toLocaleString()} cr per drop incl. call`
              ) : (
                modeDef.shortPitch
              )
            }
            actions={
              sessionActive || sessionSettling ? (
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
                <div className={cn('grid gap-2', supportsSessions && 'grid-cols-[2fr_1fr]')}>
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px] font-display font-bold tabular-nums"
                    disabled={!canGenerate}
                    aria-busy={isAnimating}
                    onClick={handleGenerate}
                  >
                    Drop — {dropCost.toLocaleString()} cr
                  </Button>
                  {supportsSessions ? (
                    <Button
                      variant="secondary"
                      className="w-full min-h-[44px]"
                      disabled={isAnimating}
                      onClick={() => setSheetOpen(true)}
                    >
                      Session
                    </Button>
                  ) : null}
                </div>
              )
            }
          />
        }
      />

      <PlinkoSessionSheet
        open={sheetOpen && supportsSessions && !sessionActive && !sessionSettling}
        stake={stake}
        modeId={selectedMode}
        pendingSize={pendingSessionSize}
        goals={offeredGoals}
        canAfford={canAffordSession}
        playError={sheetOpen ? playError : null}
        onPickSize={prepareSession}
        onPickGoal={(goal) => {
          if (pendingSessionSize) handleStartSession(pendingSessionSize, goal);
        }}
        onBackToSizes={cancelSessionPrepare}
        onClose={closeSheet}
      />

      <ResultOverlay
        open={showResult && !!lastResult && playMode.kind === 'single'}
        won={pathNetPL >= 0}
        tier={getResultTierFromPayout(lastResult?.payout ?? 0)}
        title={lastResult ? `${lastResult.payout}× · ${lastResult.zoneLabel}` : ''}
        subtitle={resultSubtitle}
        amount={lastResult ? Math.abs(pathNetPL) : undefined}
        amountLabel={pathNetPL >= 0 ? 'net' : 'lost'}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Drop again', onClick: handleGenerate }}
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
