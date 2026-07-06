'use strict';

/**
 * Pure canvas renderer for Volatility Plinko — no React.
 * Modeled on the Box-O engine/renderer split: the component owns the canvas
 * element and rAF scheduling; this module owns all draw logic and geometry.
 */

import type { BarrierZone, VolatilityRun } from '@/lib/games/plinko';
import { getPlinkoChartColors, getChartPadding, getPayoutStripWidth } from './plinko-chart-colors';

export interface RunView {
  id: number;
  run: VolatilityRun;
  animProgress: number;
  visibleTickIndex: number;
  /** Payout actually credited (differs from run.payout in target mode). */
  effectivePayout: number;
}

export interface SettlementFx {
  runId: number;
  zoneIndex: number;
  /** Effective payout used for celebration tier. */
  payout: number;
  won: boolean;
  startedAt: number;
  durationMs: number;
}

export interface ChartScene {
  width: number;
  height: number;
  tickCount: number;
  startPrice: number;
  zones: BarrierZone[];
  barrierLevels: { sigma: number; price: number }[];
  runs: RunView[];
  activeRuns: RunView[];
  fx: SettlementFx[];
  isEmpty: boolean;
  emptyLabel: string;
  emptySubLabel: string;
  /** Selected zone in target mode; null in spread mode. */
  targetZoneIndex: number | null;
  targetPayout: number | null;
  now: number;
}

interface Geometry {
  plotW: number;
  plotH: number;
  yMin: number;
  yMax: number;
  bandX: number;
  bandWidth: number;
  padding: { top: number; right: number; bottom: number; left: number };
  xScale: (i: number, totalTicks: number) => number;
  yScale: (v: number) => number;
}

function computeGeometry(scene: ChartScene): Geometry {
  const stripWidth = getPayoutStripWidth(scene.width);
  const padding = getChartPadding(stripWidth + 16);
  const plotW = scene.width - padding.left - padding.right;
  const plotH = scene.height - padding.top - padding.bottom;

  let allQuotes: number[] = [scene.startPrice];
  for (const r of scene.runs) allQuotes = allQuotes.concat(r.run.quotes);
  for (const r of scene.activeRuns) allQuotes = allQuotes.concat(r.run.quotes);

  const allValues = allQuotes.concat(scene.barrierLevels.map((b) => b.price));
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;
  const pad = range * 0.08;
  const yMin = minV - pad;
  const yMax = maxV + pad;

  return {
    plotW,
    plotH,
    yMin,
    yMax,
    bandX: scene.width - padding.right + 4,
    bandWidth: stripWidth,
    padding,
    xScale: (i, totalTicks) => padding.left + (i / totalTicks) * plotW,
    yScale: (v) => padding.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH,
  };
}

export function getZoneBandBounds(
  zoneIndex: number,
  scene: Pick<ChartScene, 'zones' | 'barrierLevels' | 'startPrice'>,
  geo: Pick<Geometry, 'yScale' | 'yMin' | 'yMax'>,
): { top: number; bottom: number; zone: BarrierZone } | null {
  const zone = scene.zones[zoneIndex];
  if (!zone) return null;

  const minK = zone.minSigma;
  const maxK = Math.min(zone.maxSigma, 5);
  const isPositive = zoneIndex <= 4;
  const { yScale } = geo;

  if (isPositive) {
    const barrierMin = scene.barrierLevels.find((b) => b.sigma === minK);
    const barrierMax = scene.barrierLevels.find((b) => b.sigma === maxK);
    const top = barrierMax ? yScale(barrierMax.price) : yScale(geo.yMax);
    const bottom = barrierMin ? yScale(barrierMin.price) : yScale(scene.startPrice);
    if (bottom > top) return { top, bottom, zone };
  } else {
    const barrierMin = scene.barrierLevels.find((b) => b.sigma === -minK);
    const barrierMax = scene.barrierLevels.find((b) => b.sigma === -maxK);
    const top = barrierMin ? yScale(barrierMin.price) : yScale(scene.startPrice);
    const bottom = barrierMax ? yScale(barrierMax.price) : yScale(geo.yMin);
    if (bottom > top) return { top, bottom, zone };
  }
  return null;
}

/**
 * Map a canvas-local point to the zone whose price band contains it.
 * Used for tap-to-target selection (Box-O touch-to-place pattern).
 */
export function hitTestZone(scene: ChartScene, x: number, y: number): number | null {
  const geo = computeGeometry(scene);
  if (x < geo.padding.left || x > scene.width) return null;
  for (let i = 0; i < scene.zones.length; i++) {
    const bounds = getZoneBandBounds(i, scene, geo);
    if (bounds && y >= bounds.top && y <= bounds.bottom) return i;
  }
  // Above/below all drawn bands → nearest extreme
  const centerBounds = getZoneBandBounds(4, scene, geo);
  if (centerBounds) return y < centerBounds.top ? 0 : 8;
  return null;
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

export function renderPlinkoChart(ctx: CanvasRenderingContext2D, scene: ChartScene): void {
  const colors = getPlinkoChartColors();
  const { width, height } = scene;
  const geo = computeGeometry(scene);
  const { padding, plotW, plotH, bandX, bandWidth, xScale, yScale } = geo;

  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 12);
  ctx.fill();

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

  // Start price line
  const startY = yScale(scene.startPrice);
  ctx.strokeStyle = colors.startLine;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, startY);
  ctx.lineTo(width - padding.right, startY);
  ctx.stroke();
  ctx.setLineDash([]);

  drawZoneBands(ctx, scene, geo);
  drawTargetHighlight(ctx, scene, geo);
  drawFxZoneFlashes(ctx, scene, geo);
  drawAxisLabels(ctx, scene, geo);

  if (scene.isEmpty) {
    ctx.fillStyle = colors.emptyPrompt;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(scene.emptyLabel, width / 2, height / 2);
    ctx.font = '11px sans-serif';
    ctx.fillText(scene.emptySubLabel, width / 2, height / 2 + 18);
    return;
  }

  // Completed runs (faded)
  const activeIds = new Set(scene.activeRuns.map((r) => r.id));
  for (const r of scene.runs) {
    if (activeIds.has(r.id)) continue;
    drawFadedPath(ctx, r, xScale, yScale);
  }

  // Active runs
  for (const r of scene.activeRuns) {
    drawActivePath(ctx, r, scene, geo);
  }

  drawSettlementFx(ctx, scene, geo);

  // X-axis
  ctx.fillStyle = colors.textMuted;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const sampleLen =
    scene.activeRuns[0]?.run.quotes.length ??
    scene.runs[0]?.run.quotes.length ??
    scene.tickCount + 1;
  const totalTicks = sampleLen - 1;
  const step = Math.max(1, Math.floor(totalTicks / 5));
  for (let i = 0; i <= totalTicks; i += step) {
    ctx.fillText(String(i), xScale(i, totalTicks), height - 10);
  }
}

function drawZoneBands(ctx: CanvasRenderingContext2D, scene: ChartScene, geo: Geometry): void {
  const { padding, plotW, bandX, bandWidth, yScale } = geo;
  const bgAlpha = scene.isEmpty ? '14' : '10';
  const stripAlpha = scene.isEmpty ? '22' : '18';

  for (let i = 0; i < scene.zones.length; i++) {
    const bounds = getZoneBandBounds(i, scene, geo);
    if (!bounds) continue;
    const { zone, top, bottom } = bounds;

    ctx.fillStyle = zone.color + bgAlpha;
    ctx.fillRect(padding.left, top, plotW, bottom - top);
    ctx.fillStyle = zone.color + stripAlpha;
    ctx.fillRect(bandX, top, bandWidth, bottom - top);
    ctx.fillStyle = zone.color;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${zone.payout}×`, bandX + 4, (top + bottom) / 2 + 3);
  }

  // Barrier lines
  for (const barrier of scene.barrierLevels) {
    const absK = Math.abs(barrier.sigma);
    const zone = scene.zones
      .slice(0, 5)
      .find((z) => z.minSigma === absK || z.maxSigma === absK);
    const bColor = zone?.color ?? '#555';
    const by = yScale(barrier.price);
    ctx.strokeStyle = bColor + (scene.isEmpty ? '70' : '50');
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(padding.left, by);
    ctx.lineTo(scene.width - padding.right, by);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawTargetHighlight(ctx: CanvasRenderingContext2D, scene: ChartScene, geo: Geometry): void {
  if (scene.targetZoneIndex === null) return;
  const bounds = getZoneBandBounds(scene.targetZoneIndex, scene, geo);
  if (!bounds) return;
  const { padding, plotW, bandX, bandWidth } = geo;

  ctx.save();
  ctx.strokeStyle = bounds.zone.color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(padding.left, bounds.top, plotW, bounds.bottom - bounds.top);
  ctx.setLineDash([]);

  ctx.fillStyle = bounds.zone.color + '28';
  ctx.fillRect(bandX - 2, bounds.top, bandWidth + 2, bounds.bottom - bounds.top);
  ctx.strokeStyle = bounds.zone.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(bandX - 2, bounds.top, bandWidth + 2, bounds.bottom - bounds.top);

  ctx.fillStyle = bounds.zone.color;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  const label = scene.targetPayout !== null ? `◎ ${scene.targetPayout}×` : '◎ target';
  ctx.fillText(label, padding.left + 6, Math.max(bounds.top + 12, 12));
  ctx.restore();
}

function drawFxZoneFlashes(ctx: CanvasRenderingContext2D, scene: ChartScene, geo: Geometry): void {
  const { bandX, bandWidth } = geo;
  for (const fx of scene.fx) {
    const elapsed = scene.now - fx.startedAt;
    if (elapsed > fx.durationMs) continue;
    const alpha = Math.max(0, 1 - elapsed / fx.durationMs);
    const bounds = getZoneBandBounds(fx.zoneIndex, scene, geo);
    if (!bounds) continue;
    ctx.fillStyle =
      bounds.zone.color + Math.round(alpha * 80).toString(16).padStart(2, '0');
    ctx.fillRect(bandX, bounds.top, bandWidth, bounds.bottom - bounds.top);
  }
}

function drawAxisLabels(ctx: CanvasRenderingContext2D, scene: ChartScene, geo: Geometry): void {
  const colors = getPlinkoChartColors();
  const { padding, plotH, yScale, yMin, yMax } = geo;

  for (const barrier of scene.barrierLevels) {
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

  ctx.fillStyle = colors.textMuted;
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const val = yMin + ((yMax - yMin) / 5) * (5 - i);
    const y = padding.top + (plotH / 5) * i;
    ctx.fillText(val.toFixed(1), padding.left - 6, y + 3);
  }
}

function pathColors(effectivePayout: number, faded: boolean) {
  const colors = getPlinkoChartColors();
  const netWin = effectivePayout >= 1;
  return {
    stroke: netWin
      ? faded ? colors.pathUpFaint : colors.pathUp
      : faded ? colors.pathDownFaint : colors.pathDown,
    glow: netWin ? colors.pathUpGlow : colors.pathDownGlow,
  };
}

function drawFadedPath(
  ctx: CanvasRenderingContext2D,
  view: RunView,
  xScale: Geometry['xScale'],
  yScale: Geometry['yScale'],
): void {
  const quotes = view.run.quotes;
  const total = quotes.length - 1;
  ctx.strokeStyle = pathColors(view.effectivePayout, true).stroke;
  ctx.lineWidth = 1.5;
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
  view: RunView,
  scene: ChartScene,
  geo: Geometry,
): void {
  const colors = getPlinkoChartColors();
  const { xScale, yScale, bandX, bandWidth } = geo;
  const quotes = view.run.quotes;
  const digits = view.run.digits;
  const total = quotes.length - 1;
  const visibleCount = Math.max(1, view.visibleTickIndex + 1);

  const settled = view.animProgress >= 1;
  const colorPayout = settled ? view.effectivePayout : view.run.isPositive ? 1.5 : 0.5;
  const pc = pathColors(colorPayout, false);

  ctx.save();
  ctx.shadowColor = pc.glow;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = pc.stroke;
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
  const pulse = 5 + Math.sin(scene.now / 80) * 1.5;

  ctx.save();
  ctx.shadowColor = pc.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = pc.stroke;
  ctx.beginPath();
  ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (lastIdx > 0 && digits[lastIdx - 1] !== undefined) {
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

  if (settled) {
    const bounds = getZoneBandBounds(view.run.zoneIndex, scene, geo);
    if (bounds) {
      ctx.strokeStyle = bounds.zone.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bandX - 2, bounds.top - 1, bandWidth + 4, bounds.bottom - bounds.top + 2);
    }

    ctx.fillStyle = pc.stroke;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const pctStr = (view.run.percentChange * 100).toFixed(2);
    const sign = view.run.percentChange >= 0 ? '+' : '';
    ctx.fillText(`${sign}${pctStr}%`, ex + 10, ey - 4);
    ctx.fillText(`${view.effectivePayout}×`, ex + 10, ey + 10);
  }
}

// ---------------------------------------------------------------------------
// Settlement celebration — Box-O style in-canvas win burst + floating payout
// ---------------------------------------------------------------------------

function findRunTerminal(
  scene: ChartScene,
  geo: Geometry,
  runId: number,
): { x: number; y: number } | null {
  const view =
    scene.runs.find((r) => r.id === runId) ??
    scene.activeRuns.find((r) => r.id === runId);
  if (!view) return null;
  const quotes = view.run.quotes;
  const total = quotes.length - 1;
  return {
    x: geo.xScale(total, total),
    y: geo.yScale(quotes[total]),
  };
}

function drawSettlementFx(ctx: CanvasRenderingContext2D, scene: ChartScene, geo: Geometry): void {
  const colors = getPlinkoChartColors();

  for (const fx of scene.fx) {
    const elapsed = scene.now - fx.startedAt;
    if (elapsed > fx.durationMs) continue;
    const progress = elapsed / fx.durationMs;
    const terminal = findRunTerminal(scene, geo, fx.runId);
    if (!terminal) continue;

    if (fx.won) {
      // Particle burst — count scales with payout tier
      const particleCount = fx.payout > 10 ? 16 : fx.payout > 3 ? 10 : 6;
      const maxRadius = fx.payout > 10 ? 52 : 32;
      const zone = scene.zones[fx.zoneIndex];
      const burstColor = zone?.color ?? colors.pathUp;
      const alpha = Math.max(0, 1 - progress);

      ctx.save();
      ctx.fillStyle =
        burstColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + fx.runId;
        const dist = progress * maxRadius;
        const px = terminal.x + Math.cos(angle) * dist;
        const py = terminal.y + Math.sin(angle) * dist;
        const size = Math.max(0.5, 3 * (1 - progress));
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Floating payout text drifting upward
      const floatY = terminal.y - 18 - progress * 26;
      const textAlpha = progress < 0.7 ? 1 : Math.max(0, (1 - progress) / 0.3);
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = burstColor;
      ctx.font = `bold ${fx.payout > 10 ? 16 : 13}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`+${fx.payout}×`, terminal.x, floatY);
      ctx.restore();
    } else {
      // Loss flash — brief dim ring
      const alpha = Math.max(0, 0.5 - progress);
      ctx.save();
      ctx.strokeStyle =
        colors.pathDown + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(terminal.x, terminal.y, 8 + progress * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
