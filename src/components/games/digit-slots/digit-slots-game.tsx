'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDigitSlots } from '@/hooks/use-digit-slots';
import { getHittingLines, getSlotPayTable, PAYLINE_COUNT } from '@/lib/games/digit-slots';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { SUPPORTED_SYMBOLS, type DerivSymbol, type PaylineId } from '@/types';

const SESSION_OPTIONS = [10, 50, 100] as const;
const MAX_GAMBLE_ROUNDS = 5;

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

function SessionProgress({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="flex items-center gap-3 rounded-full bg-subtle px-3 py-1 text-xs text-on-subtle">
      <span className="font-display tabular-nums">
        {completed}/{total}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border-subtle">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
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

export function DigitSlotsGame() {
  const {
    state,
    balance,
    rowSymbols,
    setRowSymbol,
    performSpin,
    performGamble,
    cashOut,
    continueSession,
    stopSession,
    dismissSummary,
    setStake,
    startSession,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
  } = useDigitSlots();

  const {
    phase,
    stake,
    grid,
    result,
    bank,
    gambleRound,
    gambleDigit,
    error,
    session,
  } = state;

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
  const marketReady = ticks.length > 0 || lastConsumedTick !== null;
  const feedsLocked = phase !== 'idle';

  const [showJackpot, setShowJackpot] = useState(false);
  const [showSessionComplete, setShowSessionComplete] = useState(false);

  useEffect(() => {
    if (isJackpot && phase === 'result') setShowJackpot(true);
  }, [isJackpot, phase]);

  useEffect(() => {
    if (phase === 'sessionComplete' && session) setShowSessionComplete(true);
  }, [phase, session]);

  const infoSections: GameInfoSection[] = [
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          <p className="text-xs text-on-subtle">
            Stake is split across {PAYLINE_COUNT} paylines. Each line pays its multiplier on{' '}
            <span className="font-display tabular-nums">stake/{PAYLINE_COUNT}</span>. Wins add up.
          </p>
          {payTable.map((row) => (
            <div
              key={row.outcome}
              className="flex items-center justify-between rounded-md border border-transparent bg-subtle px-3 py-2 text-xs text-on-subtle"
            >
              <span>{row.label}</span>
              <span className="font-display tabular-nums">
                {row.multiplier > 0 ? `${row.multiplier}x` : '—'}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Pick a distinct live feed for each of the 3 rows. Rows fill in parallel (~3 ticks).</p>
          <p>
            Eight paylines settle: 3 rows, 3 columns, 2 diagonals. Matching patterns on multiple
            lines all pay.
          </p>
          <p>After any win, enter a 50/50 double-or-nothing round on row 1&apos;s feed (up to {MAX_GAMBLE_ROUNDS}x).</p>
          <p>Auto-spin sessions run 10, 50, or 100 spins.</p>
        </div>
      ),
    },
    {
      id: 'stats',
      label: 'Stats',
      content: (
        <div className="grid gap-3 grid-cols-3">
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Mode
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {session ? `${session.completed}/${session.total}` : 'Manual'}
            </div>
          </div>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Hits
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {result ? hittingLines.length : '—'}
            </div>
          </div>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Bank
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {bank ? bank.toFixed(0) : '0'}
            </div>
          </div>
        </div>
      ),
    },
  ];

  const dockFooter = (() => {
    if (phase === 'spinning') return 'Filling grid…';
    if (phase === 'result' && isWin) {
      return `${hittingLines.length} line${hittingLines.length === 1 ? '' : 's'} · ${bank.toFixed(0)} credits`;
    }
    if (phase === 'gambling') return 'Double or nothing…';
    if (phase === 'gambleWon') return `Won · bank ${bank.toFixed(0)} credits`;
    if (phase === 'gambleLost') return `Bust — digit ${gambleDigit}`;
    if (phase === 'awaitingResume' && session)
      return `${session.total - session.completed} spins remaining`;
    return undefined;
  })();

  const renderDockActions = () => {
    if (phase === 'idle') {
      return (
        <>
          <Button
            variant="primary"
            className="w-full min-h-[44px]"
            disabled={stake > balance || balance <= 0}
            onClick={performSpin}
          >
            Spin grid
          </Button>
          <div className="flex gap-2 justify-center">
            {SESSION_OPTIONS.map((count) => (
              <Button
                key={count}
                variant="secondary"
                size="sm"
                className="min-h-[44px] flex-1"
                disabled={stake > balance || balance <= 0}
                onClick={() => startSession(count)}
              >
                {count} spins
              </Button>
            ))}
          </div>
        </>
      );
    }

    if (phase === 'result' && isWin) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" className="min-h-[44px]" onClick={performGamble}>
            Double
          </Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={cashOut}>
            Cash out
          </Button>
        </div>
      );
    }

    if (phase === 'result' && !isWin && !session) {
      return (
        <Button variant="primary" className="w-full min-h-[44px]" onClick={performSpin}>
          Spin again
        </Button>
      );
    }

    if (phase === 'gambleWon') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            className="min-h-[44px]"
            disabled={gambleRound >= MAX_GAMBLE_ROUNDS}
            onClick={performGamble}
          >
            Double again
          </Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={cashOut}>
            Cash out
          </Button>
        </div>
      );
    }

    if (phase === 'gambleLost' && !session) {
      return (
        <Button variant="primary" className="w-full min-h-[44px]" onClick={performSpin}>
          Spin again
        </Button>
      );
    }

    if (phase === 'awaitingResume' && session) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" className="min-h-[44px]" onClick={continueSession}>
            Continue
          </Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={stopSession}>
            Stop session
          </Button>
        </div>
      );
    }

    if (phase === 'spinning' || phase === 'gambling') {
      return (
        <Button variant="primary" className="w-full min-h-[44px]" disabled aria-busy>
          {phase === 'spinning' ? 'Spinning…' : 'Gambling…'}
        </Button>
      );
    }

    if (session && phase !== 'sessionComplete') {
      return (
        <Button variant="secondary" className="w-full min-h-[44px]" onClick={stopSession}>
          Stop session
        </Button>
      );
    }

    return null;
  };

  const sessionPnl = session ? balance - session.startBalance : 0;

  return (
    <GameShell infoSections={infoSections} showSymbolPicker={false}>
      <GameViewport
        market={
          marketReady ? (
            <MiniMarketStrip
              ticks={ticks}
              highlightedTicks={highlightedTicks}
              lastConsumedTick={lastConsumedTick}
              extractionKey={extractionKey}
            />
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
              {session ? (
                <SessionProgress completed={session.completed} total={session.total} />
              ) : (
                <span className="rounded-full bg-subtle px-3 py-1 text-xs text-on-subtle">Manual</span>
              )}
            </div>

            <div className="w-full max-w-sm space-y-2 rounded-xl border border-border-subtle bg-subtle/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
                Row feeds
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
                    <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle truncate" title={rowSymbols[row]}>
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
              <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
                8 live-digit paylines
              </p>
            </div>

            {result && phase !== 'spinning' && phase !== 'idle' ? (
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
                            +{line.payout.toFixed(0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="font-display tabular-nums text-semantic-win pt-1">
                      Total +{result.totalPayout.toFixed(0)}{' '}
                      <span className="text-on-subtle">
                        ({result.totalMultiplier.toFixed(2)}x)
                      </span>
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
            stakeDisabled={phase !== 'idle'}
            showSlider={phase === 'idle'}
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

      <ResultOverlay
        open={showSessionComplete && !!session}
        won={sessionPnl >= 0}
        title="Session complete"
        subtitle={
          session ? `${session.completed} / ${session.total} spins played` : undefined
        }
        amount={sessionPnl}
        amountLabel="net"
        onDismiss={() => {
          setShowSessionComplete(false);
          dismissSummary();
        }}
        primaryAction={{
          label: 'Done',
          onClick: () => {
            setShowSessionComplete(false);
            dismissSummary();
          },
        }}
      />
    </GameShell>
  );
}
