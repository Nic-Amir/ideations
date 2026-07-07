'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { RaceCard, RacePath } from '@/lib/games/derby';

interface RaceTrackProps {
  card: RaceCard;
  /** Locked race while running/settled; null while idle. */
  path: RacePath | null;
  visibleTick: number;
  /** Horse indices ranked 1st → 16th at the visible tick. */
  liveRanks: number[];
  /** Slot position per selected horse index (1-based); tap targets while idle. */
  selection: number[];
  onToggleHorse: (index: number) => void;
  selectable: boolean;
  inFinalStretch: boolean;
  /** True once the race has crossed the line (settle pause / overlay). */
  finished: boolean;
  className?: string;
}

/** Fraction of the lane the chips occupy before the race starts. */
const START_X = 0.02;
/** The finish line sits at this fraction of the lane width. */
const FINISH_X = 0.94;

export function RaceTrack({
  card,
  path,
  visibleTick,
  liveRanks,
  selection,
  onToggleHorse,
  selectable,
  inFinalStretch,
  finished,
  className,
}: RaceTrackProps) {
  const running = path !== null;
  const totalTicks = card.ticks;

  /**
   * Lane progress per horse: time carries every horse toward the finish
   * (leader hits the line exactly at the last tick), and the field spreads
   * around that pace by price relative to the field at the visible tick.
   */
  const progress = useMemo(() => {
    if (!running) return card.horses.map(() => START_X);

    const t = Math.min(visibleTick, totalTicks);
    const pacer = (t / totalTicks) * (FINISH_X - START_X);
    const prices = card.horses.map((h) => path.prices[h.index][t]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = Math.max(max - min, 1e-9);
    // The gap behind the pacer grows mid-race then closes at the line so the
    // finish is read at the finish line, not mid-track.
    const spread = 0.22 * (FINISH_X - START_X) * Math.sin(Math.PI * (t / totalTicks) * 0.92);

    return card.horses.map((h) => {
      const rel = (prices[h.index] - min) / span; // 0 = trailing, 1 = leading
      return Math.min(FINISH_X, START_X + pacer - spread * (1 - rel));
    });
  }, [running, card.horses, path, visibleTick, totalTicks]);

  const rankOf = useMemo(() => {
    const map = new Map<number, number>();
    liveRanks.forEach((horse, position) => map.set(horse, position));
    return map;
  }, [liveRanks]);

  const leader = liveRanks[0];

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      {/* Live top-5 leaderboard strip */}
      <div className="flex items-center gap-1 overflow-hidden px-2 py-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          {running ? (finished ? 'Finish' : 'Live') : 'Post'}
        </span>
        {liveRanks.slice(0, 5).map((horse, position) => (
          <span
            key={horse}
            className={cn(
              'flex min-w-0 items-center gap-1 rounded-full border border-border-subtle bg-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors',
              selection.includes(horse) && 'border-border-prominent text-on-prominent',
              !selection.includes(horse) && 'text-on-subtle',
            )}
          >
            <span className="text-on-subtle">{position + 1}</span>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: card.horses[horse].silks }}
            />
            <span className="truncate">{card.horses[horse].name}</span>
          </span>
        ))}
      </div>

      {/* Lanes */}
      <div
        className={cn(
          'relative flex-1 min-h-0',
          inFinalStretch && !finished && 'bg-semantic-warning/5',
        )}
      >
        {/* Finish line */}
        <div
          className={cn(
            'absolute inset-y-0 w-px border-r border-dashed border-border-prominent opacity-50',
            inFinalStretch && 'opacity-90',
          )}
          style={{ left: `${FINISH_X * 100}%` }}
          aria-hidden
        />

        <div className="flex h-full flex-col">
          {card.horses.map((horse) => {
            const slot = selection.indexOf(horse.index);
            const isPicked = slot >= 0;
            const rank = rankOf.get(horse.index) ?? horse.index;
            const isLeader = running && horse.index === leader;

            return (
              <button
                key={horse.index}
                type="button"
                disabled={!selectable}
                onClick={() => onToggleHorse(horse.index)}
                aria-pressed={isPicked}
                aria-label={`${horse.name}, winner pays ${card.winOdds[horse.index].toFixed(2)}`}
                className={cn(
                  'relative flex-1 min-h-0 border-b border-border-subtle/40 text-left last:border-b-0',
                  selectable && 'cursor-pointer hover:bg-subtle/60',
                  !selectable && 'cursor-default',
                  isPicked && 'bg-subtle',
                )}
              >
                {/* Horse chip — slides along the lane during the race */}
                <div
                  className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1"
                  style={{
                    left: `${progress[horse.index] * 100}%`,
                    transition: running
                      ? 'left 240ms linear'
                      : 'left 300ms ease-out',
                  }}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-black/80',
                      isPicked && 'ring-2 ring-border-prominent',
                      isLeader && !finished && 'animate-pulse',
                    )}
                    style={{ backgroundColor: horse.silks }}
                  >
                    {horse.index + 1}
                  </span>
                  {running ? (
                    <span className="text-[9px] font-semibold tabular-nums text-on-subtle">
                      {rank + 1}
                      {isPicked ? ` · P${slot + 1}` : ''}
                    </span>
                  ) : null}
                </div>

                {/* Idle: right-aligned odds-board info */}
                {!running ? (
                  <div className="absolute inset-y-0 right-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'truncate text-[11px] font-semibold',
                        isPicked ? 'text-on-prominent' : 'text-on-subtle',
                      )}
                    >
                      {horse.name}
                      {isPicked ? (
                        <span className="ml-1 rounded bg-prominent px-1 text-[9px] text-on-prominent">
                          P{slot + 1}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden text-[9px] text-on-subtle sm:inline">
                      {horse.form}
                    </span>
                    <span className="w-12 text-right text-[11px] font-bold tabular-nums text-on-prominent">
                      {card.winOdds[horse.index].toFixed(2)}×
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
