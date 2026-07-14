'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { RaceCard, RacePath } from '@/lib/games/derby';

interface DerbyChartProps {
  card: RaceCard;
  path: RacePath;
  visibleTick: number;
  /** Horse indices the player bet on (highlighted lines). */
  pickedHorses: number[];
  /** Horse indices ranked 1st → 16th at the visible tick. */
  liveRanks: number[];
  finished: boolean;
  className?: string;
}

const PAD = { top: 18, right: 98, bottom: 18, left: 16 };
const MIN_VISIBLE_TICKS = 6;
const MIN_HALF_RANGE = 3;

function buildLineD(
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
 * The trading view of the race: all 16 synthetic price paths revealed tick
 * by tick. Picked horses ride on top in full color; the rest form a dimmed
 * field so the market context stays visible.
 */
export function DerbyChart({
  card,
  path,
  visibleTick,
  pickedHorses,
  liveRanks,
  finished,
  className,
}: DerbyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 260 });

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
  const totalTicks = card.ticks;
  const s0 = path.prices[0][0];

  const chart = useMemo(() => {
    const revealed = Math.min(visibleTick, totalTicks);

    // Y-axis spans every revealed price across the whole field, plus the
    // start line, so lines never clip as the race spreads out.
    let yMin = s0 - MIN_HALF_RANGE;
    let yMax = s0 + MIN_HALF_RANGE;
    for (const series of path.prices) {
      for (let t = 0; t <= revealed; t++) {
        if (series[t] < yMin) yMin = series[t];
        if (series[t] > yMax) yMax = series[t];
      }
    }
    const margin = Math.max((yMax - yMin) * 0.08, 1e-9);
    yMin -= margin;
    yMax += margin;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const visibleDomain = Math.max(revealed, MIN_VISIBLE_TICKS);
    const xScale = (i: number) => PAD.left + (i / visibleDomain) * plotW;
    const yScale = (p: number) =>
      PAD.top + plotH - ((p - yMin) / (yMax - yMin)) * plotH;

    const lines = card.horses.map((h) => ({
      horse: h,
      d: buildLineD(path.prices[h.index], revealed, xScale, yScale),
      headX: xScale(revealed),
      headY: yScale(path.prices[h.index][revealed]),
      headPrice: path.prices[h.index][revealed],
    }));

    return {
      lines,
      revealed,
      entryY: yScale(s0),
      finishX: xScale(totalTicks),
      plotTop: PAD.top,
      plotBottom: H - PAD.bottom,
      plotLeft: PAD.left,
      plotRight: W - PAD.right,
    };
  }, [card, path, visibleTick, totalTicks, s0, W, H]);

  const leader = liveRanks[0];
  const pickedSet = useMemo(() => new Set(pickedHorses), [pickedHorses]);

  // Right-edge price labels: picked horses plus the leader, de-overlapped by
  // simple vertical push so tags never sit on top of each other.
  const labels = useMemo(() => {
    const targets = [...new Set([...pickedHorses, leader])];
    const raw = targets
      .map((h) => ({
        horse: h,
        y: chart.lines[h].headY,
        price: chart.lines[h].headPrice,
        isLeader: h === leader,
        isPicked: pickedSet.has(h),
      }))
      .sort((a, b) => a.y - b.y);
    const MIN_GAP = 20;
    const minY = chart.plotTop + 6;
    const maxY = chart.plotBottom - 14;
    for (const label of raw) label.y = Math.max(minY, Math.min(maxY, label.y));
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].y - raw[i - 1].y < MIN_GAP) raw[i].y = raw[i - 1].y + MIN_GAP;
    }
    if (raw.length > 0 && raw[raw.length - 1].y > maxY) {
      raw[raw.length - 1].y = maxY;
      for (let i = raw.length - 2; i >= 0; i--) {
        raw[i].y = Math.min(raw[i].y, raw[i + 1].y - MIN_GAP);
      }
    }
    return raw;
  }, [pickedHorses, leader, chart.lines, chart.plotTop, chart.plotBottom, pickedSet]);

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Race price chart"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={chart.plotLeft}
            y1={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            x2={chart.plotRight}
            y2={chart.plotTop + ratio * (chart.plotBottom - chart.plotTop)}
            className="stroke-border-subtle opacity-50"
            strokeWidth={0.75}
            strokeDasharray="2 5"
          />
        ))}
        {/* Start line at 100 */}
        <line
          x1={chart.plotLeft}
          y1={chart.entryY}
          x2={chart.plotRight}
          y2={chart.entryY}
          className="stroke-border-subtle"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={chart.plotRight + 4}
          y={chart.entryY + 3}
          className="fill-on-subtle text-[9px] font-body tabular-nums"
        >
          {s0.toFixed(0)}
        </text>

        {/* Finish line */}
        {finished ? (
          <line
            x1={chart.finishX}
            y1={chart.plotTop}
            x2={chart.finishX}
            y2={chart.plotBottom}
            className="stroke-border-prominent opacity-90"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {/* Field: unpicked horses dimmed under the picked lines */}
        {chart.lines
          .filter((l) => !pickedSet.has(l.horse.index))
          .map((l) => (
            <path
              key={l.horse.index}
              d={l.d}
              fill="none"
              stroke={l.horse.silks}
              strokeWidth={liveRanks.slice(0, 3).includes(l.horse.index) ? 1.5 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={liveRanks.slice(0, 3).includes(l.horse.index) ? 0.48 : 0.12}
            />
          ))}

        {/* Picked horses on top, full color */}
        {chart.lines
          .filter((l) => pickedSet.has(l.horse.index))
          .map((l) => (
            <path
              key={l.horse.index}
              d={l.d}
              fill="none"
              stroke={l.horse.silks}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* Head markers for picked horses and the leader */}
        {labels.map((l) => (
          <circle
            key={`head-${l.horse}`}
            cx={chart.lines[l.horse].headX}
            cy={chart.lines[l.horse].headY}
            r={l.isPicked ? 4 : 3}
            fill={card.horses[l.horse].silks}
            className={cn('stroke-card', l.isLeader && !finished && 'animate-pulse')}
            strokeWidth={1.5}
          />
        ))}

        {/* Right-edge live price tags */}
        {labels.map((l) => (
          <g key={`label-${l.horse}`}>
            <text
              x={chart.plotRight + 6}
              y={l.y + 3}
              className="text-[9px] font-body font-semibold tabular-nums"
              fill={card.horses[l.horse].silks}
            >
              {card.horses[l.horse].name.length > 9
                ? `${card.horses[l.horse].name.slice(0, 8)}…`
                : card.horses[l.horse].name}
            </text>
            <text
              x={chart.plotRight + 6}
              y={l.y + 13}
              className="fill-on-subtle text-[9px] font-body tabular-nums"
            >
              {l.price.toFixed(2)}
              {l.isLeader ? ' · 1st' : ''}
            </text>
          </g>
        ))}

      </svg>
    </div>
  );
}
