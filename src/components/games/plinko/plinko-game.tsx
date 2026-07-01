'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getRiskConfig,
  getBarrierPriceLevels,
  getMaxPayout,
  isNetWin,
  type VolatilityRun,
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
  getPlinkoChartColors,
  getChartPadding,
  getPayoutStripWidth,
} from '@/components/games/plinko/plinko-chart-colors';
import {
  useVolatilityPlinko,
  MAX_CONCURRENT_RUNS,
  SESSION_OPTIONS,
  START_PRICE,
  type RunDisplay,
  type ZoneFlash,
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

function getPathColors(payout: number, faded: boolean) {
  const colors = getPlinkoChartColors();
  const netWin = payout >= 1;
  const bigWin = payout > 5;
  if (bigWin || netWin) {
    return {
      stroke: faded ? colors.pathUpFaint : colors.pathUp,
      glow: colors.pathUpGlow,
    };
  }
  return {
    stroke: faded ? colors.pathDownFaint : colors.pathDown,
    glow: colors.pathDownGlow,
  };
}

function formatSigmaRange(zone: ReturnType<typeof getRiskConfig>['zones'][0]): string {
  if (zone.minSigma === 0) return `|Z| < ${zone.maxSigma}σ`;
  if (zone.maxSigma === Infinity) return `|Z| ≥ ${zone.minSigma}σ`;
  return `${zone.minSigma}σ – ${zone.maxSigma}σ`;
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

function getZoneBandBounds(
  zoneIndex: number,
  zones: ReturnType<typeof getRiskConfig>['zones'],
  barrierLevels: ReturnType<typeof getBarrierPriceLevels>,
  yScale: (v: number) => number,
  yMin: number,
  yMax: number,
) {
  const zone = zones[zoneIndex];
  if (!zone) return null;

  const minK = zone.minSigma;
  const maxK = Math.min(zone.maxSigma, 5);
  const isPositive = zoneIndex <= 4;

  if (isPositive) {
    const upperBarrierMin = barrierLevels.find((b) => b.sigma === minK);
    const upperBarrierMax = barrierLevels.find((b) => b.sigma === maxK);
    const posTop = upperBarrierMax ? yScale(upperBarrierMax.price) : yScale(yMax);
    const posBot = upperBarrierMin ? yScale(upperBarrierMin.price) : yScale(START_PRICE);
    if (posBot > posTop) return { top: posTop, bottom: posBot, zone };
  } else {
    const lowerBarrierMin = barrierLevels.find((b) => b.sigma === -minK);
    const lowerBarrierMax = barrierLevels.find((b) => b.sigma === -maxK);
    const negTop = lowerBarrierMin ? yScale(lowerBarrierMin.price) : yScale(START_PRICE);
    const negBot = lowerBarrierMax ? yScale(lowerBarrierMax.price) : yScale(yMin);
    if (negBot > negTop) return { top: negTop, bottom: negBot, zone };
  }
  return null;
}

function VolatilityChart({
  runs,
  activeRuns,
  risk,
  width,
  height,
  zoneFlashes,
  isEmpty,
}: {
  runs: RunDisplay[];
  activeRuns: RunDisplay[];
  risk: PlinkoRisk;
  width: number;
  height: number;
  zoneFlashes: ZoneFlash[];
  isEmpty: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = getRiskConfig(risk);
  const zones = config.zones;
  const barrierLevels = getBarrierPriceLevels(risk, START_PRICE);
  const stripWidth = getPayoutStripWidth(width);
  const padding = getChartPadding(stripWidth + 16);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const colors = getPlinkoChartColors();

    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 12);
    ctx.fill();

    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const activeRunIds = new Set(activeRuns.map((r) => r.id));
    let allQuotes: number[] = [START_PRICE];
    for (const r of runs) allQuotes = allQuotes.concat(r.run.quotes);
    for (const r of activeRuns) allQuotes = allQuotes.concat(r.run.quotes);

    const barrierPrices = barrierLevels.map((b) => b.price);
    const allValues = allQuotes.concat(barrierPrices);
    const minV = Math.min(...allValues);
    const maxV = Math.max(...allValues);
    const range = maxV - minV || 1;
    const pad = range * 0.08;
    const yMin = minV - pad;
    const yMax = maxV + pad;

    const xScale = (i: number, totalTicks: number) =>
      padding.left + (i / totalTicks) * plotW;
    const yScale = (v: number) =>
      padding.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const bandWidth = stripWidth;
    const bandX = width - padding.right + 4;
    const uniqueZones = zones.slice(0, 5);

    const drawZoneBands = () => {
      for (const zone of uniqueZones) {
        const minK = zone.minSigma;
        const maxK = Math.min(zone.maxSigma, 5);
        const upperBarrierMin = barrierLevels.find((b) => b.sigma === minK);
        const upperBarrierMax = barrierLevels.find((b) => b.sigma === maxK);
        const posTop = upperBarrierMax ? yScale(upperBarrierMax.price) : yScale(yMax);
        const posBot = upperBarrierMin ? yScale(upperBarrierMin.price) : yScale(START_PRICE);

        if (posBot > posTop) {
          ctx.fillStyle = zone.color + (isEmpty ? '14' : '10');
          ctx.fillRect(padding.left, posTop, plotW, posBot - posTop);
          ctx.fillStyle = zone.color + (isEmpty ? '22' : '18');
          ctx.fillRect(bandX, posTop, bandWidth, posBot - posTop);
          ctx.fillStyle = zone.color;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${zone.payout}×`, bandX + 4, (posTop + posBot) / 2 + 3);
        }

        if (zone.label !== 'Center') {
          const lowerBarrierMin = barrierLevels.find((b) => b.sigma === -minK);
          const lowerBarrierMax = barrierLevels.find((b) => b.sigma === -maxK);
          const negTop = lowerBarrierMin ? yScale(lowerBarrierMin.price) : yScale(START_PRICE);
          const negBot = lowerBarrierMax ? yScale(lowerBarrierMax.price) : yScale(yMin);

          if (negBot > negTop) {
            ctx.fillStyle = zone.color + (isEmpty ? '14' : '10');
            ctx.fillRect(padding.left, negTop, plotW, negBot - negTop);
            ctx.fillStyle = zone.color + (isEmpty ? '22' : '18');
            ctx.fillRect(bandX, negTop, bandWidth, negBot - negTop);
            ctx.fillStyle = zone.color;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${zone.payout}×`, bandX + 4, (negTop + negBot) / 2 + 3);
          }
        }
      }

      for (const barrier of barrierLevels) {
        const absK = Math.abs(barrier.sigma);
        const zone = uniqueZones.find((z) => z.minSigma === absK || z.maxSigma === absK);
        const bColor = zone?.color ?? '#555';
        const by = yScale(barrier.price);
        ctx.strokeStyle = bColor + (isEmpty ? '70' : '50');
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(padding.left, by);
        ctx.lineTo(width - padding.right, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    // Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    if (isEmpty) {
      const startY = yScale(START_PRICE);
      ctx.strokeStyle = colors.startLine;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, startY);
      ctx.lineTo(width - padding.right, startY);
      ctx.stroke();
      ctx.setLineDash([]);
      drawZoneBands();
      ctx.fillStyle = colors.emptyPrompt;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Generate a path to see volatility in motion', width / 2, height / 2);
      ctx.font = '11px sans-serif';
      ctx.fillText(`${config.tickCount} ticks · ${risk} risk`, width / 2, height / 2 + 18);
      return;
    }

    // Start price line
    const startY = yScale(START_PRICE);
    ctx.strokeStyle = colors.startLine;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, startY);
    ctx.lineTo(width - padding.right, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    const now = performance.now();

    drawZoneBands();

    // Zone flash highlights
    for (const flash of zoneFlashes) {
      if (flash.until <= now) continue;
      const alpha = Math.min(1, (flash.until - now) / 600);
      const bounds = getZoneBandBounds(flash.zoneIndex, zones, barrierLevels, yScale, yMin, yMax);
      if (!bounds) continue;
      ctx.fillStyle = bounds.zone.color + Math.round(alpha * 80).toString(16).padStart(2, '0');
      ctx.fillRect(bandX, bounds.top, bandWidth, bounds.bottom - bounds.top);
      ctx.fillStyle = bounds.zone.color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${bounds.zone.label} · ${bounds.zone.payout}×`,
        bandX + 2,
        (bounds.top + bounds.bottom) / 2 + 3,
      );
    }

    // Barrier labels (lines drawn in drawZoneBands for empty; duplicate labels here when active)
    for (const barrier of barrierLevels) {
      const by = yScale(barrier.price);
      ctx.fillStyle = colors.textMuted;
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${barrier.sigma > 0 ? '+' : ''}${barrier.sigma}σ`,
        padding.left - 4,
        by + 3,
      );
    }

    // Y-axis
    ctx.fillStyle = colors.textMuted;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = yMin + ((yMax - yMin) / 5) * (5 - i);
      const y = padding.top + (plotH / 5) * i;
      ctx.fillText(val.toFixed(1), padding.left - 6, y + 3);
    }

    // Completed runs
    for (const r of runs) {
      if (activeRunIds.has(r.id)) continue;
      drawPath(ctx, r.run, xScale, yScale, true);
    }

    // Active runs
    for (const activeRun of activeRuns) {
      drawActivePath(ctx, activeRun, xScale, yScale, zones, barrierLevels, yScale, yMin, yMax, bandX, bandWidth);
    }

    // X-axis
    ctx.fillStyle = colors.textMuted;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const sampleLen =
      activeRuns[0]?.run.quotes.length ??
      runs[0]?.run.quotes.length ??
      config.tickCount + 1;
    const totalTicks = sampleLen - 1;
    const step = Math.max(1, Math.floor(totalTicks / 5));
    for (let i = 0; i <= totalTicks; i += step) {
      ctx.fillText(String(i), xScale(i, totalTicks), height - 10);
    }
  }, [runs, activeRuns, risk, width, height, zones, barrierLevels, config.tickCount, zoneFlashes, isEmpty, padding, stripWidth]);

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-md"
      style={{ width, height }}
      aria-label="Volatility path chart"
    />
  );
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  run: VolatilityRun,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
  faded: boolean,
) {
  const quotes = run.quotes;
  const total = quotes.length - 1;
  const pathColors = getPathColors(run.payout, faded);
  ctx.strokeStyle = pathColors.stroke;
  ctx.lineWidth = faded ? 1.5 : 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < quotes.length; i++) {
    const x = xScale(i, total);
    const y = yScale(quotes[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawActivePath(
  ctx: CanvasRenderingContext2D,
  activeRun: RunDisplay,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
  zones: ReturnType<typeof getRiskConfig>['zones'],
  barrierLevels: ReturnType<typeof getBarrierPriceLevels>,
  yScaleFn: (v: number) => number,
  yMin: number,
  yMax: number,
  bandX: number,
  bandWidth: number,
) {
  const quotes = activeRun.run.quotes;
  const digits = activeRun.run.digits;
  const total = quotes.length - 1;
  const visibleCount = Math.max(1, activeRun.visibleTickIndex + 1);
  const colorPayout =
    activeRun.animProgress >= 1
      ? activeRun.run.payout
      : activeRun.run.isPositive
        ? 1.5
        : 0.5;
  const pathColors = getPathColors(colorPayout, false);
  const color = pathColors.stroke;
  const glow = pathColors.glow;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < visibleCount && i < quotes.length; i++) {
    const x = xScale(i, total);
    const y = yScale(quotes[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  const lastIdx = Math.min(visibleCount - 1, quotes.length - 1);
  const ex = xScale(lastIdx, total);
  const ey = yScale(quotes[lastIdx]);
  const pulse = 5 + Math.sin(performance.now() / 80) * 1.5;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Digit badge at current tick
  if (lastIdx > 0 && digits[lastIdx - 1] !== undefined) {
    const colors = getPlinkoChartColors();
    const digit = digits[lastIdx - 1];
    const badgeX = ex + 8;
    const badgeY = ey - 14;
    ctx.fillStyle = colors.digitBadgeBg;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, 18, 16, 3);
    ctx.fill();
    ctx.fillStyle = colors.digitBadgeText;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(digit), badgeX + 9, badgeY + 12);
  }

  // Settled: zone highlight + labels
  if (activeRun.animProgress >= 1) {
    const bounds = getZoneBandBounds(
      activeRun.run.zoneIndex,
      zones,
      barrierLevels,
      yScaleFn,
      yMin,
      yMax,
    );
    if (bounds) {
      ctx.strokeStyle = bounds.zone.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bandX - 2, bounds.top - 1, bandWidth + 4, bounds.bottom - bounds.top + 2);
    }

    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const pctStr = (activeRun.run.percentChange * 100).toFixed(2);
    const sign = activeRun.run.percentChange >= 0 ? '+' : '';
    ctx.fillText(`${sign}${pctStr}%`, ex + 10, ey - 4);
    ctx.fillText(`${activeRun.run.payout}×`, ex + 10, ey + 10);
  }
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
  } = useVolatilityPlinko();

  const isEmpty = runs.length === 0 && activeRuns.length === 0;
  const sessionActive = session?.running ?? false;
  const [showResult, setShowResult] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);

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

  const generateLabel =
    activeRuns.length >= MAX_CONCURRENT_RUNS
      ? 'Max paths in flight'
      : activeRuns.length > 0
        ? 'Generate another'
        : 'Generate path';

  const pathNetPL =
    lastResult && showResult ? lastResult.amount - lastResult.stake : 0;

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
          <p>Settlement is based on the terminal move&apos;s sigma zone.</p>
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
          <p>Select risk, set stake, generate a synthetic price path.</p>
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
                zoneFlashes={zoneFlashes}
                isEmpty={isEmpty}
              />
            </div>
          </div>
        }
        dock={
          <>
            <RiskPresetCards
              risk={risk}
              onSelect={setRisk}
              disabled={isAnimating || sessionActive}
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
              stakeDisabled={isAnimating || sessionActive}
              showSlider={!sessionActive}
              footer={
                isAnimating
                  ? `${activeRuns.length}/${MAX_CONCURRENT_RUNS} paths in flight`
                  : !isLandscape
                    ? `${config.tickCount} ticks · ${(config.targetRTP * 100).toFixed(0)}% RTP · sessions from ${(SESSION_OPTIONS[0] * stake).toLocaleString()} credits`
                    : `${config.tickCount} ticks · ${(config.targetRTP * 100).toFixed(0)}% RTP`
              }
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
        title={lastResult ? `${lastResult.payout}× · ${lastResult.zoneLabel}` : ''}
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
