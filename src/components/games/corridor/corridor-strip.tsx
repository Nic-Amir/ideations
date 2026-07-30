'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  DURATION_OPTIONS,
  PICK_LABELS,
  type CorridorPath,
  type CorridorPick,
  type CorridorPricingView,
  type DurationTicks,
} from '@/lib/games/corridor';

interface CorridorStripProps {
  columnPricing: Record<DurationTicks, CorridorPricingView>;
  selectedTicks: DurationTicks;
  pick: CorridorPick | null;
  phase: 'idle' | 'running' | 'settled';
  canTrade: boolean;
  path: CorridorPath | null;
  visibleTick: number;
  previewPrices: number[];
  upper: number;
  lower: number;
  entrySpot: number;
  barrierFlash: boolean;
  stake: number;
  onTap: (pick: CorridorPick, ticks: DurationTicks) => void;
}

function priceY(
  price: number,
  upper: number,
  lower: number,
  height: number,
  pad = 16,
): number {
  const span = Math.max(upper - lower, 1e-9);
  const t = (upper - price) / span;
  return pad + t * (height - pad * 2);
}

/** Mini path ribbon drawn behind the tap columns. */
function PathRibbon({
  prices,
  upper,
  lower,
  barrierFlash,
  touched,
}: {
  prices: number[];
  upper: number;
  lower: number;
  barrierFlash: boolean;
  touched: 'upper' | 'lower' | null;
}) {
  const w = 320;
  const h = 160;
  if (prices.length < 2) return null;

  const xs = prices.map((_, i) => (i / Math.max(prices.length - 1, 1)) * w);
  const ys = prices.map((p) => priceY(p, upper, lower, h));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const yU = priceY(upper, upper, lower, h);
  const yL = priceY(lower, upper, lower, h);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x={0}
        y={yU}
        width={w}
        height={Math.max(yL - yU, 0)}
        className="fill-subtle/40"
      />
      <line
        x1={0}
        y1={yU}
        x2={w}
        y2={yU}
        className={cn(
          'stroke-semantic-win',
          barrierFlash && touched === 'upper' ? 'stroke-[2.5]' : 'stroke-[1.25] opacity-70',
        )}
        strokeDasharray="4 3"
      />
      <line
        x1={0}
        y1={yL}
        x2={w}
        y2={yL}
        className={cn(
          'stroke-semantic-loss',
          barrierFlash && touched === 'lower' ? 'stroke-[2.5]' : 'stroke-[1.25] opacity-70',
        )}
        strokeDasharray="4 3"
      />
      <path d={d} className="fill-none stroke-on-prominent stroke-[2]" />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r={3.5}
        className="fill-on-prominent"
      />
    </svg>
  );
}

function ZoneButton({
  pick,
  multiplier,
  payout,
  selected,
  disabled,
  idle,
  onSelect,
}: {
  pick: CorridorPick;
  multiplier: number;
  payout: number;
  selected: boolean;
  disabled: boolean;
  idle: boolean;
  onSelect: () => void;
}) {
  const meta = PICK_LABELS[pick];
  const isStay = pick === 'stay';

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={
        idle
          ? { opacity: [0.92, 1, 0.92] }
          : selected
            ? { scale: 1.02 }
            : { opacity: disabled && !selected ? 0.35 : 1 }
      }
      transition={
        idle
          ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: isStay ? 0 : 0.35 }
          : { duration: 0.2 }
      }
      className={cn(
        'flex min-h-[64px] w-full flex-col justify-between rounded-lg px-2.5 py-2 text-left',
        isStay ? 'bg-semantic-win' : 'bg-semantic-loss',
        'text-on-prominent-static-inverse',
        selected && 'ring-2 ring-border-prominent ring-offset-1 ring-offset-card',
      )}
      aria-label={`${meta.board}, ${multiplier.toFixed(2)} times`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-display text-sm font-bold leading-tight">{meta.board}</span>
        <span className="font-display text-base font-bold tabular-nums">
          {multiplier.toFixed(2)}×
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-1 pt-0.5">
        <span className="text-[10px] opacity-80">{meta.tag}</span>
        <span className="text-[10px] tabular-nums opacity-90">
          {payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
    </motion.button>
  );
}

/**
 * Arcade time-strip board: each duration is a column with Inside / Outside
 * tap targets carrying live multipliers. Path ribbon sits behind the columns.
 */
export function CorridorStrip({
  columnPricing,
  selectedTicks,
  pick,
  phase,
  canTrade,
  path,
  visibleTick,
  previewPrices,
  upper,
  lower,
  entrySpot,
  barrierFlash,
  stake,
  onTap,
}: CorridorStripProps) {
  const idle = phase === 'idle';
  const running = phase === 'running';

  const ribbonPrices = path
    ? path.prices.slice(0, Math.min(visibleTick, path.prices.length - 1) + 1)
    : previewPrices.length >= 2
      ? previewPrices
      : [entrySpot, entrySpot];

  return (
    <div className="relative flex h-full min-h-[240px] flex-col">
      <div className="relative min-h-[160px] flex-1 overflow-hidden">
        <PathRibbon
          prices={ribbonPrices}
          upper={upper}
          lower={lower}
          barrierFlash={barrierFlash}
          touched={path?.touched ?? null}
        />

        <div className="relative z-10 flex h-full gap-2 p-3 pt-8">
          {DURATION_OPTIONS.map((t) => {
            const view = columnPricing[t];
            const isActiveColumn = selectedTicks === t && (running || phase === 'settled');
            const columnDimmed = running && selectedTicks !== t;
            const stayPayout = Math.floor(stake * view.multStay);
            const goesPayout = Math.floor(stake * view.multGoes);

            return (
              <div
                key={t}
                className={cn(
                  'flex flex-1 flex-col gap-1.5 rounded-xl border border-border-subtle/80 bg-card/55 p-1.5 backdrop-blur-sm transition-opacity',
                  isActiveColumn && 'border-border-prominent bg-card/80',
                  columnDimmed && 'opacity-30',
                  idle && selectedTicks === t && 'border-border-prominent/60',
                )}
              >
                <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-on-subtle tabular-nums">
                  {t} ticks
                </p>
                <div className="flex flex-1 flex-col justify-center gap-1.5">
                  <ZoneButton
                    pick="stay"
                    multiplier={view.multStay}
                    payout={stayPayout}
                    selected={isActiveColumn && pick === 'stay'}
                    disabled={!idle || !canTrade}
                    idle={idle && canTrade}
                    onSelect={() => onTap('stay', t)}
                  />
                  <ZoneButton
                    pick="goes"
                    multiplier={view.multGoes}
                    payout={goesPayout}
                    selected={isActiveColumn && pick === 'goes'}
                    disabled={!idle || !canTrade}
                    idle={idle && canTrade}
                    onSelect={() => onTap('goes', t)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
