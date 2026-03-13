'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedTick } from '@/types';

interface DigitExtractionProps {
  tick: ParsedTick | null;
  triggerKey: number;
}

export function DigitExtraction({ tick, triggerKey }: DigitExtractionProps) {
  if (!tick) return null;

  const quoteStr = tick.numericQuote.toFixed(2);
  const digitStr = String(tick.lastDigit);
  const prefix = quoteStr.slice(0, -1);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={triggerKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center gap-1 py-2"
      >
        <span className="font-mono-game text-sm text-muted-foreground">
          {prefix}
        </span>
        <motion.span
          initial={{ scale: 1.8, color: '#FF6B35' }}
          animate={{ scale: 1, color: '#00D4AA' }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 font-mono-game text-lg font-bold"
        >
          {digitStr}
        </motion.span>
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="ml-2 text-xs text-muted-foreground"
        >
          digit extracted
        </motion.span>
      </motion.div>
    </AnimatePresence>
  );
}
