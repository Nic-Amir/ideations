'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { IndexAscentState } from '@/types';

interface AscentCurveProps {
  curve: number[];
  phase: IndexAscentState;
  autoCashoutTarget?: number | null;
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 56;
const PAD = { top: 5, right: 18, bottom: 6, left: 5 };
const MIN_VISIBLE_TICKS = 6;
const MIN_MULTIPLIER_RANGE = 0.1;

/** Full-history SVG return chart for the current Index Ascent position. */
export function AscentCurve({
  curve,
  phase,
  autoCashoutTarget = null,
  className,
}: AscentCurveProps) {
  const chart = useMemo(() => {
    const values = curve.length > 0 ? curve : [1];
    const revealedTicks = Math.max(values.length - 1, 0);
    const xDomain = Math.max(revealedTicks, MIN_VISIBLE_TICKS);
    const observedMax = Math.max(...values, 1);
    const range = Math.max(observedMax - 1, MIN_MULTIPLIER_RANGE);
    const yMin = 1;
    const yMax = 1 + range * 1.12;
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const xScale = (index: number) => PAD.left + (index / xDomain) * plotW;
    const yScale = (value: number) =>
      PAD.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
    const points = values.map((value, index) => [xScale(index), yScale(value)] as const);
    const linePath = points
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');
    const [endX, endY] = points[points.length - 1];
    const baselineY = yScale(1);
    const areaPath = `${linePath} L${endX.toFixed(2)},${baselineY.toFixed(2)} L${PAD.left},${baselineY.toFixed(2)} Z`;
    const gridValues = [0.25, 0.5, 0.75].map((ratio) => yMin + ratio * (yMax - yMin));
    const targetVisible =
      autoCashoutTarget !== null &&
      autoCashoutTarget > 1 &&
      autoCashoutTarget <= yMax;
    const current = values[values.length - 1];

    return {
      linePath,
      areaPath,
      endX,
      endY,
      baselineY,
      gridValues,
      yScale,
      yMax,
      targetVisible,
      current,
      currentLabelY: Math.max(PAD.top + 3, Math.min(VIEW_H - PAD.bottom - 1, endY)),
      plotRight: VIEW_W - PAD.right,
    };
  }, [curve, autoCashoutTarget]);

  const toneClass =
    phase === 'crashed'
      ? 'text-semantic-loss'
      : phase === 'cashed_out'
        ? 'text-semantic-win'
        : 'text-primary';

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className={`h-full w-full ${toneClass}`}
        role="img"
        aria-label={`Position return chart, current multiplier ${chart.current.toFixed(2)} times${autoCashoutTarget ? `, auto exit ${autoCashoutTarget.toFixed(2)} times` : ''}`}
      >
        {chart.gridValues.map((value) => {
          const y = chart.yScale(value);
          return (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={chart.plotRight}
                y1={y}
                y2={y}
                className="stroke-border-subtle opacity-60"
                strokeWidth={0.75}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={chart.plotRight + 1.5}
                y={y + 1}
                className="fill-on-subtle text-[3px] font-body tabular-nums"
              >
                {value.toFixed(2)}×
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={chart.plotRight}
          y1={chart.baselineY}
          y2={chart.baselineY}
          className="stroke-border-prominent opacity-80"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={chart.plotRight + 1.5}
          y={chart.baselineY - 1}
          className="fill-on-subtle text-[3px] font-body tabular-nums"
        >
          Entry 1.00×
        </text>

        {chart.targetVisible && autoCashoutTarget ? (
          <>
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
            <text
              x={chart.plotRight + 1.5}
              y={chart.yScale(autoCashoutTarget) - 1}
              className="fill-semantic-warning text-[3px] font-body font-semibold tabular-nums"
            >
              Target {autoCashoutTarget.toFixed(2)}×
            </text>
          </>
        ) : null}

        <path d={chart.areaPath} fill="currentColor" opacity={0.12} />
        <path
          d={chart.linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        <motion.circle
          cx={chart.endX}
          cy={chart.endY}
          r={4}
          fill="currentColor"
          opacity={0.14}
          animate={phase === 'flying' ? { r: [3.5, 5, 3.5] } : { r: 3.5 }}
          transition={phase === 'flying' ? { duration: 1.2, repeat: Infinity } : undefined}
        />
        <circle
          cx={chart.endX}
          cy={chart.endY}
          r={1.8}
          fill="currentColor"
          className="stroke-prominent"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={Math.min(chart.endX + 2.5, chart.plotRight - 9)}
          y={chart.currentLabelY - 2}
          className="fill-on-prominent text-[3.4px] font-body font-bold tabular-nums"
        >
          {chart.current.toFixed(2)}×
        </text>
      </svg>
    </div>
  );
}
