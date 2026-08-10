'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  winningSetHint,
  type DigitDeltaPick,
} from '@/lib/games/digit-delta';

interface DigitDeltaPickStripProps {
  higherOffered: boolean;
  lowerOffered: boolean;
  canPick: boolean;
  onTap: (pick: DigitDeltaPick) => void;
  faceDigit: number | null;
  /** ready = first call locks stake; collect = continue streak */
  mode?: 'start' | 'collect';
}

export function DigitDeltaPickStrip({
  higherOffered,
  lowerOffered,
  canPick,
  onTap,
  faceDigit,
  mode = 'collect',
}: DigitDeltaPickStripProps) {
  const cue = mode === 'start' ? 'Locks stake' : 'Collect';
  return (
    <div className="flex gap-2" role="group" aria-label="Pick Higher or Lower">
      <PickCard
        title="Higher"
        subtitle={
          higherOffered && faceDigit !== null
            ? `${cue} · ${winningSetHint('higher', faceDigit)}`
            : 'Not offered'
        }
        disabled={!canPick || !higherOffered}
        tone="higher"
        onSelect={() => onTap('higher')}
      />
      <PickCard
        title="Lower"
        subtitle={
          lowerOffered && faceDigit !== null
            ? `${cue} · ${winningSetHint('lower', faceDigit)}`
            : 'Not offered'
        }
        disabled={!canPick || !lowerOffered}
        tone="lower"
        onSelect={() => onTap('lower')}
      />
    </div>
  );
}

function PickCard({
  title,
  subtitle,
  disabled,
  tone,
  onSelect,
}: {
  title: string;
  subtitle: string;
  disabled: boolean;
  tone: 'higher' | 'lower';
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-colors',
        disabled
          ? 'cursor-not-allowed border-subtle bg-subtle/30 opacity-50'
          : tone === 'higher'
            ? 'border-semantic-win/40 bg-semantic-win/10 hover:bg-semantic-win/15'
            : 'border-semantic-loss/40 bg-semantic-loss/10 hover:bg-semantic-loss/15',
      )}
    >
      <span className="font-display text-lg font-bold text-on-prominent">
        {title}
      </span>
      <span className="text-[11px] text-on-subtle">{subtitle}</span>
    </motion.button>
  );
}
