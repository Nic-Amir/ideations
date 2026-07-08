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

/** SVG rising multiplier curve for the current position. */
export function AscentCurve({ curve, phase, className }: AscentCurveProps) {
  const { linePath, areaPath, endX, endY } = useMemo(() => {
    if (curve.length < 2) {
      return { linePath: '', areaPath: '', endX: PAD, endY: VIEW_H - PAD };
    }

    const maxMult = Math.max(...curve, 1.1);
    const minMult = 1;
    const range = maxMult - minMult;

    const xScale = (i: number) => PAD + (i / (curve.length - 1)) * (VIEW_W - 2 * PAD);
    const yScale = (m: number) =>
      VIEW_H - PAD - ((m - minMult) / range) * (VIEW_H - 2 * PAD);

    const points = curve.map((m, i) => [xScale(i), yScale(m)] as const);
    const line = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');
    const [lastX, lastY] = points[points.length - 1];
    const area = `${line} L${lastX.toFixed(2)},${VIEW_H - PAD} L${PAD},${VIEW_H - PAD} Z`;

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
          <motion.circle
            cx={endX}
            cy={endY}
            r={2.2}
            fill="currentColor"
            animate={phase === 'flying' ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={
              phase === 'flying' ? { duration: 1, repeat: Infinity } : undefined
            }
          />
        ) : null}
      </svg>
    </div>
  );
}
