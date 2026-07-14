'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { IndexAscentState } from '@/types';

interface AscentCurveProps {
  curve: number[];
  phase: IndexAscentState;
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 56;
const PAD = 4;
const VISIBLE_TICKS = 24;

/** SVG rising multiplier curve for the current position. */
export function AscentCurve({ curve, phase, className }: AscentCurveProps) {
  const { linePath, areaPath, endX, endY } = useMemo(() => {
    if (curve.length < 2) {
      return { linePath: '', areaPath: '', endX: PAD, endY: VIEW_H - PAD };
    }

    const visibleCurve = curve.slice(-VISIBLE_TICKS);
    const maxMult = Math.max(...visibleCurve, 1.25);
    const minMult = 1;
    const range = Math.max(maxMult - minMult, 0.25);

    const xScale = (i: number) =>
      PAD + (i / (VISIBLE_TICKS - 1)) * (VIEW_W - 2 * PAD);
    const yScale = (m: number) =>
      VIEW_H - PAD - ((m - minMult) / range) * (VIEW_H - 2 * PAD);

    const points = visibleCurve.map((m, i) => [xScale(i), yScale(m)] as const);
    const line = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');
    const [lastX, lastY] = points[points.length - 1];
    const baselineY = yScale(1);
    const area = `${line} L${lastX.toFixed(2)},${baselineY.toFixed(2)} L${PAD},${baselineY.toFixed(2)} Z`;

    return { linePath: line, areaPath: area, endX: lastX, endY: lastY };
  }, [curve]);

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
        aria-hidden
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={`h-${ratio}`}
            x1={PAD}
            x2={VIEW_W - PAD}
            y1={PAD + ratio * (VIEW_H - 2 * PAD)}
            y2={PAD + ratio * (VIEW_H - 2 * PAD)}
            className="stroke-border-subtle"
            strokeWidth={0.75}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {[6, 12, 18].map((tick) => {
          const x = PAD + (tick / (VISIBLE_TICKS - 1)) * (VIEW_W - 2 * PAD);
          return (
            <line
              key={`v-${tick}`}
              x1={x}
              x2={x}
              y1={PAD}
              y2={VIEW_H - PAD}
              className="stroke-border-subtle"
              strokeWidth={0.75}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {areaPath ? <path d={areaPath} fill="currentColor" opacity={0.12} /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {curve.length >= 2 ? (
          <>
            <motion.circle
              cx={endX}
              cy={endY}
              r={4}
              fill="currentColor"
              opacity={0.14}
              animate={phase === 'flying' ? { r: [3.5, 5, 3.5] } : { r: 3.5 }}
              transition={
                phase === 'flying' ? { duration: 1.2, repeat: Infinity } : undefined
              }
            />
            <circle
              cx={endX}
              cy={endY}
              r={1.8}
              fill="currentColor"
              className="stroke-prominent"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}
