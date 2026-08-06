'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  winningSetHint,
  type DigitLadderPick,
  type DigitLadderSidePricing,
} from '@/lib/games/digit-ladder';

interface DigitLadderPickStripProps {
  higher: DigitLadderSidePricing;
  lower: DigitLadderSidePricing;
  potPreviewHigher: number;
  potPreviewLower: number;
  canPick: boolean;
  onTap: (pick: DigitLadderPick) => void;
  /** When true, labels emphasize continue (parlay) */
  continueMode?: boolean;
}

export function DigitLadderPickStrip({
  higher,
  lower,
  potPreviewHigher,
  potPreviewLower,
  canPick,
  onTap,
  continueMode = false,
}: DigitLadderPickStripProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Pick Higher or Lower">
      <PickCard
        title="Higher"
        subtitle={
          higher.offered
            ? `${winningSetHint('higher', higher.entryDigit)} · ${continueMode ? 'Climb' : 'Next tick'}`
            : 'Not offered'
        }
        multiplier={higher.multiplier}
        payout={potPreviewHigher}
        disabled={!canPick || !higher.offered}
        tone="higher"
        onSelect={() => onTap('higher')}
      />
      <PickCard
        title="Lower"
        subtitle={
          lower.offered
            ? `${winningSetHint('lower', lower.entryDigit)} · ${continueMode ? 'Climb' : 'Next tick'}`
            : 'Not offered'
        }
        multiplier={lower.multiplier}
        payout={potPreviewLower}
        disabled={!canPick || !lower.offered}
        tone="lower"
        onSelect={() => onTap('lower')}
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
  tone: 'higher' | 'lower';
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        'flex flex-1 flex-col items-start gap-1 rounded-lg border px-3 py-3 text-left transition-colors min-h-[88px]',
        tone === 'higher'
          ? 'border-primary/30 bg-primary/10'
          : 'border-border-subtle bg-subtle',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && 'hover:bg-secondary-hover',
      )}
    >
      <span className="font-display text-sm font-bold text-on-prominent">{title}</span>
      <span className="text-[11px] text-on-subtle leading-snug">{subtitle}</span>
      <span className="mt-auto font-display text-lg font-bold tabular-nums text-on-prominent">
        {multiplier > 0 ? `${multiplier.toFixed(2)}x` : '—'}
      </span>
      <span className="text-[10px] text-on-subtle tabular-nums">
        → {payout > 0 ? payout.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
      </span>
    </motion.button>
  );
}
