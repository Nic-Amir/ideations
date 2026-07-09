'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { AssetId, RacePath } from '@/lib/games/barrier-race';

interface RaceChartProps {
  path: RacePath | null;
  visibleTick: number;
  barrier: number;
  startPrice: number;
  barrierFlash?: boolean;
  /** After a cash-out the remaining path replays as a faded counterfactual. */
  ghost?: boolean;
  /** Losing pick that came close to the barrier — flashes its lane on settle. */
  nearMissAsset?: AssetId | null;
  className?: string;
}

const PAD = { top: 28, right: 16, bottom: 16, left: 48 };

const WINNER_CLASS = {
  drift: { fill: 'fill-primary', stroke: 'stroke-primary' },
  vol: { fill: 'fill-semantic-info', stroke: 'stroke-semantic-info' },
} as const;

function buildPathD(
  prices: number[],
  visibleTick: number,
  xScale: (i: number) => number,
  yScale: (p: number) => number,
): string {
  const n = Math.min(visibleTick + 1, prices.length);
  if (n < 1) return '';
  let d = `M ${xScale(0)} ${yScale(prices[0])}`;
  for (let i = 1; i < n; i++) {
    d += ` L ${xScale(i)} ${yScale(prices[i])}`;
  }
  return d;
}

export function RaceChart({
  path,
  visibleTick,
  barrier,
  startPrice,
  barrierFlash = false,
  ghost = false,
  nearMissAsset = null,
  className,
}: RaceChartProps) {
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

  const chart = useMemo(() => {
    const prices1 = path?.prices1 ?? [startPrice];
    const prices2 = path?.prices2 ?? [startPrice];
    // Scale axes to what has been revealed so far — a fixed full-race scale
    // would leak the finish tick and future price range before they play out.
    const revealed = Math.min(visibleTick, prices1.length - 1);
    const maxTick = Math.max(revealed, 12);
    const seen1 = prices1.slice(0, revealed + 1);
    const seen2 = prices2.slice(0, revealed + 1);
    const allPrices = [...seen1, ...seen2, barrier, startPrice];
    const yMin = Math.min(...allPrices) * 0.998;
    const yMax = Math.max(...allPrices) * 1.002;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const xScale = (i: number) =>
      PAD.left + (i / Math.max(maxTick, 1)) * plotW;
    const yScale = (p: number) =>
      PAD.top + plotH - ((p - yMin) / (yMax - yMin)) * plotH;

    const barrierY = yScale(barrier);
    const tick = revealed;
    const p1 = prices1[tick] ?? startPrice;
    const p2 = prices2[tick] ?? startPrice;

    const finished = path !== null && tick >= path.settleTick;
    const winnerHead =
      finished && (path.winner === 'drift' || path.winner === 'vol')
        ? path.winner === 'drift'
          ? { x: xScale(tick), y: yScale(p1), asset: 'drift' as const }
          : { x: xScale(tick), y: yScale(p2), asset: 'vol' as const }
        : null;

    return {
      xScale,
      yScale,
      barrierY,
      pathD1: buildPathD(prices1, visibleTick, xScale, yScale),
      pathD2: buildPathD(prices2, visibleTick, xScale, yScale),
      head1: { x: xScale(tick), y: yScale(p1) },
      head2: { x: xScale(tick), y: yScale(p2) },
      winnerHead,
      yMin,
      yMax,
      startY: yScale(startPrice),
    };
  }, [path, visibleTick, barrier, startPrice, W, H]);

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Race price chart"
      >
        {/* Winner color wash across the chart at settlement */}
        {barrierFlash && chart.winnerHead ? (
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            className={cn(
              WINNER_CLASS[chart.winnerHead.asset].fill,
              'opacity-10 animate-pulse',
            )}
          />
        ) : null}

        <line
          x1={PAD.left}
          y1={chart.startY}
          x2={W - PAD.right}
          y2={chart.startY}
          className="stroke-border-subtle"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        <line
          x1={PAD.left}
          y1={chart.barrierY}
          x2={W - PAD.right}
          y2={chart.barrierY}
          className={cn(
            'stroke-semantic-warning',
            !path && 'animate-pulse',
            barrierFlash && 'opacity-100',
          )}
          strokeWidth={barrierFlash ? 3 : 1.5}
          strokeDasharray="6 4"
        />
        <text
          x={W - PAD.right}
          y={chart.barrierY - 8}
          textAnchor="end"
          className="fill-on-subtle text-[10px] font-body"
        >
          Target {barrier.toFixed(2)}
        </text>

        <text
          x={PAD.left - 6}
          y={chart.startY + 3}
          textAnchor="end"
          className="fill-on-subtle text-[10px] font-body tabular-nums"
        >
          {startPrice.toFixed(0)}
        </text>

        {chart.pathD1 ? (
          <path
            d={chart.pathD1}
            fill="none"
            className={cn(
              'stroke-primary',
              ghost && 'opacity-40',
              nearMissAsset === 'drift' && 'animate-pulse',
            )}
            strokeWidth={nearMissAsset === 'drift' ? 3 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {chart.pathD2 ? (
          <path
            d={chart.pathD2}
            fill="none"
            className={cn(
              'stroke-semantic-info',
              ghost && 'opacity-40',
              nearMissAsset === 'vol' && 'animate-pulse',
            )}
            strokeWidth={nearMissAsset === 'vol' ? 3 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {path ? (
          <>
            <circle
              cx={chart.head1.x}
              cy={chart.head1.y}
              r={5}
              className="fill-primary stroke-prominent"
              strokeWidth={1.5}
            />
            <circle
              cx={chart.head2.x}
              cy={chart.head2.y}
              r={5}
              className="fill-semantic-info stroke-prominent"
              strokeWidth={1.5}
            />
          </>
        ) : (
          <>
            {/* Idle: both assets parked at spot */}
            <circle
              cx={chart.head1.x}
              cy={chart.head1.y}
              r={8}
              className="fill-none stroke-semantic-info"
              strokeWidth={2.5}
            />
            <circle
              cx={chart.head1.x}
              cy={chart.head1.y}
              r={4}
              className="fill-primary"
            />
          </>
        )}

        {barrierFlash && chart.winnerHead ? (
          <>
            <circle
              cx={chart.winnerHead.x}
              cy={chart.winnerHead.y}
              r={12}
              className={cn(
                WINNER_CLASS[chart.winnerHead.asset].fill,
                'opacity-30 animate-ping',
              )}
            />
            <circle
              cx={chart.winnerHead.x}
              cy={chart.winnerHead.y}
              r={22}
              className={cn(
                WINNER_CLASS[chart.winnerHead.asset].stroke,
                'fill-none opacity-40 animate-ping',
              )}
              strokeWidth={2}
            />
          </>
        ) : null}

        <g className="fill-on-subtle text-[10px] font-body">
          <circle cx={PAD.left} cy={14} r={4} className="fill-primary" />
          <text x={PAD.left + 8} y={17}>
            Drift
          </text>
          <circle cx={PAD.left + 54} cy={14} r={4} className="fill-semantic-info" />
          <text x={PAD.left + 62} y={17}>
            Vol
          </text>
        </g>
      </svg>
    </div>
  );
}
