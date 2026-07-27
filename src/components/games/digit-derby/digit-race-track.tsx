'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  DIGIT_COUNT,
  DIGIT_SILKS,
  progressTowardFinish,
  type DigitCounts,
} from '@/lib/games/digit-derby';

const START_X = 0.04;
const FINISH_X = 0.94;

interface DigitRaceTrackProps {
  counts: DigitCounts;
  finishCount: number;
  finishOrder: number[];
  lockedPick: number | null;
  lastAdvancedDigit: number | null;
  winningDigit: number | null;
  finished: boolean;
  inFinalStretch: boolean;
  className?: string;
}

export function DigitLeaderboardStrip({
  finishOrder,
  counts,
  pick,
  statusLabel,
}: {
  finishOrder: number[];
  counts: DigitCounts;
  pick: number | null;
  statusLabel: string;
}) {
  const leaders = finishOrder.slice(0, 3);

  return (
    <div className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto py-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
        {statusLabel}
      </span>
      {leaders.map((digit, position) => {
        const isPick = pick === digit;
        return (
          <span
            key={digit}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums',
              isPick
                ? 'border-border-prominent bg-primary/10 text-on-prominent'
                : 'border-border-subtle bg-subtle text-on-subtle',
            )}
          >
            <span className="font-bold text-on-prominent">#{position + 1}</span>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: DIGIT_SILKS[digit] }}
            />
            <span>{digit}</span>
            <span className="text-on-subtle">{counts[digit]}</span>
          </span>
        );
      })}
      {pick !== null && !leaders.includes(pick) ? (
        <>
          <span className="ml-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Your pick
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-prominent bg-primary/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-on-prominent">
            <span className="font-bold">#{finishOrder.indexOf(pick) + 1}</span>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: DIGIT_SILKS[pick] }}
            />
            <span>{pick}</span>
            <span className="text-on-subtle">{counts[pick]}</span>
          </span>
        </>
      ) : null}
    </div>
  );
}

export function DigitRaceTrack({
  counts,
  finishCount,
  finishOrder,
  lockedPick,
  lastAdvancedDigit,
  winningDigit,
  finished,
  inFinalStretch,
  className,
}: DigitRaceTrackProps) {
  const leader = finishOrder[0];
  const rankOf = new Map(finishOrder.map((digit, position) => [digit, position]));
  const leadCount = Math.max(0, ...counts);
  const toGo = Math.max(0, finishCount - leadCount);

  return (
    <div className={cn('relative flex h-full w-full flex-col', className)}>
      <p className="shrink-0 border-b border-border-subtle px-3 py-1.5 text-center text-[11px] text-on-subtle">
        {finished && winningDigit !== null ? (
          <>
            <span className="font-semibold text-on-prominent">Digit {winningDigit}</span>
            {' takes the finish'}
          </>
        ) : (
          <>
            Digit <span className="font-semibold text-on-prominent">{leader}</span> leads
            {toGo > 0 ? ` · ${toGo} to go` : ' · photo finish'}
            {lockedPick !== null ? (
              <span className="text-on-subtle">
                {' — your pick '}
                <span className="font-semibold text-on-prominent">{lockedPick}</span>
              </span>
            ) : null}
          </>
        )}
      </p>

      <div
        className={cn(
          'relative flex-1 min-h-0',
          inFinalStretch && !finished && 'bg-semantic-warning/5',
        )}
      >
        <div
          className={cn(
            'absolute inset-y-0 w-0.5 border-r-2 border-dashed border-border-prominent opacity-50',
            inFinalStretch && 'opacity-100',
            finished && 'opacity-90 border-solid',
          )}
          style={{ left: `${FINISH_X * 100}%` }}
          aria-hidden
        />

        <div className="flex h-full flex-col">
          {Array.from({ length: DIGIT_COUNT }, (_, digit) => {
            const isPicked = lockedPick === digit;
            const rank = rankOf.get(digit) ?? digit;
            const isLeader = digit === leader;
            const isAdvanced = lastAdvancedDigit === digit;
            const isWinner = winningDigit === digit;
            const progress =
              START_X +
              progressTowardFinish(counts[digit], finishCount) * (FINISH_X - START_X);

            return (
              <div
                key={digit}
                className={cn(
                  'relative flex-1 min-h-0 border-b border-border-subtle/40 last:border-b-0',
                  isPicked && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                  isAdvanced && 'bg-semantic-warning/10',
                )}
              >
                <div
                  className="absolute top-1/2 h-5 w-5 -translate-y-1/2"
                  style={{
                    left: `${progress * 100}%`,
                    transition: 'left 200ms linear',
                  }}
                >
                  <motion.span
                    animate={
                      isWinner
                        ? { scale: [1, 1.35, 1] }
                        : isAdvanced
                          ? { scale: [1, 1.2, 1] }
                          : { scale: 1 }
                    }
                    transition={{ duration: 0.35 }}
                    className={cn(
                      'relative flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-black/80',
                      isPicked && 'ring-2 ring-border-prominent',
                      isLeader && !finished && 'animate-pulse',
                    )}
                    style={{ backgroundColor: DIGIT_SILKS[digit] }}
                    aria-label={`Digit ${digit}, rank ${rank + 1}, ${counts[digit]} of ${finishCount}`}
                  >
                    {digit}
                    {isWinner ? (
                      <span className="absolute inset-0 animate-ping rounded-md bg-semantic-win/40" />
                    ) : null}
                  </motion.span>
                  <span
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums',
                      progress > 0.72 ? 'right-full mr-1' : 'left-full ml-1',
                      isPicked ? 'text-on-prominent' : 'text-on-subtle',
                    )}
                  >
                    {rank + 1} · {counts[digit]}/{finishCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
