'use client';

import { cn } from '@/lib/utils';
import {
  DIGIT_COUNT,
  progressTowardFinish,
  type DigitCounts,
} from '@/lib/games/digit-derby';

const START_X = 0.04;
const FINISH_X = 0.94;

interface DigitRaceTrackProps {
  counts: DigitCounts;
  finishCount: number;
  finishOrder: number[];
  pick: number | null;
  lockedPick: number | null;
  multiplier: number;
  selectable: boolean;
  running: boolean;
  finished: boolean;
  inFinalStretch: boolean;
  onSelectDigit: (digit: number) => void;
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
      <span className="shrink-0 text-[10px] font-semibold text-on-subtle">
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
            <span>{digit}</span>
            <span className="text-on-subtle">{counts[digit]}</span>
          </span>
        );
      })}
      {pick !== null && !leaders.includes(pick) ? (
        <>
          <span className="ml-1 shrink-0 text-[10px] font-semibold text-on-subtle">
            Your pick
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-prominent bg-primary/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-on-prominent">
            <span className="font-bold">#{finishOrder.indexOf(pick) + 1}</span>
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
  pick,
  lockedPick,
  multiplier,
  selectable,
  running,
  finished,
  inFinalStretch,
  onSelectDigit,
  className,
}: DigitRaceTrackProps) {
  const activePick = lockedPick ?? pick;
  const leader = finishOrder[0];
  const rankOf = new Map(finishOrder.map((digit, position) => [digit, position]));

  return (
    <div className={cn('relative flex h-full w-full flex-col', className)}>
      {!running ? (
        <div className="grid grid-cols-[40px_1fr_74px] items-center border-y border-border-subtle bg-subtle/70 px-2 py-2 text-[10px] font-semibold text-on-subtle">
          <span>Digit</span>
          <span>Tap to pick</span>
          <span className="text-right">Odds</span>
        </div>
      ) : null}

      <div
        className={cn(
          'relative flex-1 min-h-0 overflow-y-auto',
          inFinalStretch && !finished && 'bg-semantic-warning/5',
        )}
      >
        {running ? (
          <div
            className={cn(
              'absolute inset-y-0 w-px border-r border-dashed border-border-prominent opacity-50',
              inFinalStretch && 'opacity-90',
            )}
            style={{ left: `${FINISH_X * 100}%` }}
            aria-hidden
          />
        ) : null}

        <div className="flex min-h-full flex-col">
          {Array.from({ length: DIGIT_COUNT }, (_, digit) => {
            const isPicked = activePick === digit;
            const rank = rankOf.get(digit) ?? digit;
            const isLeader = running && digit === leader;
            const progress = running
              ? START_X + progressTowardFinish(counts[digit], finishCount) * (FINISH_X - START_X)
              : START_X;

            return (
              <button
                key={digit}
                type="button"
                disabled={!selectable}
                onClick={() => onSelectDigit(digit)}
                aria-pressed={isPicked}
                aria-label={`Digit ${digit}, ${multiplier.toFixed(2)} times`}
                className={cn(
                  'relative h-10 shrink-0 border-b border-border-subtle/40 text-left last:border-b-0',
                  selectable && 'cursor-pointer hover:bg-subtle/60',
                  !selectable && 'cursor-default',
                  isPicked && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                )}
              >
                <div
                  className="absolute top-1/2 h-5 w-5 -translate-y-1/2"
                  style={{
                    left: `${progress * 100}%`,
                    transition: running ? 'left 200ms linear' : 'left 300ms ease-out',
                  }}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-on-prominent-static-inverse',
                      isPicked && 'ring-2 ring-border-prominent',
                      isLeader && !finished && 'animate-pulse',
                      !isPicked && running && 'bg-subtle text-on-prominent ring-1 ring-border-subtle',
                    )}
                  >
                    {digit}
                  </span>
                  {running ? (
                    <span
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums',
                        progress > 0.72 ? 'right-full mr-1' : 'left-full ml-1',
                        isPicked ? 'text-on-prominent' : 'text-on-subtle',
                      )}
                    >
                      {rank + 1} · {counts[digit]}/{finishCount}
                    </span>
                  ) : null}
                </div>

                {!running ? (
                  <div className="absolute inset-y-0 left-10 right-2 grid grid-cols-[1fr_74px] items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 text-[11px] font-semibold',
                        isPicked ? 'text-on-prominent' : 'text-on-subtle',
                      )}
                    >
                      Digit {digit}
                      {isPicked ? (
                        <span className="ml-1.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-on-prominent-static-inverse">
                          Pick
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right font-display text-sm font-bold tabular-nums text-on-prominent">
                      {multiplier.toFixed(2)}×
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
