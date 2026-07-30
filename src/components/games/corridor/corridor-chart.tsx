'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { BarrierSide, CorridorPath, CorridorPick } from '@/lib/games/corridor';

interface CorridorChartProps {
  path: CorridorPath | null;
  visibleTick: number;
  previewPrices: number[];
  upper: number;
  lower: number;
  entrySpot: number;
  barrierFlash?: boolean;
  touched?: BarrierSide | null;
  /** Running progress 0–1 */
  progress?: number | null;
  pick?: CorridorPick | null;
  className?: string;
}

const PAD = { top: 28, right: 56, bottom: 20, left: 12 };

const SIDE_CLASS = {
  upper: { fill: 'fill-semantic-win', stroke: 'stroke-semantic-win' },
  lower: { fill: 'fill-semantic-loss', stroke: 'stroke-semantic-loss' },
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

/**
 * Visual corridor only — barriers + path. Bets are not mapped to chart Y
 * (Outside is either barrier, not “top vs bottom”).
 */
export function CorridorChart({
  path,
  visibleTick,
  previewPrices,
  upper,
  lower,
  entrySpot,
  barrierFlash = false,
  touched = null,
  progress = null,
  pick = null,
  className,
}: CorridorChartProps) {
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
    const revealed = running
      ? Math.min(visibleTick, prices.length - 1)
      : prices.length - 1;
    const seen = prices.slice(0, revealed + 1);
    const maxTick = running ? Math.max(path.settleTick, 12) : Math.max(revealed, 12);

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
    const upperY = yScale(upper);
    const lowerY = yScale(lower);

    return {
      upperY,
      lowerY,
      entryY: yScale(entrySpot),
      pathD: buildPathD(prices, revealed, xScale, yScale),
      head: { x: xScale(headTick), y: yScale(headPrice) },
      headPrice,
      plotTop: PAD.top,
      plotBottom: H - PAD.bottom,
      plotLeft: PAD.left,
      plotRight: W - PAD.right,
      corridorH: Math.max(lowerY - upperY, 0),
      midY: (upperY + lowerY) / 2,
    };
  }, [path, running, visibleTick, previewPrices, upper, lower, entrySpot, W, H]);

  const flashSide = barrierFlash && touched ? SIDE_CLASS[touched] : null;

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', className)}>
      {progress !== null && progress !== undefined ? (
        <div className="absolute inset-x-0 top-0 z-30 h-1 bg-subtle/80" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Corridor price chart"
        className="absolute inset-0"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={chart.plotLeft}
            x2={chart.plotRight}
            y1={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            y2={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            className="stroke-border-subtle opacity-40"
            strokeWidth={0.75}
            strokeDasharray="2 5"
          />
        ))}

        {flashSide ? (
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            className={cn(flashSide.fill, 'opacity-10 animate-pulse')}
          />
        ) : null}

        {/* Exterior (either side of corridor) — one shared tint, not two bets */}
        <rect
          x={chart.plotLeft}
          y={chart.plotTop}
          width={chart.plotRight - chart.plotLeft}
          height={Math.max(chart.upperY - chart.plotTop, 0)}
          className="fill-semantic-info opacity-[0.06]"
        />
        <rect
          x={chart.plotLeft}
          y={chart.lowerY}
          width={chart.plotRight - chart.plotLeft}
          height={Math.max(chart.plotBottom - chart.lowerY, 0)}
          className="fill-semantic-info opacity-[0.06]"
        />

        {/* Corridor band */}
        <rect
          x={chart.plotLeft}
          y={chart.upperY}
          width={chart.plotRight - chart.plotLeft}
          height={chart.corridorH}
          className="fill-primary opacity-[0.1]"
        />

        {!running && chart.corridorH > 40 ? (
          <text
            x={(chart.plotLeft + chart.plotRight) / 2}
            y={chart.midY + 4}
            textAnchor="middle"
            className="fill-primary text-[11px] font-body font-semibold opacity-35"
          >
            Corridor
          </text>
        ) : null}

        <line
          x1={chart.plotLeft}
          y1={chart.entryY}
          x2={chart.plotRight}
          y2={chart.entryY}
          className="stroke-border-subtle"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        <line
          x1={chart.plotLeft}
          y1={chart.upperY}
          x2={chart.plotRight}
          y2={chart.upperY}
          className={cn(
            'stroke-primary transition-all',
            !running && 'opacity-70',
            barrierFlash && touched === 'upper' && 'opacity-100',
          )}
          strokeWidth={barrierFlash && touched === 'upper' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.upperY + 3}
          className="fill-on-subtle text-[9px] font-body font-semibold"
        >
          Barrier
        </text>

        <line
          x1={chart.plotLeft}
          y1={chart.lowerY}
          x2={chart.plotRight}
          y2={chart.lowerY}
          className={cn(
            'stroke-primary transition-all',
            !running && 'opacity-70',
            barrierFlash && touched === 'lower' && 'opacity-100',
          )}
          strokeWidth={barrierFlash && touched === 'lower' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.lowerY + 3}
          className="fill-on-subtle text-[9px] font-body font-semibold"
        >
          Barrier
        </text>

        {chart.pathD ? (
          <path
            d={chart.pathD}
            fill="none"
            className={cn('stroke-on-prominent', !running && 'opacity-55')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {running ? (
          <circle
            cx={chart.head.x}
            cy={chart.head.y}
            r={5}
            className="fill-on-prominent stroke-prominent"
            strokeWidth={1.5}
          />
        ) : (
          <circle
            cx={chart.head.x}
            cy={chart.head.y}
            r={3.5}
            className="fill-on-prominent opacity-70"
          />
        )}

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

        <text
          x={chart.plotLeft}
          y={18}
          className="fill-on-subtle text-[10px] font-body tabular-nums"
        >
          Spot {chart.headPrice.toFixed(2)}
        </text>
      </svg>

      {running && pick ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold text-on-prominent-static-inverse',
              pick === 'stay' ? 'bg-primary' : 'bg-semantic-info',
            )}
          >
            Watching {pick === 'stay' ? 'Inside' : 'Outside'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
