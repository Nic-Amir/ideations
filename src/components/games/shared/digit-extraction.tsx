'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedTick } from '@/types';

interface DigitExtractionProps {
  tick: ParsedTick | null;
  triggerKey: number;
}

export function DigitExtraction({ tick, triggerKey }: DigitExtractionProps) {
  if (!tick) return null;

  const quoteStr = tick.numericQuote.toFixed(tick.pip_size ?? 2);
  const digitStr = String(tick.lastDigit);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={triggerKey}
        initial={{ opacity: 0, x: 4 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -4 }}
        transition={{ duration: 0.15 }}
        className="inline-flex items-center gap-1.5 font-display tabular-nums"
      >
        <span className="text-xs text-on-prominent">{quoteStr}</span>
        <span className="text-xs text-on-subtle">&rarr;</span>
        <motion.span
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, type: 'spring', stiffness: 300 }}
          className="inline-flex h-5 w-5 items-center justify-center rounded bg-semantic-warning/10 text-xs font-bold text-semantic-warning"
        >
          {digitStr}
        </motion.span>
      </motion.div>
    </AnimatePresence>
  );
}
