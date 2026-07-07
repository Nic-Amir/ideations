'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { BarrierSide, PredictorPath } from '@/lib/games/barrier-predictor';

interface PredictorChartProps {
  /** Locked round path while running/settled; null while idle. */
  path: PredictorPath | null;
  visibleTick: number;
  /** Ambient price trail shown while idle. */
  previewPrices: number[];
  /** Barriers to draw: live-updating while idle, locked during a round. */
  upper: number;
  lower: number;
  entrySpot: number;
  barrierFlash?: boolean;
  /** Which barrier settled the round (colors the flash). */
  touched?: BarrierSide | null;
  className?: string;
}

const PAD = { top: 24, right: 60, bottom: 16, left: 12 };

const SIDE_CLASS = {
  upper: { fill: 'fill-semantic-win', stroke: 'stroke-semantic-win', text: 'fill-semantic-win' },
  lower: { fill: 'fill-semantic-loss', stroke: 'stroke-semantic-loss', text: 'fill-semantic-loss' },
} as const;

function buildPathD(
  prices: number[],
  lastIndex: number,
  xScale: (i: number) => number,
  yScale: (p: number) => number,
): string {
  const n = Math.min(lastIndex + 1, prices.length);
  if (n < 1) return '';
  let d = `M ${xScale(0)} ${yScale(prices[0])}`;
  for (let i = 1; i < n; i++) {
    d += ` L ${xScale(i)} ${yScale(prices[i])}`;
  }
  return d;
}

export function PredictorChart({
  path,
  visibleTick,
  previewPrices,
  upper,
  lower,
  entrySpot,
  barrierFlash = false,
  touched = null,
  className,
}: PredictorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 240 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w;
  const H = size.h;
  const running = path !== null;

  const chart = useMemo(() => {
    const prices = running ? path.prices : previewPrices;
    // During a round, only reveal up to visibleTick; a fixed full-round scale
    // would leak the settle tick before it plays out.
    const revealed = running
      ? Math.min(visibleTick, prices.length - 1)
      : prices.length - 1;
    const seen = prices.slice(0, revealed + 1);

    // X-axis: while running, scale to the max duration so the corridor walk
    // is readable; while idle, scroll the ambient window.
    const maxTick = running ? Math.max(path.settleTick, 12) : Math.max(revealed, 12);

    // Y-axis must always contain both barriers plus the revealed prices.
    const allPrices = [...seen, upper, lower, entrySpot];
    const span = Math.max(...allPrices) - Math.min(...allPrices);
    const margin = Math.max(span * 0.18, 1e-9);
    const yMin = Math.min(...allPrices) - margin;
    const yMax = Math.max(...allPrices) + margin;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const xScale = (i: number) => PAD.left + (i / Math.max(maxTick, 1)) * plotW;
    const yScale = (p: number) =>
      PAD.top + plotH - ((p - yMin) / (yMax - yMin)) * plotH;

    const headTick = revealed;
    const headPrice = seen[headTick] ?? entrySpot;

    return {
      xScale,
      yScale,
      upperY: yScale(upper),
      lowerY: yScale(lower),
      entryY: yScale(entrySpot),
      pathD: buildPathD(prices, revealed, xScale, yScale),
      head: { x: xScale(headTick), y: yScale(headPrice) },
      headPrice,
      plotTop: PAD.top,
      plotBottom: H - PAD.bottom,
      plotLeft: PAD.left,
      plotRight: W - PAD.right,
    };
  }, [path, running, visibleTick, previewPrices, upper, lower, entrySpot, W, H]);

  const flashSide = barrierFlash && touched ? SIDE_CLASS[touched] : null;

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Barrier predictor price chart"
      >
        {/* Touched-barrier color wash across the chart at settlement */}
        {flashSide ? (
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            className={cn(flashSide.fill, 'opacity-10 animate-pulse')}
          />
        ) : null}

        {/* Zone shading: win-tinted breakout region above U, loss-tinted below L */}
        <rect
          x={chart.plotLeft}
          y={chart.plotTop}
          width={chart.plotRight - chart.plotLeft}
          height={Math.max(chart.upperY - chart.plotTop, 0)}
          className="fill-semantic-win opacity-5"
        />
        <rect
          x={chart.plotLeft}
          y={chart.lowerY}
          width={chart.plotRight - chart.plotLeft}
          height={Math.max(chart.plotBottom - chart.lowerY, 0)}
          className="fill-semantic-loss opacity-5"
        />

        {/* Entry spot reference */}
        <line
          x1={chart.plotLeft}
          y1={chart.entryY}
          x2={chart.plotRight}
          y2={chart.entryY}
          className="stroke-border-subtle"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Upper barrier */}
        <line
          x1={chart.plotLeft}
          y1={chart.upperY}
          x2={chart.plotRight}
          y2={chart.upperY}
          className={cn(
            'stroke-semantic-win transition-all',
            !running && 'opacity-70',
            barrierFlash && touched === 'upper' && 'opacity-100',
          )}
          strokeWidth={barrierFlash && touched === 'upper' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.upperY + 3}
          className="fill-semantic-win text-[10px] font-body font-semibold"
        >
          Upper
        </text>
        <text
          x={chart.plotRight + 4}
          y={chart.upperY + 14}
          className="fill-on-subtle text-[9px] font-body tabular-nums"
        >
          {upper.toFixed(0)}
        </text>

        {/* Lower barrier */}
        <line
          x1={chart.plotLeft}
          y1={chart.lowerY}
          x2={chart.plotRight}
          y2={chart.lowerY}
          className={cn(
            'stroke-semantic-loss transition-all',
            !running && 'opacity-70',
            barrierFlash && touched === 'lower' && 'opacity-100',
          )}
          strokeWidth={barrierFlash && touched === 'lower' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.lowerY + 3}
          className="fill-semantic-loss text-[10px] font-body font-semibold"
        >
          Lower
        </text>
        <text
          x={chart.plotRight + 4}
          y={chart.lowerY + 14}
          className="fill-on-subtle text-[9px] font-body tabular-nums"
        >
          {lower.toFixed(0)}
        </text>

        {/* Price line */}
        {chart.pathD ? (
          <path
            d={chart.pathD}
            fill="none"
            className={cn('stroke-primary', !running && 'opacity-60')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Head marker */}
        {running ? (
          <circle
            cx={chart.head.x}
            cy={chart.head.y}
            r={5}
            className="fill-primary stroke-prominent"
            strokeWidth={1.5}
          />
        ) : (
          <>
            {/* Idle: pulsing marker inviting play */}
            <circle
              cx={chart.head.x}
              cy={chart.head.y}
              r={10}
              className="fill-primary opacity-20 animate-ping"
            />
            <circle
              cx={chart.head.x}
              cy={chart.head.y}
              r={4}
              className="fill-primary"
            />
          </>
        )}

        {/* Touch ping at settlement */}
        {flashSide ? (
          <>
            <circle
              cx={chart.head.x}
              cy={chart.head.y}
              r={12}
              className={cn(flashSide.fill, 'opacity-30 animate-ping')}
            />
            <circle
              cx={chart.head.x}
              cy={chart.head.y}
              r={22}
              className={cn(flashSide.stroke, 'fill-none opacity-40 animate-ping')}
              strokeWidth={2}
            />
          </>
        ) : null}

        {/* Live price readout */}
        <text
          x={chart.plotLeft}
          y={16}
          className="fill-on-subtle text-[10px] font-body tabular-nums"
        >
          Spot {chart.headPrice.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}
