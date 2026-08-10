'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DigitExtraction } from '@/components/games/shared/digit-extraction';
import type { ParsedTick } from '@/types';
import type { DigitDeltaPhase, SettleCompare } from '@/hooks/use-digit-delta';
import type { DealerAction } from '@/lib/games/digit-delta';
import { cn } from '@/lib/utils';

interface DigitDeltaFaceProps {
  phase: DigitDeltaPhase;
  faceDigit: number | null;
  revealDigit: number | null;
  tableTick: ParsedTick | null;
  liveTick: ParsedTick | null;
  liveDigit: number | null;
  extractionKey: number;
  settleCompare: SettleCompare | null;
  playerDigits: number[];
  dealerDigits: number[];
  dealerChip: DealerAction | null;
  pLen: number;
  dLen: number;
}

function phaseLabel(phase: DigitDeltaPhase): string {
  switch (phase) {
    case 'need_draw':
      return 'Draw to start';
    case 'drawing':
      return 'Drawing…';
    case 'ready':
      return 'Face locked — collect or set stake';
    case 'player_decision':
      return 'Collect or Hold';
    case 'awaiting_player_tick':
      return 'Next tick settles your call';
    case 'awaiting_dealer_face':
      return 'Dealer face incoming';
    case 'awaiting_dealer_tick':
      return 'Dealer must draw';
    case 'settled':
      return 'Round over';
    default:
      return 'Digit Delta';
  }
}

export function DigitDeltaFace({
  phase,
  faceDigit,
  revealDigit,
  tableTick,
  liveTick,
  liveDigit,
  extractionKey,
  settleCompare,
  playerDigits,
  dealerDigits,
  dealerChip,
  pLen,
  dLen,
}: DigitDeltaFaceProps) {
  const displayDigit = revealDigit ?? faceDigit;
  const showDealer =
    dealerDigits.length > 0 ||
    phase === 'awaiting_dealer_face' ||
    phase === 'awaiting_dealer_tick';

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
            displayDigit !== null
              ? 'border-primary/40 bg-primary/10 text-on-prominent'
              : 'border-subtle bg-subtle/40 text-on-subtle',
          )}
        >
          {displayDigit ?? '—'}
        </motion.div>
      </AnimatePresence>

      {extractionTick ? (
        <DigitExtraction tick={extractionTick} triggerKey={extractionKey} />
      ) : liveDigit !== null ? (
        <p className="text-xs text-on-subtle tabular-nums">Live {liveDigit}</p>
      ) : null}

      {settleCompare ? (
        <p
          className={cn(
            'text-sm font-medium tabular-nums',
            settleCompare.won ? 'text-semantic-win' : 'text-semantic-loss',
          )}
        >
          {settleCompare.side === 'dealer' ? 'Dealer · ' : ''}
          {settleCompare.entryDigit} → {settleCompare.settlementDigit}
          {settleCompare.won ? ' · collect' : ' · bust'}
        </p>
      ) : null}

      <div className="flex w-full max-w-sm flex-col gap-3">
        <HandRow label="You" digits={playerDigits} length={pLen} tone="player" />
        {showDealer ? (
          <HandRow
            label="Dealer"
            digits={dealerDigits}
            length={dLen}
            tone="dealer"
            chip={dealerChip}
          />
        ) : null}
      </div>
    </div>
  );
}

function HandRow({
  label,
  digits,
  length,
  tone,
  chip,
}: {
  label: string;
  digits: number[];
  length: number;
  tone: 'player' | 'dealer';
  chip?: DealerAction | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-on-subtle">
        <span className="flex items-center gap-2">
          {label}
          {chip ? (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                chip === 'stand'
                  ? 'bg-subtle text-on-prominent'
                  : 'bg-primary/15 text-primary',
              )}
            >
              {chip === 'stand' ? 'Stand' : chip}
            </span>
          ) : null}
        </span>
        <span className="font-display tabular-nums text-on-prominent">
          len {length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {digits.length === 0 ? (
          <span className="text-xs text-on-subtle">—</span>
        ) : (
          digits.map((d, i) => (
            <span
              key={`${tone}-${i}-${d}`}
              className={cn(
                'flex size-8 items-center justify-center rounded-md font-display text-sm font-bold tabular-nums',
                tone === 'player'
                  ? 'bg-primary/15 text-on-prominent'
                  : 'bg-subtle text-on-prominent',
                i === digits.length - 1 && 'ring-1 ring-primary/50',
              )}
            >
              {d}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
