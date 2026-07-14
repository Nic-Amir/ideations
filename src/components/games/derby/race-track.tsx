'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BetMode, RaceCard, RacePath } from '@/lib/games/derby';

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
  mode: BetMode;
  odds: number[];
  oddsLabel: string;
  className?: string;
}

/** Fraction of the lane the chips occupy before the race starts. */
const START_X = 0.02;
/** The finish line sits at this fraction of the lane width. */
const FINISH_X = 0.94;

/** Live top-5 strip, shared between the track and chart views. */
export function LeaderboardStrip({
  card,
  liveRanks,
  selection,
  statusLabel,
}: {
  card: RaceCard;
  liveRanks: number[];
  selection: number[];
  statusLabel: string;
}) {
  const leaders = liveRanks.slice(0, 3);
  const selectedOutsideLeaders = selection.filter((horse) => !leaders.includes(horse));

  const rankChip = (horse: number, position: number, isSelectionOnly = false) => {
    const pickSlot = selection.indexOf(horse);
    return (
      <span
        key={`${isSelectionOnly ? 'pick' : 'leader'}-${horse}`}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full border bg-subtle px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors',
          pickSlot >= 0
            ? 'border-border-prominent text-on-prominent'
            : 'border-border-subtle text-on-subtle',
        )}
      >
        <span className="font-bold text-on-prominent">#{position + 1}</span>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: card.horses[horse].silks }}
        />
        <span className="max-w-[92px] truncate">{card.horses[horse].name}</span>
        {pickSlot >= 0 ? <span className="text-primary">P{pickSlot + 1}</span> : null}
      </span>
    );
  };

  return (
    <div className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto py-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
        {statusLabel}
      </span>
      {leaders.map((horse, position) => rankChip(horse, position))}
      {selectedOutsideLeaders.length > 0 ? (
        <span className="ml-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Your picks
        </span>
      ) : null}
      {selectedOutsideLeaders.map((horse) =>
        rankChip(horse, liveRanks.indexOf(horse), true),
      )}
    </div>
  );
}

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
  mode,
  odds,
  oddsLabel,
  className,
}: RaceTrackProps) {
  const running = path !== null;
  const totalTicks = card.ticks;
  const boardRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || running) return;
    const update = () => {
      setShowScrollHint(board.scrollTop + board.clientHeight < board.scrollHeight - 4);
    };
    const observer = new ResizeObserver(update);
    observer.observe(board);
    return () => observer.disconnect();
  }, [card.id, running]);

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
  const revealedTick = Math.min(visibleTick, totalTicks);

  return (
    <div className={cn('relative flex h-full w-full flex-col', className)}>
      {!running ? (
        <div className="grid grid-cols-[40px_1fr_74px] items-center border-y border-border-subtle bg-subtle/70 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          <span>Post</span>
          <span>Runner · form</span>
          <span className="text-right">{oddsLabel}</span>
        </div>
      ) : null}

      {/* Lanes */}
      <div
        ref={boardRef}
        onScroll={() => {
          const board = boardRef.current;
          if (board) {
            setShowScrollHint(board.scrollTop + board.clientHeight < board.scrollHeight - 4);
          }
        }}
        className={cn(
          'relative flex-1 min-h-0',
          !running && 'scrollbar-hide overflow-y-auto',
          inFinalStretch && !finished && 'bg-semantic-warning/5',
        )}
      >
        {/* Finish line */}
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

        <div className={cn('flex flex-col', running ? 'h-full' : 'min-h-full')}>
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
                aria-label={`${horse.name}, ${oddsLabel.toLowerCase()} ${odds[horse.index].toFixed(2)}`}
                className={cn(
                  'relative border-b border-border-subtle/40 text-left last:border-b-0',
                  running ? 'flex-1 min-h-0' : 'h-11 shrink-0',
                  selectable && 'cursor-pointer hover:bg-subtle/60',
                  !selectable && 'cursor-default',
                  isPicked && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                )}
              >
                {/* Horse chip — slides along the lane during the race. Near
                    the finish the label flips to the left of the chip so it
                    never overflows the right edge. */}
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{
                    left: `${progress[horse.index] * 100}%`,
                    transition: running
                      ? 'left 240ms linear'
                      : 'left 300ms ease-out',
                  }}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-black/80',
                      isPicked && 'ring-2 ring-border-prominent',
                      isLeader && !finished && 'animate-pulse',
                    )}
                    style={{ backgroundColor: horse.silks }}
                  >
                    {horse.index + 1}
                  </span>
                  {running ? (
                    <span
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums',
                        progress[horse.index] > 0.72 ? 'right-full mr-1' : 'left-full ml-1',
                        isPicked ? 'text-on-prominent' : 'text-on-subtle',
                      )}
                    >
                      {rank + 1} · {path.prices[horse.index][revealedTick].toFixed(1)}
                    </span>
                  ) : null}
                </div>

                {/* Idle: right-aligned odds-board info */}
                {!running ? (
                  <div className="absolute inset-y-0 left-10 right-2 grid grid-cols-[1fr_74px] items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 text-[11px] font-semibold',
                        isPicked ? 'text-on-prominent' : 'text-on-subtle',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{horse.name}</span>
                        {isPicked ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-on-prominent-static-inverse">
                            Pick {slot + 1}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[9px] font-normal text-on-subtle">
                        {horse.form}
                        {mode === 'place' ? ' · top 3 market' : ''}
                      </span>
                    </span>
                    <span className="text-right text-xs font-bold tabular-nums text-on-prominent">
                      {odds[horse.index].toFixed(2)}×
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {!running && showScrollHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-prominent via-prominent/80 to-transparent pb-1.5 text-[10px] font-semibold text-on-subtle">
          Scroll for all 16 runners
        </div>
      ) : null}
    </div>
  );
}
