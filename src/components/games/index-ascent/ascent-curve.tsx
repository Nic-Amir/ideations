'use client';

import { useId, useMemo } from 'react';
import type { IndexAscentState } from '@/types';

interface AscentCurveProps {
  curve: number[];
  phase: IndexAscentState;
  autoCashoutTarget?: number | null;
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 100;
const PAD = { top: 8, right: 15, bottom: 17, left: 5 };
const MIN_VISIBLE_TICKS = 6;
const MIN_MULTIPLIER_RANGE = 0.08;

/** Compact, full-history survival runway for the current Index Ascent position. */
export function AscentCurve({
  curve,
  phase,
  autoCashoutTarget = null,
  className,
}: AscentCurveProps) {
  const gradientId = `ascent-fill-${useId().replace(/:/g, '')}`;
  const chart = useMemo(() => {
    const values = curve.length > 0 ? curve : [1];
    const revealedTicks = Math.max(values.length - 1, 0);
    const xDomain = Math.max(revealedTicks, MIN_VISIBLE_TICKS);
    const observedMax = Math.max(...values, 1);
    const observedRange = Math.max(observedMax - 1, MIN_MULTIPLIER_RANGE);
    const naturalMax = 1 + observedRange * 1.2;
    const targetVisible =
      autoCashoutTarget !== null &&
      autoCashoutTarget > 1 &&
      autoCashoutTarget <= 1 + observedRange * 1.5;
    const yMin = 1;
    const yMax = targetVisible && autoCashoutTarget
      ? Math.max(naturalMax, 1 + (autoCashoutTarget - 1) * 1.08)
      : naturalMax;
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const xScale = (index: number) => PAD.left + (index / xDomain) * plotW;
    const yScale = (value: number) =>
      PAD.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
    const points = values.map((value, index) => [xScale(index), yScale(value)] as const);
    const [firstX, firstY] = points[0];
    const stepPath = points.slice(1).reduce(
      (path, [x, y]) => `${path} H${x.toFixed(2)} V${y.toFixed(2)}`,
      `M${firstX.toFixed(2)},${firstY.toFixed(2)}`,
    );
    const [endX, endY] = points[points.length - 1];
    const baselineY = yScale(1);
    const areaPath = `${stepPath} L${endX.toFixed(2)},${baselineY.toFixed(2)} L${firstX.toFixed(2)},${baselineY.toFixed(2)} Z`;
    const gridValues = [0.33, 0.66, 1].map((ratio) => yMin + ratio * (yMax - yMin));
    const xTickValues = Array.from(new Set([
      0,
      Math.round(xDomain / 3),
      Math.round((xDomain * 2) / 3),
      xDomain,
    ]));
    const current = values[values.length - 1];

    return {
      stepPath,
      areaPath,
      endX,
      endY,
      baselineY,
      gridValues,
      xTickValues,
      xScale,
      yScale,
      targetVisible,
      current,
      plotRight: VIEW_W - PAD.right,
    };
  }, [curve, autoCashoutTarget]);

  const toneClass =
    phase === 'crashed'
      ? 'text-semantic-loss'
      : phase === 'cashed_out'
        ? 'text-semantic-win'
        : 'text-primary';
  const currentLabelBelow = chart.endY < PAD.top + 12;
  const currentLabelX = Math.max(PAD.left, Math.min(chart.plotRight, chart.endX));

  return (
    <div className={`${toneClass} ${className ?? 'relative'}`}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`Stepped position return chart, ${Math.max(curve.length - 1, 0)} ticks survived, current multiplier ${chart.current.toFixed(2)} times${autoCashoutTarget ? `, auto exit ${autoCashoutTarget.toFixed(2)} times` : ''}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {chart.gridValues.map((value) => {
          const y = chart.yScale(value);
          return (
            <line
              key={value}
              x1={PAD.left}
              x2={chart.plotRight}
              y1={y}
              y2={y}
              className="stroke-border-subtle opacity-55"
              strokeWidth={0.75}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <line
          x1={PAD.left}
          x2={chart.plotRight}
          y1={chart.baselineY}
          y2={chart.baselineY}
          className="stroke-border-prominent opacity-70"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />

        {chart.targetVisible && autoCashoutTarget ? (
          <line
            x1={PAD.left}
            x2={chart.plotRight}
            y1={chart.yScale(autoCashoutTarget)}
            y2={chart.yScale(autoCashoutTarget)}
            className="stroke-semantic-warning"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <path d={chart.areaPath} fill={`url(#${gradientId})`} />
        <path
          d={chart.stepPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={chart.endX}
          cy={chart.endY}
          r={1.65}
          fill="currentColor"
          className="stroke-prominent"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {chart.gridValues.map((value) => (
        <span
          key={value}
          aria-hidden
          className="pointer-events-none absolute right-1 -translate-y-1/2 rounded bg-prominent/80 px-1 font-display text-[9px] tabular-nums text-on-subtle"
          style={{ top: `${chart.yScale(value)}%` }}
        >
          {value.toFixed(2)}×
        </span>
      ))}

      <span
        aria-hidden
        className="pointer-events-none absolute left-[5%] -translate-y-full rounded bg-prominent/90 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-on-subtle"
        style={{ top: `${chart.baselineY - 1}%` }}
      >
        Entry 1.00×
      </span>

      {chart.targetVisible && autoCashoutTarget ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-[15%] -translate-y-full rounded bg-semantic-warning/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-semantic-warning"
          style={{ top: `${chart.yScale(autoCashoutTarget) - 1}%` }}
        >
          Target {autoCashoutTarget.toFixed(2)}×
        </span>
      ) : null}

      <span
        aria-hidden
        className="pointer-events-none absolute z-10 rounded-md border border-border-subtle bg-card px-1.5 py-0.5 font-display text-[10px] font-bold tabular-nums text-on-prominent shadow-sm"
        style={{
          left: `${currentLabelX}%`,
          top: `${chart.endY}%`,
          transform: `translate(-100%, ${currentLabelBelow ? '45%' : '-145%'})`,
        }}
      >
        {chart.current.toFixed(2)}×
      </span>

      {chart.xTickValues.map((tick) => (
        <span
          key={tick}
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 font-display text-[9px] tabular-nums text-on-subtle"
          style={{ left: `${chart.xScale(tick)}%`, bottom: '1%' }}
        >
          {tick}
        </span>
      ))}
      <span aria-hidden className="pointer-events-none absolute bottom-[1%] right-1 text-[8px] uppercase tracking-wide text-on-subtle">
        ticks
      </span>
    </div>
  );
}
