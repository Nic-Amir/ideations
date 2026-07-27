'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DIGIT_COUNT, DIGIT_SILKS } from '@/lib/games/digit-derby';

interface DigitPickGridProps {
  pick: number | null;
  multiplier: number;
  onSelectDigit: (digit: number) => void;
  disabled?: boolean;
  className?: string;
}

export function DigitPickGrid({
  pick,
  multiplier,
  onSelectDigit,
  disabled = false,
  className,
}: DigitPickGridProps) {
  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Pick a digit · first to finish
        </h2>
        <span className="font-display text-xs font-bold tabular-nums text-on-prominent">
          {multiplier.toFixed(2)}× all
        </span>
      </div>

      <div
        role="listbox"
        aria-label="Digit pick grid"
        className="grid flex-1 grid-cols-5 gap-2 content-center [@media(max-height:520px)]:gap-1.5"
      >
        {Array.from({ length: DIGIT_COUNT }, (_, digit) => {
          const isPicked = pick === digit;
          return (
            <motion.button
              key={digit}
              type="button"
              role="option"
              aria-selected={isPicked}
              disabled={disabled}
              whileTap={disabled ? undefined : { scale: 0.96 }}
              onClick={() => onSelectDigit(digit)}
              className={cn(
                'relative flex min-h-[62px] flex-col items-center justify-center rounded-xl border font-display tabular-nums transition-colors [@media(max-height:520px)]:min-h-[48px]',
                isPicked
                  ? 'border-primary bg-primary/10 text-on-prominent ring-2 ring-primary/40'
                  : 'border-border-subtle bg-subtle text-on-subtle hover:border-border-prominent hover:text-on-prominent',
                disabled && 'cursor-default opacity-60',
              )}
            >
              <span
                className="mb-1 h-2 w-2 rounded-full"
                style={{ backgroundColor: DIGIT_SILKS[digit] }}
                aria-hidden
              />
              <span className="text-2xl font-bold leading-none [@media(max-height:520px)]:text-xl">
                {digit}
              </span>
              {isPicked ? (
                <span className="absolute -top-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-on-prominent-static-inverse">
                  Pick
                </span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
