'use client';

import { useRef, useEffect } from 'react';
import {
  getPlinkoConfig,
  getBarrierPriceLevels,
  getDisplayZoneGroups,
  CORE_ZONE_INDEX,
  type VolatilityRun,
} from '@/lib/games/plinko';
import { getPlinkoMode, type BarrierZone, type PlinkoModeId } from '@/lib/games/plinko-modes';
import {
  getPlinkoChartColors,
  getChartPadding,
  getPayoutStripWidth,
  payoutOutcomeColor,
} from '@/components/games/plinko/plinko-chart-colors';
import {
  START_PRICE,
  PATH_TRAIL_MS,
  NEAR_MISS_FLASH_MS,
  type RunDisplay,
  type ZoneFlash,
  type NearMissFlash,
  type SettleFloat,
} from '@/hooks/use-volatility-plinko';
import { useIsDesktop } from '@/hooks/use-media-query';
import { withAlpha, resolveTheme } from '@/lib/canvas-theme';

function computeFogBlend(price: number, bandCenter: number, bandHalfHeight: number): number {
  const dist = Math.abs(price - bandCenter) / (bandHalfHeight || 1);
  if (dist <= 1) return 1;
  if (dist <= 2) return 0.5;
  return 0.24;
}

function interpolatePathHead(
  quotes: number[],
  pathRevealProgress: number,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
) {
  const total = quotes.length - 1;
  const fracIndex = Math.min(pathRevealProgress * total, total);
  const i = Math.floor(fracIndex);
  const t = fracIndex - i;
  const j = Math.min(i + 1, total);
  const price = quotes[i] + t * (quotes[j] - quotes[i]);
  const x = xScale(i, total) + t * (xScale(j, total) - xScale(i, total));
  const y = yScale(price);
  return { fracIndex, price, x, y, endIdx: i };
}

function getPathStroke(faded: boolean) {
  const colors = getPlinkoChartColors();
  return {
    stroke: faded ? colors.pathPrimaryMuted : colors.pathPrimary,
    glow: colors.pathPrimaryGlow,
  };
}

function shortenZoneLabel(label: string): string {
  return label.replace(' +', '+').replace(' -', '−');
}

function payoutStripFill(zone: BarrierZone, fog: number, isEmpty: boolean): string {
  const alphaStrip = isEmpty ? '30' : Math.round(fog * 30).toString(16).padStart(2, '0');
  return zone.color + alphaStrip;
}

function drawPayoutStripLabel(
  ctx: CanvasRenderingContext2D,
  zone: BarrierZone,
  top: number,
  bottom: number,
  bandX: number,
  stripWidth: number,
  colors: ReturnType<typeof getPlinkoChartColors>,
  fontFamily: string,
) {
  if (bottom <= top) return;
  const midY = (top + bottom) / 2;
  const bandH = bottom - top;
  const compact = stripWidth < 68;

  ctx.textAlign = 'left';
  ctx.fillStyle = payoutOutcomeColor(zone.payout);
  ctx.font = compact ? `bold 10px ${fontFamily}` : `bold 11px ${fontFamily}`;
  ctx.fillText(`${zone.payout}×`, bandX + 4, midY + (bandH > 22 && !compact ? -3 : 3));

  if (bandH > 22) {
    ctx.fillStyle = colors.textMuted;
    ctx.font = compact ? `700 8px ${fontFamily}` : `600 9px ${fontFamily}`;
    ctx.fillText(shortenZoneLabel(zone.label), bandX + 4, midY + 9);
  }
}

function drawEndpointPayoutBadge(
  ctx: CanvasRenderingContext2D,
  payout: number,
  x: number,
  y: number,
  fadeAlpha: number,
) {
  const colors = getPlinkoChartColors();
  const isWin = payout >= 1;
  const fg = isWin ? colors.semanticWin : colors.semanticLoss;
  const bg = withAlpha(fg, 0.14);
  const text = `${payout}×`;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.font = `bold 10px ${resolveTheme().fontFamily}`;
  const textW = ctx.measureText(text).width;
  const padX = 6;
  const w = textW + padX * 2;
  const h = 18;
  const bx = x + 6;
  const by = y - h / 2;

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 5);
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, y);
  ctx.restore();
}

function getGroupBandBounds(
  group: ReturnType<typeof getDisplayZoneGroups>[0]['group'],
  barrierLevels: ReturnType<typeof getBarrierPriceLevels>,
  yScale: (v: number) => number,
  yMin: number,
  yMax: number,
  modeId: PlinkoModeId,
) {
  const zones = getPlinkoConfig(modeId).zones;
  const match = zones.filter((z: BarrierZone) => z.displayGroup === group);
  if (!match.length) return null;

  const sigmaBounds: Record<string, [number, number]> = {
    extreme: [4, 5],
    outer: [3, 4],
    mid: [2, 3],
    inner: [1, 2],
    micro: [0.5, 1],
    core: [0, 0.5],
  };
  const [minK, maxK] = sigmaBounds[group];

  const posTop = yScale(
    barrierLevels.find((b) => b.sigma === maxK)?.price ?? yMax,
  );
  const posBot = yScale(
    barrierLevels.find((b) => b.sigma === minK)?.price ?? START_PRICE,
  );
  const negTop = yScale(
    barrierLevels.find((b) => b.sigma === -minK)?.price ?? START_PRICE,
  );
  const negBot = yScale(
    barrierLevels.find((b) => b.sigma === -maxK)?.price ?? yMin,
  );

  return {
    group,
    payout: match[0].payout,
    color: match[0].color,
    label: match[0].label,
    posTop,
    posBot,
    negTop,
    negBot,
  };
}

function matchZoneForGroup(
  group: BarrierZone['displayGroup'],
  modeId: PlinkoModeId,
): BarrierZone {
  const zones = getPlinkoConfig(modeId).zones;
  return zones.find((z: BarrierZone) => z.displayGroup === group) ?? zones[0];
}

function getZoneBandBounds(
  zoneIndex: number,
  barrierLevels: ReturnType<typeof getBarrierPriceLevels>,
  yScale: (v: number) => number,
  yMin: number,
  yMax: number,
  modeId: PlinkoModeId,
) {
  const zones = getPlinkoConfig(modeId).zones;
  const zone = zones[zoneIndex];
  if (!zone) return null;

  const mode = getPlinkoMode(modeId);
  const coreIdx = mode.coreZoneIndex ?? CORE_ZONE_INDEX;

  if (zoneIndex === coreIdx) {
    const top = yScale(barrierLevels.find((b) => b.sigma === 0.5)?.price ?? START_PRICE);
    const bot = yScale(barrierLevels.find((b) => b.sigma === -0.5)?.price ?? START_PRICE);
    return { top: Math.min(top, bot), bottom: Math.max(top, bot), zone };
  }

  const minK = zone.minSigma;
  const maxK = Math.min(zone.maxSigma, 5);
  const isPositive = zoneIndex < coreIdx;

  if (isPositive) {
    const posTop = yScale(barrierLevels.find((b) => b.sigma === maxK)?.price ?? yMax);
    const posBot = yScale(barrierLevels.find((b) => b.sigma === minK)?.price ?? START_PRICE);
    if (posBot > posTop) return { top: posTop, bottom: posBot, zone };
  } else {
    const negTop = yScale(barrierLevels.find((b) => b.sigma === -minK)?.price ?? START_PRICE);
    const negBot = yScale(barrierLevels.find((b) => b.sigma === -maxK)?.price ?? yMin);
    if (negBot > negTop) return { top: negTop, bottom: negBot, zone };
  }
  return null;
}

export interface PlinkoChartProps {
  runs: RunDisplay[];
  activeRuns: RunDisplay[];
  width: number;
  height: number;
  zoneFlashes: ZoneFlash[];
  nearMissFlashes: NearMissFlash[];
  settleFloats: SettleFloat[];
  isEmpty: boolean;
  modeId: PlinkoModeId;
  focusedRunId?: number | null;
  onFocusRun?: (runId: number) => void;
}

export function PlinkoChart({
  runs,
  activeRuns,
  width,
  height,
  zoneFlashes,
  nearMissFlashes,
  settleFloats,
  isEmpty,
  modeId,
  focusedRunId = null,
  onFocusRun,
}: PlinkoChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDesktop = useIsDesktop();
  const maxVisibleActive = isDesktop ? 5 : 3;
  const config = getPlinkoConfig(modeId);
  const displayGroups = getDisplayZoneGroups(modeId);
  const barrierLevels = getBarrierPriceLevels(START_PRICE, modeId);
  const stripWidth = getPayoutStripWidth(width);
  const padding = getChartPadding(stripWidth + 20);

  const visibleActive = activeRuns.slice(0, maxVisibleActive);
  const waitingCount = Math.max(0, activeRuns.length - maxVisibleActive);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const colors = getPlinkoChartColors();
    const fontFamily = resolveTheme().fontFamily;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const bandX = width - padding.right + 4;
    const bandWidth = stripWidth;

    const activeRunIds = new Set(visibleActive.map((r) => r.id));
    let allQuotes: number[] = [START_PRICE];
    for (const r of runs) allQuotes = allQuotes.concat(r.run.quotes);
    for (const r of visibleActive) allQuotes = allQuotes.concat(r.run.quotes);

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

    const focusPrice =
      visibleActive[visibleActive.length - 1]?.run.quotes[
        visibleActive[visibleActive.length - 1]?.visibleTickIndex ?? 0
      ] ?? START_PRICE;

    const drawGroupedBands = () => {
      ctx.fillStyle = colors.textMuted;
      ctx.font = `700 8px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText('PAYOUT', bandX + bandWidth / 2, padding.top - 4);

      for (const dg of displayGroups) {
        const bounds = getGroupBandBounds(dg.group, barrierLevels, yScale, yMin, yMax, modeId);
        if (!bounds) continue;

        const drawBand = (top: number, bottom: number, zone: BarrierZone) => {
          if (bottom <= top) return;
          const fog = isEmpty ? 1 : computeFogBlend(focusPrice, yScale(START_PRICE), plotH / 2);
          ctx.fillStyle = payoutStripFill(zone, fog, isEmpty);
          ctx.fillRect(bandX, top, bandWidth, bottom - top);
        };

        const zoneForLabel = matchZoneForGroup(bounds.group, modeId);

        if (dg.group !== 'core') {
          drawBand(bounds.posTop, bounds.posBot, zoneForLabel);
          drawBand(bounds.negTop, bounds.negBot, zoneForLabel);
          drawPayoutStripLabel(ctx, zoneForLabel, bounds.posTop, bounds.posBot, bandX, bandWidth, colors, fontFamily);
          drawPayoutStripLabel(ctx, zoneForLabel, bounds.negTop, bounds.negBot, bandX, bandWidth, colors, fontFamily);
        } else {
          drawBand(bounds.posTop, bounds.negBot, zoneForLabel);
          drawPayoutStripLabel(ctx, zoneForLabel, bounds.posTop, bounds.negBot, bandX, bandWidth, colors, fontFamily);
        }
      }

      for (const barrier of barrierLevels) {
        if (Math.abs(barrier.sigma) === 0.5) continue;
        const by = yScale(barrier.price);
        ctx.strokeStyle = isEmpty ? colors.grid : colors.gridActive;
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(padding.left, by);
        ctx.lineTo(bandX, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    // Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(bandX, y);
      ctx.stroke();
    }

    const startY = yScale(START_PRICE);
    ctx.strokeStyle = colors.startLine;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, startY);
    ctx.lineTo(bandX, startY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.textMuted;
    ctx.font = `600 9px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('Entry', padding.left, startY - 4);

    drawGroupedBands();

    if (isEmpty) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors.emptyPrompt;
      ctx.font = `600 13px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        'Where the path ends = your multiplier',
        width / 2,
        height / 2 - 8,
      );
      ctx.font = `500 11px ${fontFamily}`;
      ctx.fillText('Start a session or drop a path', width / 2, height / 2 + 12);
      ctx.globalAlpha = 1;
      return;
    }

    const now = performance.now();

    for (const flash of zoneFlashes) {
      if (flash.until <= now) continue;
      const alpha = reducedMotion ? 0.5 : Math.min(1, (flash.until - now) / 600);
      const bounds = getZoneBandBounds(flash.zoneIndex, barrierLevels, yScale, yMin, yMax, modeId);
      if (!bounds) continue;
      ctx.fillStyle = bounds.zone.color + Math.round(alpha * 90).toString(16).padStart(2, '0');
      ctx.fillRect(bandX, bounds.top, bandWidth, bounds.bottom - bounds.top);
    }

    if (modeId === 'split') {
      const microBounds = getGroupBandBounds('micro', barrierLevels, yScale, yMin, yMax, modeId);
      for (const flash of nearMissFlashes) {
        if (flash.until <= now || !microBounds) continue;
        const alpha = reducedMotion ? 0.45 : Math.min(1, (flash.until - now) / NEAR_MISS_FLASH_MS);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colors.nearMissFlash;
        ctx.fillRect(bandX, microBounds.posTop, bandWidth, microBounds.posBot - microBounds.posTop);
        ctx.fillRect(bandX, microBounds.negTop, bandWidth, microBounds.negBot - microBounds.negTop);
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = colors.textMuted;
    ctx.font = `600 8px ${fontFamily}`;
    ctx.textAlign = 'right';
    for (const barrier of barrierLevels.filter((b) => Math.abs(b.sigma) >= 1)) {
      const by = yScale(barrier.price);
      ctx.fillText(`${barrier.sigma > 0 ? '+' : ''}${barrier.sigma}σ`, padding.left - 4, by + 3);
    }

    const trailRuns = runs.filter(
      (r) => r.settledAt === undefined || now - r.settledAt < PATH_TRAIL_MS,
    );

    for (const r of trailRuns) {
      if (activeRunIds.has(r.id)) continue;
      const age = r.settledAt ? now - r.settledAt : 0;
      const dimmed = focusedRunId !== null && r.id !== focusedRunId;
      const fade = Math.max(0, 1 - age / PATH_TRAIL_MS) * (dimmed ? 0.15 : 1);
      drawPath(ctx, r, xScale, yScale, true, fade);
      drawPathEndpoint(ctx, r.run, xScale, yScale, fade);
    }

    for (const activeRun of visibleActive) {
      const dimmed = focusedRunId !== null && activeRun.id !== focusedRunId;
      drawActivePath(
        ctx,
        activeRun,
        xScale,
        yScale,
        barrierLevels,
        yScale,
        yMin,
        yMax,
        bandX,
        bandWidth,
        reducedMotion,
        modeId,
        dimmed ? 0.2 : 1,
      );
    }

    // Live price pill (Rise-Fall style: right-anchored, high-contrast)
    const headRun = visibleActive[visibleActive.length - 1];
    if (headRun) {
      const quotes = headRun.run.quotes;
      const total = quotes.length - 1;
      const progress =
        headRun.animProgress >= 1 ? 1 : headRun.pathRevealProgress;
      const head = interpolatePathHead(quotes, progress, xScale, yScale);

      drawPricePill(ctx, colors, head.price, head.x, head.y, bandX - 6);
    }

    // Settle floats (single / small multi only)
    if (settleFloats.length <= 2) {
      const allRuns = [...trailRuns, ...visibleActive];
      for (const f of settleFloats) {
        if (f.until <= now) continue;
        const run = allRuns.find((r) => r.id === f.runId);
        if (!run) continue;
        const quotes = run.run.quotes;
        const total = quotes.length - 1;
        const ex = xScale(total, total);
        const ey = yScale(quotes[total]);
        const progress = reducedMotion ? 1 : 1 - (f.until - now) / 1200;
        const offsetY = progress * 24;
        const alpha = reducedMotion ? 0.8 : 1 - progress * 0.5;
        ctx.globalAlpha = alpha;
        const isWin = f.payout >= 1;
        ctx.fillStyle = isWin ? colors.semanticWin : colors.semanticLoss;
        ctx.font = `bold 11px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${f.payout}×`, ex, ey - 30 - offsetY);
        ctx.font = `bold 10px ${resolveTheme().fontFamily}`;
        const sign = f.netPL >= 0 ? '+' : '';
        ctx.fillText(`${sign}${f.netPL.toFixed(0)}`, ex, ey - 14 - offsetY);
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = colors.textMuted;
    ctx.font = `600 9px ${fontFamily}`;
    ctx.textAlign = 'center';
    const sampleLen = visibleActive[0]?.run.quotes.length ?? runs[0]?.run.quotes.length ?? config.tickCount + 1;
    const totalTicks = sampleLen - 1;
    ctx.fillText('tick', padding.left, height - 6);
    ctx.fillText(String(totalTicks), width - padding.right - stripWidth / 2, height - 6);
  }, [
    runs,
    visibleActive,
    width,
    height,
    zoneFlashes,
    nearMissFlashes,
    settleFloats,
    isEmpty,
    config.tickCount,
    displayGroups,
    barrierLevels,
    padding,
    stripWidth,
    modeId,
    focusedRunId,
  ]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block cursor-pointer"
        style={{ width, height }}
        aria-label="Volatility path chart"
        onClick={() => {
          if (!onFocusRun || visibleActive.length < 2) return;
          const last = visibleActive[visibleActive.length - 1];
          onFocusRun(focusedRunId === last.id ? visibleActive[0].id : last.id);
        }}
      />
      {waitingCount > 0 ? (
        <span className="absolute top-2 right-2 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-on-subtle border border-border-subtle">
          +{waitingCount} waiting
        </span>
      ) : null}
    </div>
  );
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  run: VolatilityRun | RunDisplay,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
  faded: boolean,
  fadeAlpha = 1,
) {
  const volRun = 'run' in run ? run.run : run;
  const quotes = volRun.quotes;
  const total = quotes.length - 1;
  const pathColors = getPathStroke(faded);
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.strokeStyle = pathColors.stroke;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < quotes.length; i++) {
    const x = xScale(i, total);
    const y = yScale(quotes[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPathEndpoint(
  ctx: CanvasRenderingContext2D,
  run: VolatilityRun,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
  fadeAlpha: number,
) {
  const quotes = run.quotes;
  const total = quotes.length - 1;
  const ex = xScale(total, total);
  const ey = yScale(quotes[total]);
  const pathColors = getPathStroke(true);
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = pathColors.stroke;
  ctx.beginPath();
  ctx.arc(ex, ey, 4, 0, Math.PI * 2);
  ctx.fill();
  drawEndpointPayoutBadge(ctx, run.payout, ex, ey, fadeAlpha);
  ctx.restore();
}

function drawActivePath(
  ctx: CanvasRenderingContext2D,
  activeRun: RunDisplay,
  xScale: (i: number, total: number) => number,
  yScale: (v: number) => number,
  barrierLevels: ReturnType<typeof getBarrierPriceLevels>,
  yScaleFn: (v: number) => number,
  yMin: number,
  yMax: number,
  bandX: number,
  bandWidth: number,
  reducedMotion: boolean,
  modeId: PlinkoModeId,
  pathAlpha = 1,
) {
  const quotes = activeRun.run.quotes;
  const total = quotes.length - 1;
  const progress =
    activeRun.animProgress >= 1 ? 1 : activeRun.pathRevealProgress;
  const head = interpolatePathHead(quotes, progress, xScale, yScale);
  const pathColors = getPathStroke(false);

  ctx.save();
  ctx.globalAlpha = pathAlpha;
  ctx.shadowColor = pathColors.glow;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = pathColors.stroke;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const solidEnd = Math.min(head.endIdx, total);
  for (let i = 0; i <= solidEnd && i < quotes.length; i++) {
    const x = xScale(i, total);
    const y = yScale(quotes[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (head.fracIndex > solidEnd && solidEnd < total) {
    ctx.lineTo(head.x, head.y);
  } else if (progress > 0 && solidEnd === 0) {
    ctx.moveTo(xScale(0, total), yScale(quotes[0]));
    ctx.lineTo(head.x, head.y);
  }
  ctx.stroke();
  ctx.restore();

  if (!reducedMotion) {
    const t = (performance.now() % 1200) / 1200;
    const ringRadius = 4 + t * 5;
    const pulseAlpha = (1 - t) * 0.5;
    ctx.strokeStyle = withAlpha(pathColors.stroke, pulseAlpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(head.x, head.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = pathColors.stroke;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (activeRun.animProgress >= 1) {
    const bounds = getZoneBandBounds(
      activeRun.run.zoneIndex,
      barrierLevels,
      yScaleFn,
      yMin,
      yMax,
      modeId,
    );
    if (bounds) {
      ctx.strokeStyle = bounds.zone.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bandX - 2, bounds.top - 1, bandWidth + 4, bounds.bottom - bounds.top + 2);
    }
  }
}

function drawPricePill(
  ctx: CanvasRenderingContext2D,
  colors: ReturnType<typeof getPlinkoChartColors>,
  price: number,
  dotX: number,
  dotY: number,
  pillRightX: number,
) {
  const priceStr = price.toFixed(2);
  const pillH = 20;
  const font = `bold 11px ${resolveTheme().fontFamily}`;
  ctx.font = font;
  const textW = ctx.measureText(priceStr).width;
  const pillW = Math.max(56, textW + 16);
  const pillX = pillRightX - pillW;
  const pillY = dotY - pillH / 2;
  const pillCY = dotY;
  const bg = colors.pricePillBg;
  const fg = colors.pricePillText;

  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = colors.textMuted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dotX + 6, pillCY);
  ctx.lineTo(pillX - 2, pillCY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.fillStyle = colors.pricePillShadow;
  ctx.beginPath();
  ctx.roundRect(pillX + 1, pillY + 2, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceStr, pillX + pillW / 2, pillCY);

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(pillX - 1, pillCY);
  ctx.lineTo(pillX - 7, pillCY - 4);
  ctx.lineTo(pillX - 7, pillCY + 4);
  ctx.closePath();
  ctx.fill();
}
