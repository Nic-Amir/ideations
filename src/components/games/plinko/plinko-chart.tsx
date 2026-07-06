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
import { getCallOdds, type CallGroup } from '@/lib/games/plinko-call';
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
  /** Called-shot band, highlighted on the payout strip. */
  calledGroup?: CallGroup | null;
  /** Tap on a payout band toggles a call. */
  onSelectGroup?: (group: CallGroup) => void;
  /** Tap anywhere on the plot area drops a path. */
  onDropTap?: () => void;
  canDrop?: boolean;
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
  calledGroup = null,
  onSelectGroup,
  onDropTap,
  canDrop = false,
}: PlinkoChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawSceneRef = useRef<() => void>(() => {});
  const isDesktop = useIsDesktop();
  const maxVisibleActive = isDesktop ? 5 : 3;
  const config = getPlinkoConfig(modeId);
  const displayGroups = getDisplayZoneGroups(modeId);
  const barrierLevels = getBarrierPriceLevels(START_PRICE, modeId);
  const stripWidth = getPayoutStripWidth(width);
  const padding = getChartPadding(stripWidth + 20);

  const visibleActive = activeRuns.slice(0, maxVisibleActive);
  const waitingCount = Math.max(0, activeRuns.length - maxVisibleActive);

  // Shared by the draw scene and pointer hit-testing so both agree on geometry.
  const computeLayout = () => {
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const bandX = width - padding.right + 4;

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

    return { plotW, plotH, bandX, yMin, yMax, xScale, yScale };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { bandX, yScale, yMin, yMax } = computeLayout();

    if (x >= bandX - 4) {
      if (!onSelectGroup) return;
      for (const dg of displayGroups) {
        const b = getGroupBandBounds(dg.group, barrierLevels, yScale, yMin, yMax, modeId);
        if (!b) continue;
        if (dg.group === 'core') {
          if (y >= b.posTop && y <= b.negBot) {
            onSelectGroup(dg.group);
            return;
          }
        } else {
          const inPos = y >= b.posTop && y <= b.posBot;
          const inNeg = y >= b.negTop && y <= b.negBot;
          if (inPos || inNeg) {
            onSelectGroup(dg.group);
            return;
          }
        }
      }
      return;
    }

    if (canDrop && onDropTap) onDropTap();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function drawScene() {
    if (!canvas || !ctx) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const colors = getPlinkoChartColors();
    const fontFamily = resolveTheme().fontFamily;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const { plotH, bandX, yMin, yMax, xScale, yScale } = computeLayout();
    const bandWidth = stripWidth;

    const activeRunIds = new Set(visibleActive.map((r) => r.id));

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

      // Called-shot highlight: pulsing outline + odds tag on the called band(s)
      if (calledGroup) {
        const bounds = getGroupBandBounds(calledGroup, barrierLevels, yScale, yMin, yMax, modeId);
        if (bounds) {
          const t = reducedMotion ? 0.5 : (performance.now() % 1600) / 1600;
          const pulse = reducedMotion ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI));
          const odds = getCallOdds(calledGroup);

          const outline = (top: number, bottom: number) => {
            if (bottom <= top) return;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = withAlpha(bounds.color, 0.28);
            ctx.fillRect(bandX, top, bandWidth, bottom - top);
            ctx.strokeStyle = bounds.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(bandX + 1, top + 1, bandWidth - 2, bottom - top - 2);
            ctx.restore();
          };

          if (calledGroup === 'core') {
            outline(bounds.posTop, bounds.negBot);
          } else {
            outline(bounds.posTop, bounds.posBot);
            outline(bounds.negTop, bounds.negBot);
          }

          const tagY = calledGroup === 'core'
            ? (bounds.posTop + bounds.negBot) / 2
            : (bounds.posTop + bounds.posBot) / 2;
          const tag = `CALL ${odds}×`;
          ctx.font = `bold 9px ${fontFamily}`;
          const tagW = ctx.measureText(tag).width + 10;
          const tagX = bandX - tagW - 6;
          ctx.fillStyle = bounds.color;
          ctx.beginPath();
          ctx.roundRect(tagX, tagY - 8, tagW, 16, 8);
          ctx.fill();
          ctx.fillStyle = colors.bg;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, tagX + tagW / 2, tagY);
          ctx.textBaseline = 'alphabetic';
        }
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

    // Idle anticipation: pulsing entry dot + shimmer sweep on the payout strip
    if (visibleActive.length === 0) {
      const pathColors = getPathStroke(false);
      if (!reducedMotion) {
        const t = (performance.now() % 1400) / 1400;
        ctx.strokeStyle = withAlpha(pathColors.stroke, (1 - t) * 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(padding.left, startY, 4 + t * 7, 0, Math.PI * 2);
        ctx.stroke();

        const sweepT = (performance.now() % 3200) / 3200;
        const sweepY = padding.top + sweepT * plotH;
        const sweepH = 44;
        const grad = ctx.createLinearGradient(0, sweepY - sweepH / 2, 0, sweepY + sweepH / 2);
        grad.addColorStop(0, withAlpha(pathColors.stroke, 0));
        grad.addColorStop(0.5, withAlpha(pathColors.stroke, 0.1));
        grad.addColorStop(1, withAlpha(pathColors.stroke, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(bandX, Math.max(padding.top, sweepY - sweepH / 2), bandWidth, sweepH);
      }
      ctx.fillStyle = pathColors.stroke;
      ctx.beginPath();
      ctx.arc(padding.left, startY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isEmpty) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors.emptyPrompt;
      ctx.font = `600 13px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        'Tap anywhere to drop a path',
        width / 2,
        height / 2 - 8,
      );
      ctx.font = `500 11px ${fontFamily}`;
      ctx.fillText('Tap a payout band to call your shot', width / 2, height / 2 + 12);
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
      const fade = Math.max(0, 1 - age / PATH_TRAIL_MS);
      drawPath(ctx, r, xScale, yScale, true, fade);
      drawPathEndpoint(ctx, r.run, xScale, yScale, fade);
    }

    for (const activeRun of visibleActive) {
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
        1,
      );
    }

    // Live price pill (Rise-Fall style: right-anchored, high-contrast)
    const headRun = visibleActive[visibleActive.length - 1];
    if (headRun) {
      const quotes = headRun.run.quotes;
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

        if (!reducedMotion && f.payout >= 2) {
          drawWinBurst(ctx, ex, ey, progress, f.id, f.payout >= 5 ? colors.semanticWin : getPathStroke(false).stroke);
        }

        // Tiered celebration: big multipliers get an expanding ring on top
        if (!reducedMotion && f.payout >= 10) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - progress) * 0.6;
          ctx.strokeStyle = colors.semanticWin;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 8 + progress * 42, 0, Math.PI * 2);
          ctx.stroke();
          if (f.payout >= 25) {
            ctx.beginPath();
            ctx.arc(ex, ey, 4 + progress * 26, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        }

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
    }

    drawSceneRef.current = drawScene;
    drawScene();
  });

  // Idle animation driver — while no active runs the parent stops re-rendering,
  // so pulse/shimmer/trail-fade need their own frame loop.
  useEffect(() => {
    if (visibleActive.length > 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const loop = () => {
      drawSceneRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visibleActive.length]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block cursor-pointer"
        style={{ width, height }}
        aria-label="Volatility path chart — tap to drop, tap a payout band to call your shot"
        onClick={handleCanvasClick}
      />
      {waitingCount > 0 ? (
        <span className="absolute top-9 left-2 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-on-subtle border border-border-subtle">
          +{waitingCount} waiting
        </span>
      ) : null}
    </div>
  );
}

/** Deterministic radial particle burst — seeded by float id so frames agree. */
function drawWinBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  seed: number,
  color: string,
) {
  const count = 10;
  const maxDist = 34;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = ((i + (seed % 7) * 0.37) / count) * Math.PI * 2;
    const speed = 0.7 + ((seed * 31 + i * 17) % 10) / 18;
    const dist = progress * maxDist * speed;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist - progress * 8;
    const r = Math.max(0.5, 2.4 * (1 - progress));
    ctx.globalAlpha = Math.max(0, 1 - progress) * 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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
