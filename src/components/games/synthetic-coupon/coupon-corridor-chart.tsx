'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CouponCorridorChartProps {
  prices: number[];
  upper: number;
  lower: number;
  entrySpot: number;
  flying: boolean;
  barrierFlash?: boolean;
  breachSide?: 'upper' | 'lower' | null;
  /** Max points drawn (sliding window). */
  windowSize?: number;
  className?: string;
}

const PAD = { top: 24, right: 60, bottom: 16, left: 12 };
const DEFAULT_WINDOW = 64;

function buildPathD(
  prices: number[],
  xScale: (i: number) => number,
  yScale: (p: number) => number,
): string {
  if (prices.length < 1) return '';
  let d = `M ${xScale(0)} ${yScale(prices[0])}`;
  for (let i = 1; i < prices.length; i++) {
    d += ` L ${xScale(i)} ${yScale(prices[i])}`;
  }
  return d;
}

export function CouponCorridorChart({
  prices,
  upper,
  lower,
  entrySpot,
  flying,
  barrierFlash = false,
  breachSide = null,
  windowSize = DEFAULT_WINDOW,
  className,
}: CouponCorridorChartProps) {
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
    const drawn =
      prices.length > windowSize ? prices.slice(prices.length - windowSize) : prices;
    const last = Math.max(drawn.length - 1, 0);
    const maxTick = Math.max(last, 24);
    const allPrices = [...drawn, upper, lower, entrySpot];
    const span = Math.max(...allPrices) - Math.min(...allPrices);
    const margin = Math.max(span * 0.18, 1e-9);
    const yMin = Math.min(...allPrices) - margin;
    const yMax = Math.max(...allPrices) + margin;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xScale = (i: number) => PAD.left + (i / Math.max(maxTick, 1)) * plotW;
    const yScale = (p: number) =>
      PAD.top + plotH - ((p - yMin) / (yMax - yMin)) * plotH;
    const headPrice = drawn[last] ?? entrySpot;

    return {
      upperY: yScale(upper),
      lowerY: yScale(lower),
      entryY: yScale(entrySpot),
      pathD: buildPathD(drawn, xScale, yScale),
      head: { x: xScale(last), y: yScale(headPrice) },
      headPrice,
      plotTop: PAD.top,
      plotBottom: H - PAD.bottom,
      plotLeft: PAD.left,
      plotRight: W - PAD.right,
    };
  }, [prices, upper, lower, entrySpot, W, H, windowSize]);

  const flashClass = barrierFlash ? 'fill-semantic-loss' : null;

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Synthetic coupon corridor chart"
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

        {flashClass ? (
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            className={cn(flashClass, 'opacity-10 animate-pulse')}
          />
        ) : null}

        <rect
          x={chart.plotLeft}
          y={chart.upperY}
          width={chart.plotRight - chart.plotLeft}
          height={Math.max(chart.lowerY - chart.upperY, 0)}
          className="fill-primary opacity-5"
        />

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
          className={cn('stroke-semantic-loss', !flying && 'opacity-70')}
          strokeWidth={barrierFlash && breachSide === 'upper' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.upperY + 3}
          className="fill-semantic-loss text-[10px] font-body font-semibold"
        >
          Upper
        </text>

        <line
          x1={chart.plotLeft}
          y1={chart.lowerY}
          x2={chart.plotRight}
          y2={chart.lowerY}
          className={cn('stroke-semantic-loss', !flying && 'opacity-70')}
          strokeWidth={barrierFlash && breachSide === 'lower' ? 3 : 1.5}
          strokeDasharray="6 3"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.lowerY + 3}
          className="fill-semantic-loss text-[10px] font-body font-semibold"
        >
          Lower
        </text>

        {chart.pathD ? (
          <path
            d={chart.pathD}
            fill="none"
            className={cn('stroke-primary', !flying && 'opacity-60')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        <circle
          cx={chart.head.x}
          cy={chart.head.y}
          r={flying ? 5 : 4}
          className="fill-primary stroke-prominent"
          strokeWidth={1.5}
        />

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
