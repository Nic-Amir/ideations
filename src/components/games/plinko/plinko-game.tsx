'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getRiskConfig,
  getBarrierPriceLevels,
  getMaxPayout,
  getTargetPayout,
  getZoneHitProbability,
  isNetWin,
} from '@/lib/games/plinko';
import type { PlinkoRisk } from '@/types';
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
import {
  renderPlinkoChart,
  hitTestZone,
  type ChartScene,
  type SettlementFx,
} from '@/components/games/plinko/plinko-renderer';
import {
  useVolatilityPlinko,
  MAX_CONCURRENT_RUNS,
  SESSION_OPTIONS,
  START_PRICE,
  type RunDisplay,
  type PlinkoBetMode,
} from '@/hooks/use-volatility-plinko';

// ---------------------------------------------------------------------------
// Session progress
// ---------------------------------------------------------------------------

function SessionProgress({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="flex items-center gap-3 rounded-full bg-subtle px-3 py-1.5 text-xs text-on-subtle">
      <span className="font-display tabular-nums">
        {completed}/{total}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border-subtle">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bet mode toggle
// ---------------------------------------------------------------------------

function BetModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: PlinkoBetMode;
  onChange: (m: PlinkoBetMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Bet mode"
      className="mx-4 mt-2 grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1"
    >
      {(
        [
          { id: 'spread', label: 'Spread', hint: 'Paid by landing zone' },
          { id: 'target', label: 'Target', hint: 'Pick a zone, bigger payout' },
        ] as const
      ).map((opt) => {
        const selected = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              'min-h-[44px] rounded-md px-2 py-1.5 text-center transition-colors',
              selected
                ? 'bg-primary/15 text-primary'
                : 'text-on-subtle',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className="text-xs font-display font-bold">{opt.label}</div>
            <div className="text-[10px] opacity-80">{opt.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target zone chips (accessible alternative to tapping the chart)
// ---------------------------------------------------------------------------

function TargetZoneChips({
  risk,
  selected,
  onSelect,
  disabled,
}: {
  risk: PlinkoRisk;
  selected: number | null;
  onSelect: (i: number) => void;
  disabled: boolean;
}) {
  const zones = getRiskConfig(risk).zones;
  return (
    <div
      role="radiogroup"
      aria-label="Target zone"
      className="flex gap-1.5 px-4 pt-2 overflow-x-auto"
    >
      {zones.map((zone, i) => {
        const isSelected = selected === i;
        const payout = getTargetPayout(i);
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(i)}
            className={cn(
              'min-h-[44px] min-w-[64px] shrink-0 rounded-lg border px-2 py-1 text-center transition-colors',
              isSelected
                ? 'border-primary/40 bg-primary/10'
                : 'border-border-subtle bg-subtle',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-[10px] text-on-subtle">{zone.label}</span>
            </div>
            <div
              className="text-xs font-display font-bold tabular-nums"
              style={{ color: zone.color }}
            >
              {payout}×
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk preset cards
// ---------------------------------------------------------------------------

function RiskPresetCards({
  risk,
  onSelect,
  disabled,
}: {
  risk: PlinkoRisk;
  onSelect: (r: PlinkoRisk) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Risk preset"
      className="flex gap-2 px-4 pt-2 overflow-x-auto snap-x snap-mandatory"
    >
      {(['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => {
        const rc = getRiskConfig(r);
        const selected = risk === r;
        const zoneColors = rc.zones.slice(0, 5).map((z) => z.color);
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(r)}
            className={cn(
              'min-h-[44px] min-w-[108px] shrink-0 snap-start rounded-lg border p-2.5 text-left transition-colors',
              selected
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border-subtle bg-subtle text-on-subtle',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className="text-xs font-display font-bold capitalize">{r}</div>
            <div className="mt-1 flex gap-0.5">
              {zoneColors.map((c, i) => (
                <span key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px] opacity-90">
              <div>{rc.tickCount} ticks · {(rc.targetRTP * 100).toFixed(0)}% RTP</div>
              <div className="font-display tabular-nums">Up to {getMaxPayout(r)}×</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatSigmaRange(zone: ReturnType<typeof getRiskConfig>['zones'][0]): string {
  if (zone.minSigma === 0) return `|Z| < ${zone.maxSigma}σ`;
  if (zone.maxSigma === Infinity) return `|Z| ≥ ${zone.minSigma}σ`;
  return `${zone.minSigma}σ – ${zone.maxSigma}σ`;
}

// ---------------------------------------------------------------------------
// Chart host — thin canvas wrapper; all draw logic lives in plinko-renderer
// ---------------------------------------------------------------------------

function hasLiveFx(fx: SettlementFx[], now: number): boolean {
  return fx.some((f) => now - f.startedAt < f.durationMs);
}

function VolatilityChart({
  runs,
  activeRuns,
  risk,
  width,
  height,
  fx,
  isEmpty,
  targetZoneIndex,
  targetPayout,
  onZoneTap,
  tapEnabled,
}: {
  runs: RunDisplay[];
  activeRuns: RunDisplay[];
  risk: PlinkoRisk;
  width: number;
  height: number;
  fx: SettlementFx[];
  isEmpty: boolean;
  targetZoneIndex: number | null;
  targetPayout: number | null;
  onZoneTap: (zoneIndex: number) => void;
  tapEnabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ChartScene | null>(null);
  const rafRef = useRef(0);

  const config = getRiskConfig(risk);
  const barrierLevels = getBarrierPriceLevels(risk, START_PRICE);

  sceneRef.current = {
    width,
    height,
    tickCount: config.tickCount,
    startPrice: START_PRICE,
    zones: config.zones,
    barrierLevels,
    runs,
    activeRuns,
    fx,
    isEmpty,
    emptyLabel: tapEnabled
      ? 'Tap a zone to set your target'
      : 'Generate a path to see volatility in motion',
    emptySubLabel: `${config.tickCount} ticks · ${risk} risk`,
    targetZoneIndex,
    targetPayout,
    now: performance.now(),
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = scene.width * dpr;
    canvas.height = scene.height * dpr;
    canvas.style.width = `${scene.width}px`;
    canvas.style.height = `${scene.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderPlinkoChart(ctx, { ...scene, now: performance.now() });
  }, []);

  // Redraw on any prop change
  useEffect(() => {
    draw();
  });

  // Keep animating while settlement FX are live even after runs finish
  useEffect(() => {
    if (!hasLiveFx(fx, performance.now())) return;

    function loop() {
      draw();
      if (hasLiveFx(sceneRef.current?.fx ?? [], performance.now())) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        draw();
      }
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fx, draw]);

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tapEnabled) return;
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      if (!canvas || !scene) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const zone = hitTestZone(scene, x, y);
      if (zone !== null) onZoneTap(zone);
    },
    [tapEnabled, onZoneTap],
  );

  return (
    <canvas
      ref={canvasRef}
      className={cn('block rounded-md', tapEnabled && 'cursor-pointer')}
      style={{ width, height }}
      aria-label={
        tapEnabled
          ? 'Volatility path chart. Tap a price band to set your target zone.'
          : 'Volatility path chart'
      }
      onClick={handleTap}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlinkoGame() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 320, height: 240 });
  const isLandscape = useIsLandscape();

  const {
    risk,
    setRisk,
    stake,
    setStake,
    betMode,
    setBetMode,
    targetZoneIndex,
    setTargetZoneIndex,
    targetPayout,
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
  } = useVolatilityPlinko();

  const isEmpty = runs.length === 0 && activeRuns.length === 0;
  const sessionActive = session?.running ?? false;
  const [showResult, setShowResult] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);

  const isTargetMode = betMode === 'target';
  const controlsLocked = isAnimating || sessionActive;

  useEffect(() => {
    if (!lastResult) return;
    const megaWin = lastResult.payout > 50;
    if (sessionActive && !megaWin) return;
    setShowResult(true);
  }, [lastResult, sessionActive]);

  useEffect(() => {
    if (sessionSummary) setShowSessionSummary(true);
  }, [sessionSummary]);

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

  const targetZone =
    targetZoneIndex !== null ? config.zones[targetZoneIndex] : null;

  const generateLabel = (() => {
    if (activeRuns.length >= MAX_CONCURRENT_RUNS) return 'Max paths in flight';
    if (isTargetMode) {
      if (targetZoneIndex === null) return 'Pick a target zone';
      return activeRuns.length > 0
        ? `Another at ${targetPayout}×`
        : `Bet ${targetZone?.label} · ${targetPayout}×`;
    }
    return activeRuns.length > 0 ? 'Generate another' : 'Generate path';
  })();

  const footerText = (() => {
    if (isAnimating) return `${activeRuns.length}/${MAX_CONCURRENT_RUNS} paths in flight`;
    if (isTargetMode && targetZoneIndex !== null) {
      const prob = getZoneHitProbability(targetZoneIndex);
      return `Target ${targetZone?.label} · ${targetPayout}× · ${(prob * 100).toFixed(prob < 0.01 ? 3 : 1)}% hit chance`;
    }
    if (isTargetMode) return 'Tap a price band on the chart or pick a zone below';
    if (!isLandscape) {
      return `${config.tickCount} ticks · ${(config.targetRTP * 100).toFixed(0)}% RTP · sessions from ${(SESSION_OPTIONS[0] * stake).toLocaleString()} credits`;
    }
    return `${config.tickCount} ticks · ${(config.targetRTP * 100).toFixed(0)}% RTP`;
  })();

  const pathNetPL =
    lastResult && showResult ? lastResult.amount - lastResult.stake : 0;

  const resultTitle = (() => {
    if (!lastResult) return '';
    if (lastResult.mode === 'target') {
      return lastResult.targetHit
        ? `Target hit · ${lastResult.payout}×`
        : `Missed · landed ${lastResult.zoneLabel}`;
    }
    return `${lastResult.payout}× · ${lastResult.zoneLabel}`;
  })();

  const infoSections: GameInfoSection[] = [
    {
      id: 'about',
      label: 'About',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p className="rounded-lg border border-border-subtle bg-subtle px-3 py-2 text-xs">
            <strong className="text-on-prominent">Simulation</strong> — paths use client-side
            GBM with <code className="text-on-prominent">crypto.getRandomValues()</code>, not the
            live tick stream. Chart digits are visual only and do not affect payout.
          </p>
          <p>
            <strong className="text-on-prominent">Spread mode</strong> pays by whichever sigma
            zone the terminal move lands in.
          </p>
          <p>
            <strong className="text-on-prominent">Target mode</strong> lets you pick one zone;
            the payout is priced from its hit probability minus a 5% margin, locked when you bet.
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
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-display font-bold text-on-prominent">Spread mode</p>
            <div className="space-y-2">
              {config.zones.map((zone, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: zone.color }}
                    />
                    <span className="text-on-subtle truncate">{zone.label}</span>
                  </div>
                  <span className="text-on-subtle shrink-0 tabular-nums">{formatSigmaRange(zone)}</span>
                  <span
                    className="font-display tabular-nums font-medium shrink-0"
                    style={{ color: zone.color }}
                  >
                    {zone.payout}×
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-display font-bold text-on-prominent">Target mode</p>
            <div className="space-y-2">
              {config.zones.map((zone, i) => {
                const prob = getZoneHitProbability(i);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: zone.color }}
                      />
                      <span className="text-on-subtle truncate">{zone.label}</span>
                    </div>
                    <span className="text-on-subtle shrink-0 tabular-nums">
                      {(prob * 100).toFixed(prob < 0.01 ? 3 : 1)}%
                    </span>
                    <span
                      className="font-display tabular-nums font-medium shrink-0"
                      style={{ color: zone.color }}
                    >
                      {getTargetPayout(i)}×
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
                  key={`${entry.payout}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-xs"
                >
                  <span className="text-on-subtle truncate">
                    {entry.mode === 'target' ? (entry.targetHit ? '◎ hit' : '◎ miss') + ' · ' : ''}
                    {entry.zoneLabel}
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
          <p>Select risk, set stake, generate a synthetic price path.</p>
          <p>Spread: paid by the landing zone. Target: pick one zone for a probability-priced payout.</p>
          <p>Run up to {MAX_CONCURRENT_RUNS} paths at once. Session mode queues batches.</p>
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
            <div className="shrink-0 mx-3 mt-2 flex justify-center">
              <span className="rounded-full bg-subtle px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-on-subtle">
                Simulation · client-side GBM
              </span>
            </div>
            <div
              ref={chartContainerRef}
              className={cn(
                'flex-1 min-h-0 mx-3 my-2 rounded-lg border border-border-subtle bg-subtle overflow-hidden transition-transform duration-300',
                chartPulse && 'scale-[1.01]',
              )}
            >
              <VolatilityChart
                runs={runs}
                activeRuns={activeRuns}
                risk={risk}
                width={chartSize.width}
                height={chartSize.height}
                fx={settlementFx}
                isEmpty={isEmpty}
                targetZoneIndex={isTargetMode ? targetZoneIndex : null}
                targetPayout={targetPayout}
                onZoneTap={setTargetZoneIndex}
                tapEnabled={isTargetMode && !controlsLocked}
              />
            </div>
          </div>
        }
        dock={
          <>
            <BetModeToggle
              mode={betMode}
              onChange={setBetMode}
              disabled={controlsLocked}
            />
            {isTargetMode && (
              <TargetZoneChips
                risk={risk}
                selected={targetZoneIndex}
                onSelect={setTargetZoneIndex}
                disabled={controlsLocked}
              />
            )}
            <RiskPresetCards
              risk={risk}
              onSelect={setRisk}
              disabled={controlsLocked}
            />
            {sessionActive && session ? (
              <div className="px-4 pt-2">
                <SessionProgress completed={session.completed} total={session.total} />
              </div>
            ) : null}
            <StakeDock
              stake={stake}
              max={maxStake}
              balance={balance}
              onStakeChange={setStake}
              stakeDisabled={controlsLocked}
              showSlider={!sessionActive}
              footer={footerText}
              actions={
                <>
                  {sessionActive ? (
                    <Button variant="secondary" className="w-full min-h-[44px]" onClick={stopSession}>
                      Stop session
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      className="w-full min-h-[44px]"
                      disabled={!canGenerate}
                      aria-busy={isAnimating}
                      onClick={generate}
                    >
                      {generateLabel}
                    </Button>
                  )}
                  {!sessionActive && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {SESSION_OPTIONS.map((n) => (
                        <Button
                          key={n}
                          variant="secondary"
                          size="sm"
                          className="min-h-[44px] flex-1"
                          disabled={!canGenerate || isAnimating}
                          onClick={() => startSession(n)}
                          title={`${n} paths × ${stake} = ${(n * stake).toLocaleString()} credits`}
                        >
                          {n} paths
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              }
            />
          </>
        }
      />

      <ResultOverlay
        open={showResult && !!lastResult}
        won={isNetWin(lastResult?.payout ?? 0)}
        tier={getResultTierFromPayout(lastResult?.payout ?? 0)}
        title={resultTitle}
        subtitle={
          lastResult
            ? `${lastResult.pctChange >= 0 ? '+' : ''}${(lastResult.pctChange * 100).toFixed(2)}% move`
            : undefined
        }
        amount={lastResult ? Math.abs(pathNetPL) : undefined}
        amountLabel={pathNetPL >= 0 ? 'net' : 'lost'}
        autoDismissMs={
          sessionActive || (lastResult?.payout ?? 0) > 50 ? 0 : 1500
        }
        onDismiss={() => setShowResult(false)}
      />

      <ResultOverlay
        open={showSessionSummary && !!sessionSummary}
        won={(sessionSummary?.netPL ?? 0) >= 0}
        title="Session complete"
        subtitle={
          sessionSummary
            ? `${sessionSummary.completed} paths · Best ${sessionSummary.bestPayout}× · ${sessionSummary.wins} wins`
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
