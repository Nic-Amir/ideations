'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDigitSlots, type SlotRowFeed } from '@/hooks/use-digit-slots';
import { getHittingLines, getSlotPayTable, PAYLINE_COUNT } from '@/lib/games/digit-slots';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { LiveTickChart } from '@/components/games/shared/live-tick-chart';
import { DigitExtraction } from '@/components/games/shared/digit-extraction';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { SUPPORTED_SYMBOLS, type DerivSymbol, type PaylineId } from '@/types';

function shortSymbolName(id: DerivSymbol): string {
  const info = SUPPORTED_SYMBOLS.find((s) => s.id === id);
  if (!info) return id;
  return info.name.replace('Volatility ', 'Vol ').replace(' (1s)', '');
}

function Reel({
  digit,
  isSpinning,
  highlighted,
}: {
  digit: number | null;
  isSpinning: boolean;
  highlighted: boolean;
}) {
  return (
    <div
      className={`relative h-[clamp(3.25rem,14vw,4.75rem)] w-[clamp(3.25rem,14vw,4.75rem)] overflow-hidden rounded-lg border-2 bg-card transition-colors ${
        highlighted ? 'border-semantic-warning bg-semantic-warning/10' : 'border-border-subtle'
      }`}
    >
      <div className="flex h-full items-center justify-center">
        {isSpinning ? (
          <span className="font-display text-2xl font-bold tabular-nums text-on-subtle/60">?</span>
        ) : (
          <span
            className={`font-display text-2xl font-bold tabular-nums ${
              digit === 7 ? 'text-primary' : 'text-semantic-warning'
            }`}
          >
            {digit ?? '?'}
          </span>
        )}
      </div>
    </div>
  );
}

function RowFeedPicker({
  row,
  symbol,
  disabled,
  onChange,
}: {
  row: number;
  symbol: DerivSymbol;
  disabled: boolean;
  onChange: (symbol: DerivSymbol) => void;
}) {
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="body-xs text-on-subtle shrink-0 w-8">R{row + 1}</span>
      <select
        className="min-w-0 flex-1 rounded-md border border-border-subtle bg-card px-2 py-1 text-xs text-on-prominent disabled:opacity-50"
        value={symbol}
        disabled={disabled}
        aria-label={`Row ${row + 1} feed`}
        onChange={(e) => onChange(e.target.value as DerivSymbol)}
      >
        {SUPPORTED_SYMBOLS.map((sym) => (
          <option key={sym.id} value={sym.id}>
            {shortSymbolName(sym.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TripleFeedStrip({ feeds }: { feeds: SlotRowFeed[] }) {
  return (
    <div className="shrink-0 px-4 pt-2 pb-2 border-b border-border-subtle space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Row feeds
        </span>
        <div className="rounded bg-card/90 px-2 py-0.5 backdrop-blur-sm border border-border-subtle">
          <ConnectionIndicator />
        </div>
      </div>
      {feeds.map((feed, row) => (
        <div key={`${feed.symbol}-${row}`} className="relative overflow-hidden rounded-lg">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-2 pt-1">
            <span className="rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-subtle backdrop-blur-sm border border-border-subtle">
              R{row + 1} · {shortSymbolName(feed.symbol)}
            </span>
            {feed.lastConsumedTick ? (
              <div className="rounded bg-card/90 px-1.5 py-0.5 backdrop-blur-sm border border-border-subtle">
                <DigitExtraction
                  tick={feed.lastConsumedTick}
                  triggerKey={feed.extractionKey}
                />
              </div>
            ) : null}
          </div>
          <LiveTickChart
            ticks={feed.ticks}
            highlightedTicks={feed.highlightedTicks}
            className="w-full"
            compact
          />
        </div>
      ))}
    </div>
  );
}

function formatCredits(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(Number.isInteger(value) || Math.abs(value % 1) < 1e-9 ? 0 : 1);
}

function PayTablePanel({
  stake,
  payTable,
}: {
  stake: number;
  payTable: ReturnType<typeof getSlotPayTable>;
}) {
  const lineBet = stake / PAYLINE_COUNT;

  return (
    <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-subtle/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Pays per matching line
        </p>
        <p className="text-[10px] text-on-subtle font-display tabular-nums">
          Stake {formatCredits(stake)} → {formatCredits(lineBet)} × {PAYLINE_COUNT} lines
        </p>
      </div>
      <div className="space-y-1">
        {payTable
          .filter((row) => row.outcome !== 'none')
          .map((row) => {
            const credits = lineBet * row.multiplier;
            return (
              <div
                key={row.outcome}
                className="flex items-center justify-between rounded-md bg-subtle px-2 py-1.5 text-[11px] text-on-subtle"
              >
                <span className="truncate">{row.label}</span>
                <span className="font-display tabular-nums shrink-0 ml-2 text-on-prominent">
                  {formatCredits(credits)} credits
                </span>
              </div>
            );
          })}
      </div>
      <p className="text-[10px] text-on-subtle leading-snug">
        Matching lines all pay; amounts above update with your stake.
      </p>
    </div>
  );
}

export function DigitSlotsGame() {
  const {
    state,
    balance,
    rowSymbols,
    setRowSymbol,
    performSpin,
    setStake,
    rowFeeds,
    marketReady,
  } = useDigitSlots();

  const { phase, stake, grid, result, error } = state;

  const payTable = getSlotPayTable();
  const hittingLines = result ? getHittingLines(result) : [];
  const highlightedIndices = useMemo(() => {
    if (phase === 'spinning' || !result) return new Set<number>();
    const set = new Set<number>();
    for (const line of result.lines) {
      if (line.multiplier <= 0) continue;
      for (const idx of line.indices) set.add(idx);
    }
    return set;
  }, [phase, result]);

  const isJackpot = hittingLines.some((l) => l.outcome === 'triple_seven');
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isWin = !!result && result.totalMultiplier > 0;
  const feedsLocked = phase === 'spinning';

  const [showJackpot, setShowJackpot] = useState(false);

  useEffect(() => {
    if (isJackpot && phase === 'result') setShowJackpot(true);
  }, [isJackpot, phase]);

  const infoSections: GameInfoSection[] = [
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Pick a distinct live feed for each of the 3 rows. Rows fill in parallel (~3 ticks).</p>
          <p>
            Eight paylines settle: 3 rows, 3 columns, 2 diagonals. Stake is split across all
            lines; the pay table shows the credit amount each pattern pays on one line at your
            current stake. Matching lines all pay and sum together.
          </p>
          <p>Wins credit automatically.</p>
        </div>
      ),
    },
    {
      id: 'stats',
      label: 'Stats',
      content: (
        <div className="grid gap-3 grid-cols-2">
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Hits
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {result ? hittingLines.length : '—'}
            </div>
          </div>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Last payout
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {result ? result.totalPayout.toFixed(0) : '—'}
            </div>
          </div>
        </div>
      ),
    },
  ];

  const dockFooter = (() => {
    if (phase === 'spinning') return 'Filling grid…';
    if (phase === 'result' && isWin) {
      return `${hittingLines.length} line${hittingLines.length === 1 ? '' : 's'} · +${formatCredits(result!.totalPayout)} credited`;
    }
    if (phase === 'result' && !isWin) return 'No Match';
    return undefined;
  })();

  const renderDockActions = () => {
    if (phase === 'spinning') {
      return (
        <Button variant="primary" className="w-full min-h-[44px]" disabled aria-busy>
          Spinning…
        </Button>
      );
    }

    if (phase === 'idle') {
      return (
        <Button
          variant="primary"
          className="w-full min-h-[44px]"
          disabled={stake > balance || balance <= 0}
          onClick={performSpin}
        >
          Spin grid
        </Button>
      );
    }

    // result
    return (
      <Button
        variant="primary"
        className="w-full min-h-[44px]"
        disabled={stake > balance || balance <= 0}
        onClick={performSpin}
      >
        Spin again
      </Button>
    );
  };

  return (
    <GameShell infoSections={infoSections} showSymbolPicker={false}>
      <GameViewport
        market={
          marketReady ? (
            <TripleFeedStrip feeds={rowFeeds} />
          ) : (
            <div className="shrink-0 flex items-center justify-center py-6 border-b border-border-subtle">
              <Spinner />
            </div>
          )
        }
        play={
          <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-4 py-3 gap-3 overflow-y-auto">
            <div className="flex items-center justify-between w-full max-w-sm">
              <span className="body-xs text-on-subtle uppercase">3×3 Grid</span>
              <span className="rounded-full bg-subtle px-3 py-1 text-xs text-on-subtle">
                8 paylines
              </span>
            </div>

            <div className="w-full max-w-sm space-y-2 rounded-xl border border-border-subtle bg-subtle/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
                Assign feeds
              </p>
              {[0, 1, 2].map((row) => (
                <RowFeedPicker
                  key={row}
                  row={row}
                  symbol={rowSymbols[row]}
                  disabled={feedsLocked}
                  onChange={(sym) => setRowSymbol(row, sym)}
                />
              ))}
            </div>

            <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-subtle/60 px-4 py-5 shadow-sm">
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <span
                      className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle truncate"
                      title={rowSymbols[row]}
                    >
                      {shortSymbolName(rowSymbols[row]).replace('Vol ', 'V')}
                    </span>
                    <div className="flex flex-1 justify-center gap-2">
                      {[0, 1, 2].map((col) => {
                        const index = row * 3 + col;
                        const digit = grid[index];
                        return (
                          <Reel
                            key={index}
                            digit={digit}
                            isSpinning={phase === 'spinning' && digit === null}
                            highlighted={highlightedIndices.has(index)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <PayTablePanel stake={stake} payTable={payTable} />

            {result && phase === 'result' ? (
              <div className="w-full max-w-sm space-y-1 text-sm text-center">
                {hittingLines.length === 0 ? (
                  <p className="text-on-subtle">No Match</p>
                ) : (
                  <>
                    <ul className="space-y-0.5 text-left text-xs text-on-subtle">
                      {hittingLines.map((line) => (
                        <li
                          key={line.paylineId as PaylineId}
                          className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2 py-1"
                        >
                          <span>
                            {line.paylineName} · {line.outcomeLabel}{' '}
                            <span className="font-display tabular-nums">
                              {line.digits.join('')}
                            </span>
                          </span>
                          <span className="font-display tabular-nums text-semantic-win">
                            +{formatCredits(line.payout)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="font-display tabular-nums text-semantic-win pt-1">
                      +{formatCredits(result.totalPayout)} credits credited
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {error ? <GameNotice tone="danger">{error}</GameNotice> : null}
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={phase === 'spinning'}
            showSlider={phase !== 'spinning'}
            footer={dockFooter}
            actions={renderDockActions()}
          />
        }
      />

      <ResultOverlay
        open={showJackpot}
        won
        title="Jackpot!"
        subtitle="A payline hit triple 7."
        amount={result?.totalPayout}
        amountLabel="credits"
        onDismiss={() => setShowJackpot(false)}
      />
    </GameShell>
  );
}
