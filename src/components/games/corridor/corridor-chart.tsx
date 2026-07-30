'use client';

import { useMemo, useRef, useState, useEffect, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  /** Idle interactive board */
  interactive?: boolean;
  canTrade?: boolean;
  multStay?: number;
  multGoes?: number;
  payoutStay?: number;
  payoutGoes?: number;
  onTap?: (pick: CorridorPick) => void;
  /** Running progress 0–1 */
  progress?: number | null;
  pick?: CorridorPick | null;
  className?: string;
}

const PAD = { top: 28, right: 56, bottom: 16, left: 12 };

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

function pct(px: number, total: number): string {
  if (total <= 0) return '0%';
  return `${(px / total) * 100}%`;
}

/** Full-bleed corridor board — path + spatial Inside/Outside tap zones. */
export function CorridorChart({
  path,
  visibleTick,
  previewPrices,
  upper,
  lower,
  entrySpot,
  barrierFlash = false,
  touched = null,
  interactive = false,
  canTrade = false,
  multStay = 1,
  multGoes = 1,
  payoutStay = 0,
  payoutGoes = 0,
  onTap,
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
  const showZones = interactive && !running;

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
      xScale,
      yScale,
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
      outsideTopH: Math.max(upperY - PAD.top, 0),
      outsideBotH: Math.max(H - PAD.bottom - lowerY, 0),
    };
  }, [path, running, visibleTick, previewPrices, upper, lower, entrySpot, W, H]);

  const flashSide = barrierFlash && touched ? SIDE_CLASS[touched] : null;

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', className)}>
      {progress !== null && progress !== undefined ? (
        <div
          className="absolute inset-x-0 top-0 z-30 h-1 bg-subtle/80"
          aria-hidden
        >
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
        className="pointer-events-none absolute inset-0"
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

        <rect
          x={chart.plotLeft}
          y={chart.upperY}
          width={chart.plotRight - chart.plotLeft}
          height={chart.corridorH}
          className="fill-primary opacity-[0.08]"
        />
        <rect
          x={chart.plotLeft}
          y={chart.plotTop}
          width={chart.plotRight - chart.plotLeft}
          height={chart.outsideTopH}
          className="fill-semantic-info opacity-[0.08]"
        />
        <rect
          x={chart.plotLeft}
          y={chart.lowerY}
          width={chart.plotRight - chart.plotLeft}
          height={chart.outsideBotH}
          className="fill-semantic-info opacity-[0.08]"
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
          className="fill-primary text-[10px] font-body font-semibold"
        >
          Upper
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
          className="fill-primary text-[10px] font-body font-semibold"
        >
          Lower
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
          <circle cx={chart.head.x} cy={chart.head.y} r={3.5} className="fill-on-prominent opacity-70" />
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

      {showZones ? (
        chart.corridorH >= 28 &&
        (chart.outsideTopH >= 20 || chart.outsideBotH >= 20) ? (
          <>
            {chart.outsideTopH >= 20 ? (
              <ZoneHit
                label="Outside"
                showLabel={chart.outsideTopH >= chart.outsideBotH}
                multiplier={multGoes}
                payout={payoutGoes}
                disabled={!canTrade}
                tone="outside"
                style={{
                  left: pct(chart.plotLeft, W),
                  width: pct(chart.plotRight - chart.plotLeft, W),
                  top: pct(chart.plotTop, H),
                  height: pct(chart.outsideTopH, H),
                }}
                onSelect={() => onTap?.('goes')}
              />
            ) : null}
            <ZoneHit
              label="Inside"
              showLabel
              multiplier={multStay}
              payout={payoutStay}
              disabled={!canTrade}
              tone="inside"
              style={{
                left: pct(chart.plotLeft, W),
                width: pct(chart.plotRight - chart.plotLeft, W),
                top: pct(chart.upperY, H),
                height: pct(chart.corridorH, H),
              }}
              onSelect={() => onTap?.('stay')}
            />
            {chart.outsideBotH >= 20 ? (
              <ZoneHit
                label="Outside"
                showLabel={chart.outsideBotH > chart.outsideTopH}
                multiplier={multGoes}
                payout={payoutGoes}
                disabled={!canTrade}
                tone="outside"
                style={{
                  left: pct(chart.plotLeft, W),
                  width: pct(chart.plotRight - chart.plotLeft, W),
                  top: pct(chart.lowerY, H),
                  height: pct(chart.outsideBotH, H),
                }}
                onSelect={() => onTap?.('goes')}
              />
            ) : null}
          </>
        ) : (
          <div className="absolute inset-x-3 bottom-3 z-10 flex gap-2">
            <FallbackChip
              label="Inside"
              multiplier={multStay}
              payout={payoutStay}
              disabled={!canTrade}
              tone="inside"
              onSelect={() => onTap?.('stay')}
            />
            <FallbackChip
              label="Outside"
              multiplier={multGoes}
              payout={payoutGoes}
              disabled={!canTrade}
              tone="outside"
              onSelect={() => onTap?.('goes')}
            />
          </div>
        )
      ) : null}

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

function ZoneHit({
  label,
  showLabel,
  multiplier,
  payout,
  disabled,
  tone,
  style,
  onSelect,
}: {
  label: string;
  showLabel: boolean;
  multiplier: number;
  payout: number;
  disabled: boolean;
  tone: 'inside' | 'outside';
  style: CSSProperties;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      animate={
        disabled
          ? { opacity: 0.45 }
          : { opacity: [0.88, 1, 0.88] }
      }
      transition={
        disabled
          ? { duration: 0.2 }
          : {
              duration: 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: tone === 'inside' ? 0 : 0.4,
            }
      }
      className={cn(
        'absolute z-10 flex min-h-[36px] flex-col items-center justify-center gap-0.5 rounded-lg px-2',
        'border border-transparent text-center backdrop-blur-[2px]',
        tone === 'inside'
          ? 'bg-primary/20 hover:bg-primary/30 hover:border-primary/40'
          : 'bg-semantic-info/20 hover:bg-semantic-info/30 hover:border-semantic-info/40',
        !disabled && 'cursor-pointer active:scale-[0.99]',
        disabled && 'cursor-not-allowed',
      )}
      style={style}
      aria-label={`${label}, ${multiplier.toFixed(2)} times`}
    >
      {showLabel ? (
        <>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              tone === 'inside' ? 'text-primary' : 'text-semantic-info',
            )}
          >
            {label}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={multiplier.toFixed(2)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="font-display text-xl font-bold tabular-nums text-on-prominent"
            >
              {multiplier.toFixed(2)}×
            </motion.span>
          </AnimatePresence>
          <span className="text-[10px] tabular-nums text-on-subtle">
            Pays {payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </>
      ) : (
        <span className="sr-only">
          {label} {multiplier.toFixed(2)}×
        </span>
      )}
    </motion.button>
  );
}

function FallbackChip({
  label,
  multiplier,
  payout,
  disabled,
  tone,
  onSelect,
}: {
  label: string;
  multiplier: number;
  payout: number;
  disabled: boolean;
  tone: 'inside' | 'outside';
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        'flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-2',
        'text-on-prominent-static-inverse',
        tone === 'inside' ? 'bg-primary' : 'bg-semantic-info',
        disabled && 'opacity-40',
      )}
      aria-label={`${label}, ${multiplier.toFixed(2)} times`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
        {label}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={multiplier.toFixed(2)}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          className="font-display text-lg font-bold tabular-nums"
        >
          {multiplier.toFixed(2)}×
        </motion.span>
      </AnimatePresence>
      <span className="text-[10px] tabular-nums opacity-80">
        Pays {payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </motion.button>
  );
}
