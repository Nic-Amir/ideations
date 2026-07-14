'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { TouchMode, TouchPath } from '@/lib/games/barrier-touch';
import type { SequenceLegState } from '@/hooks/use-barrier-touch';

interface TouchChartProps {
  mode: TouchMode;
  /** Locked round path while running/settled; null while idle. */
  path: TouchPath | null;
  visibleTick: number;
  /** Ambient price trail shown while idle. */
  previewPrices: number[];
  /** Entry line (count) / corridor center (sequence). */
  entrySpot: number;
  /** Sequence barriers; null in count mode. */
  upper: number | null;
  lower: number | null;
  /** Tick the reveal runs to; scales the x-axis during a round. */
  settleTick: number | null;
  /** Progress of the picked sequence. */
  legState: SequenceLegState | null;
  /** Which barrier the pick needs first ('upper' for U→L). */
  requiredFirst: 'upper' | 'lower' | null;
  eventFlash?: boolean;
  className?: string;
}

const PAD = { top: 24, right: 60, bottom: 16, left: 12 };

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

export function TouchChart({
  mode,
  path,
  visibleTick,
  previewPrices,
  entrySpot,
  upper,
  lower,
  settleTick,
  legState,
  requiredFirst,
  eventFlash = false,
  className,
}: TouchChartProps) {
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
  const isSequence = mode === 'sequence' && upper !== null && lower !== null;

  const chart = useMemo(() => {
    const prices = running ? path.prices : previewPrices;
    // Only reveal up to visibleTick during a round; a full-round scale would
    // leak the settle tick before it plays out.
    const revealed = running
      ? Math.min(visibleTick, prices.length - 1)
      : prices.length - 1;
    const seen = prices.slice(0, revealed + 1);

    const maxTick = running
      ? Math.max(settleTick ?? prices.length - 1, 12)
      : Math.max(revealed, 12);

    const anchors = isSequence
      ? [...seen, upper, lower, entrySpot]
      : [...seen, entrySpot];
    const span = Math.max(...anchors) - Math.min(...anchors);
    const margin = Math.max(span * 0.18, 1e-9);
    const yMin = Math.min(...anchors) - margin;
    const yMax = Math.max(...anchors) + margin;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const xScale = (i: number) => PAD.left + (i / Math.max(maxTick, 1)) * plotW;
    const yScale = (p: number) =>
      PAD.top + plotH - ((p - yMin) / (yMax - yMin)) * plotH;

    const headTick = revealed;
    const headPrice = seen[headTick] ?? entrySpot;

    // Count-mode crossing markers revealed so far.
    const crossings =
      running && mode === 'count'
        ? path.crossingTicks
            .filter((t) => t <= revealed)
            .map((t) => ({ tick: t, x: xScale(t), y: yScale(prices[t]) }))
        : [];

    return {
      xScale,
      yScale,
      entryY: yScale(entrySpot),
      upperY: upper !== null ? yScale(upper) : 0,
      lowerY: lower !== null ? yScale(lower) : 0,
      pathD: buildPathD(prices, revealed, xScale, yScale),
      head: { x: xScale(headTick), y: yScale(headPrice) },
      headPrice,
      crossings,
      plotTop: PAD.top,
      plotBottom: H - PAD.bottom,
      plotLeft: PAD.left,
      plotRight: W - PAD.right,
    };
  }, [
    path,
    running,
    visibleTick,
    previewPrices,
    entrySpot,
    upper,
    lower,
    settleTick,
    isSequence,
    mode,
    W,
    H,
  ]);

  // Which sequence barrier the story currently hangs on.
  const requiredNow =
    legState === 'waitingFirst'
      ? requiredFirst
      : legState === 'waitingSecond'
        ? requiredFirst === 'upper'
          ? 'lower'
          : 'upper'
        : null;
  const firstDone = legState === 'waitingSecond' || legState === 'completed';

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Barrier touch price chart"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={chart.plotLeft}
            x2={chart.plotRight}
            y1={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            y2={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            className="stroke-border-subtle opacity-50"
            strokeWidth={0.75}
            strokeDasharray="2 5"
          />
        ))}
        {/* Sequence: shade only the side the story needs next */}
        {isSequence && requiredNow === 'upper' ? (
          <rect
            x={chart.plotLeft}
            y={chart.plotTop}
            width={chart.plotRight - chart.plotLeft}
            height={Math.max(chart.upperY - chart.plotTop, 0)}
            className="fill-semantic-win opacity-5"
          />
        ) : null}
        {isSequence && requiredNow === 'lower' ? (
          <rect
            x={chart.plotLeft}
            y={chart.lowerY}
            width={chart.plotRight - chart.plotLeft}
            height={Math.max(chart.plotBottom - chart.lowerY, 0)}
            className="fill-semantic-loss opacity-5"
          />
        ) : null}
        {isSequence && !running ? (
          <>
            <rect
              x={chart.plotLeft}
              y={chart.plotTop}
              width={chart.plotRight - chart.plotLeft}
              height={Math.max(chart.upperY - chart.plotTop, 0)}
              className="fill-semantic-win opacity-[0.03]"
            />
            <rect
              x={chart.plotLeft}
              y={chart.lowerY}
              width={chart.plotRight - chart.plotLeft}
              height={Math.max(chart.plotBottom - chart.lowerY, 0)}
              className="fill-semantic-loss opacity-[0.03]"
            />
          </>
        ) : null}

        {/* Entry line — the count-mode star, a quiet reference in sequence */}
        <line
          x1={chart.plotLeft}
          y1={chart.entryY}
          x2={chart.plotRight}
          y2={chart.entryY}
          className={cn(
            mode === 'count' ? 'stroke-semantic-warning' : 'stroke-border-subtle',
          )}
          strokeWidth={mode === 'count' ? 1.5 : 1}
          strokeDasharray="4 4"
        />
        {mode === 'count' ? (
          <>
            <text
              x={chart.plotRight + 4}
              y={chart.entryY + 3}
              className="fill-semantic-warning text-[10px] font-body font-semibold"
            >
              Entry
            </text>
            <text
              x={chart.plotRight + 4}
              y={chart.entryY + 14}
              className="fill-on-subtle text-[9px] font-body tabular-nums"
            >
              {entrySpot.toFixed(0)}
            </text>
          </>
        ) : null}

        {/* Sequence barriers with leg-state emphasis */}
        {isSequence ? (
          <>
            <line
              x1={chart.plotLeft}
              y1={chart.upperY}
              x2={chart.plotRight}
              y2={chart.upperY}
              className={cn(
                'stroke-semantic-win transition-all',
                !running && 'opacity-70',
                requiredNow === 'upper' && 'animate-pulse',
              )}
              strokeWidth={requiredNow === 'upper' ? 2.5 : 1.5}
              strokeDasharray="6 3"
            />
            <text
              x={chart.plotRight + 4}
              y={chart.upperY + 3}
              className="fill-semantic-win text-[10px] font-body font-semibold"
            >
              {firstDone && requiredFirst === 'upper' ? 'Upper ✓' : 'Upper'}
            </text>
            <text
              x={chart.plotRight + 4}
              y={chart.upperY + 14}
              className="fill-on-subtle text-[9px] font-body tabular-nums"
            >
              {upper.toFixed(0)}
            </text>

            <line
              x1={chart.plotLeft}
              y1={chart.lowerY}
              x2={chart.plotRight}
              y2={chart.lowerY}
              className={cn(
                'stroke-semantic-loss transition-all',
                !running && 'opacity-70',
                requiredNow === 'lower' && 'animate-pulse',
              )}
              strokeWidth={requiredNow === 'lower' ? 2.5 : 1.5}
              strokeDasharray="6 3"
            />
            <text
              x={chart.plotRight + 4}
              y={chart.lowerY + 3}
              className="fill-semantic-loss text-[10px] font-body font-semibold"
            >
              {firstDone && requiredFirst === 'lower' ? 'Lower ✓' : 'Lower'}
            </text>
            <text
              x={chart.plotRight + 4}
              y={chart.lowerY + 14}
              className="fill-on-subtle text-[9px] font-body tabular-nums"
            >
              {lower.toFixed(0)}
            </text>
          </>
        ) : null}

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

        {/* Count-mode crossing markers */}
        {chart.crossings.map((c, i) => {
          const isLatest = i === chart.crossings.length - 1;
          return (
            <g key={c.tick}>
              {isLatest && eventFlash ? (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={12}
                  className="fill-semantic-warning opacity-30 animate-ping"
                />
              ) : null}
              <circle
                cx={c.x}
                cy={c.y}
                r={4}
                className="fill-semantic-warning stroke-card"
                strokeWidth={1.5}
              />
              <text
                x={c.x}
                y={c.y - 8}
                textAnchor="middle"
                className="fill-semantic-warning text-[9px] font-body font-bold tabular-nums"
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Sequence event ping at the head */}
        {isSequence && eventFlash ? (
          <circle
            cx={chart.head.x}
            cy={chart.head.y}
            r={14}
            className={cn(
              legState === 'busted' ? 'fill-semantic-loss' : 'fill-semantic-win',
              'opacity-30 animate-ping',
            )}
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
          <circle cx={chart.head.x} cy={chart.head.y} r={4} className="fill-primary" />
        )}

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
