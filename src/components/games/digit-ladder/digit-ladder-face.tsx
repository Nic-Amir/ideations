'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DigitExtraction } from '@/components/games/shared/digit-extraction';
import type { ParsedTick } from '@/types';
import type { SettleCompare } from '@/hooks/use-digit-ladder';
import { cn } from '@/lib/utils';

interface DigitLadderFaceProps {
  phase:
    | 'need_draw'
    | 'drawing'
    | 'ready'
    | 'awaiting_tick'
    | 'decision'
    | 'settled';
  faceDigit: number | null;
  revealDigit: number | null;
  tableTick: ParsedTick | null;
  liveTick: ParsedTick | null;
  liveDigit: number | null;
  extractionKey: number;
  settleCompare: SettleCompare | null;
  rungTrail: number[];
  onDrawAgain?: () => void;
  canDrawAgain?: boolean;
}

function phaseLabel(phase: DigitLadderFaceProps['phase']): string {
  switch (phase) {
    case 'need_draw':
      return 'Draw a face digit';
    case 'drawing':
      return 'Drawing face…';
    case 'ready':
      return 'Face locked — call the next tick';
    case 'awaiting_tick':
      return 'Face digit';
    case 'decision':
      return 'Climb or cash out';
    case 'settled':
      return 'Round over';
    default:
      return 'Face';
  }
}

function compareCue(compare: SettleCompare): { label: string; tone: string } {
  if (compare.settlementDigit === compare.entryDigit) {
    return { label: 'Tie · bust', tone: 'text-semantic-loss' };
  }
  if (compare.won) {
    return {
      label: compare.pick === 'higher' ? 'Higher · win' : 'Lower · win',
      tone: 'text-semantic-win',
    };
  }
  return {
    label: compare.pick === 'higher' ? 'Not higher' : 'Not lower',
    tone: 'text-semantic-loss',
  };
}

export function DigitLadderFace({
  phase,
  faceDigit,
  revealDigit,
  tableTick,
  liveTick,
  liveDigit,
  extractionKey,
  settleCompare,
  rungTrail,
  onDrawAgain,
  canDrawAgain,
}: DigitLadderFaceProps) {
  const displayDigit = revealDigit ?? faceDigit;
  const showRevealGlow =
    revealDigit !== null &&
    (phase === 'ready' || phase === 'decision' || phase === 'awaiting_tick' || phase === 'settled');
  const extractionTick =
    settleCompare && liveTick && liveTick.lastDigit === settleCompare.settlementDigit
      ? liveTick
      : tableTick;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
      <p className="text-xs uppercase tracking-wide text-on-subtle">
        {phaseLabel(phase)}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={`face-${displayDigit ?? 'empty'}-${extractionKey}`}
          initial={{ scale: 0.85, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className={cn(
            'flex size-28 items-center justify-center rounded-full border-2 font-display text-6xl font-black tabular-nums',
            showRevealGlow
              ? 'border-primary bg-primary/15 text-primary'
              : phase === 'drawing'
                ? 'border-border-subtle bg-subtle text-on-subtle'
                : 'border-border-subtle bg-subtle text-on-prominent',
          )}
          aria-label={
            displayDigit !== null ? `Face digit ${displayDigit}` : 'No face digit'
          }
        >
          {phase === 'drawing' && displayDigit === null ? (
            <span className="text-3xl text-on-subtle">· · ·</span>
          ) : (
            (displayDigit ?? '—')
          )}
        </motion.div>
      </AnimatePresence>

      {extractionTick && (phase === 'ready' || phase === 'decision' || settleCompare) ? (
        <DigitExtraction tick={extractionTick} triggerKey={extractionKey} />
      ) : null}

      {settleCompare && (phase === 'decision' || phase === 'settled' || phase === 'awaiting_tick') ? (
        <div className="flex flex-col items-center gap-1">
          <p className="font-display text-sm tabular-nums text-on-prominent">
            <span>{settleCompare.entryDigit}</span>
            <span className="mx-2 text-on-subtle">→</span>
            <span>{settleCompare.settlementDigit}</span>
          </p>
          <p className={cn('text-xs font-semibold', compareCue(settleCompare).tone)}>
            {compareCue(settleCompare).label}
          </p>
        </div>
      ) : null}

      {rungTrail.length > 1 &&
      (phase === 'awaiting_tick' || phase === 'decision' || phase === 'settled') ? (
        <div
          className="flex flex-wrap items-center justify-center gap-1.5"
          aria-label="Ladder trail"
        >
          {rungTrail.map((d, i) => (
            <span key={`${d}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? (
                <span className="text-on-subtle text-xs" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  'inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-display text-sm font-bold tabular-nums',
                  i === rungTrail.length - 1
                    ? 'bg-primary/15 text-primary'
                    : 'bg-subtle text-on-prominent',
                )}
              >
                {d}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {phase === 'ready' || phase === 'need_draw' || phase === 'drawing' || phase === 'decision' ? (
        <div className="flex items-center gap-2 text-xs text-on-subtle">
          <span className="uppercase tracking-wide">Live</span>
          <span
            className={cn(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-subtle font-display text-sm font-bold tabular-nums text-on-prominent',
              liveDigit === null && 'text-on-subtle',
            )}
          >
            {liveDigit ?? '—'}
          </span>
          {liveTick?.quote ? (
            <span className="tabular-nums opacity-80">{liveTick.quote}</span>
          ) : null}
        </div>
      ) : null}

      {phase === 'ready' && canDrawAgain && onDrawAgain ? (
        <button
          type="button"
          onClick={onDrawAgain}
          className="text-xs font-semibold text-primary underline-offset-2 hover:underline min-h-[44px] px-3"
        >
          Draw again
        </button>
      ) : null}

      {phase === 'decision' ? (
        <p className="text-sm text-on-subtle text-center max-w-[280px]">
          Pot is at risk on the next rung. Cash out to bank it, or call Higher /
          Lower again.
        </p>
      ) : phase === 'ready' ? (
        <p className="text-sm text-on-subtle text-center max-w-[280px]">
          Face is locked. Set your stake, then call whether the next tick is
          higher or lower.
        </p>
      ) : phase === 'need_draw' ? (
        <p className="text-sm text-on-subtle text-center max-w-[280px]">
          Draw a free face digit from the next tick, then bet Higher or Lower.
        </p>
      ) : null}
    </div>
  );
}
