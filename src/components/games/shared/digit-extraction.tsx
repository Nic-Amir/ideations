'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedTick } from '@/types';

interface DigitExtractionProps {
  tick: ParsedTick | null;
  triggerKey: number;
}

export function DigitExtraction({ tick, triggerKey }: DigitExtractionProps) {
  if (!tick) return null;

  const digitStr = String(tick.lastDigit);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={triggerKey}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
        className="inline-flex items-center gap-1"
      >
        <span className="font-mono-game text-[10px] text-muted-foreground">
          digit
        </span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-foreground/10 font-mono-game text-xs font-bold text-foreground">
          {digitStr}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
