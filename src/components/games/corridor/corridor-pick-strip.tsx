'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CorridorPick } from '@/lib/games/corridor';

interface CorridorPickStripProps {
  multStay: number;
  multGoes: number;
  payoutStay: number;
  payoutGoes: number;
  canTrade: boolean;
  onTap: (pick: CorridorPick) => void;
}

/**
 * Equal product sides — not mapped to chart Y.
 * Outside = touch either barrier (up or down), not “the bottom zone”.
 */
export function CorridorPickStrip({
  multStay,
  multGoes,
  payoutStay,
  payoutGoes,
  canTrade,
  onTap,
}: CorridorPickStripProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Pick Inside or Outside">
      <PickCard
        title="Inside"
        subtitle="Stay between barriers"
        multiplier={multStay}
        payout={payoutStay}
        disabled={!canTrade}
        tone="inside"
        onSelect={() => onTap('stay')}
      />
      <PickCard
        title="Outside"
        subtitle="Touch either barrier"
        multiplier={multGoes}
        payout={payoutGoes}
        disabled={!canTrade}
        tone="outside"
        onSelect={() => onTap('goes')}
      />
    </div>
  );
}

function PickCard({
  title,
  subtitle,
  multiplier,
  payout,
  disabled,
  tone,
  onSelect,
}: {
  title: string;
  subtitle: string;
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
      animate={
        disabled
          ? { opacity: 0.4 }
          : { y: [0, -2, 0] }
      }
      transition={
        disabled
          ? { duration: 0.2 }
          : {
              duration: 2.6,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: tone === 'inside' ? 0 : 0.35,
            }
      }
      className={cn(
        'flex min-h-[88px] flex-1 flex-col items-stretch justify-between rounded-xl px-3 py-3 text-left',
        'text-on-prominent-static-inverse',
        tone === 'inside' ? 'bg-primary' : 'bg-semantic-info',
        !disabled && 'active:scale-[0.98]',
      )}
      aria-label={`${title}: ${subtitle}, ${multiplier.toFixed(2)} times`}
    >
      <div>
        <p className="font-display text-base font-bold leading-tight">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug opacity-85">{subtitle}</p>
      </div>
      <div className="flex items-baseline justify-between gap-2 pt-2">
        <AnimatePresence mode="wait">
          <motion.span
            key={multiplier.toFixed(2)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="font-display text-2xl font-bold tabular-nums"
          >
            {multiplier.toFixed(2)}×
          </motion.span>
        </AnimatePresence>
        <span className="text-[11px] tabular-nums opacity-90">
          Pays {payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
    </motion.button>
  );
}
