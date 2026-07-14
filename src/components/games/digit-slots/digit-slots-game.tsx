'use client';

import { useState, useEffect } from 'react';
import { useDigitSlots } from '@/hooks/use-digit-slots';
import { getSlotPayTable } from '@/lib/games/digit-slots';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';

const SESSION_OPTIONS = [10, 50, 100] as const;
const MAX_GAMBLE_ROUNDS = 5;

function Reel({ digit, isSpinning }: { digit: number | null; isSpinning: boolean }) {
  return (
    <div className="relative h-[clamp(4.5rem,22vw,6rem)] w-[clamp(3.5rem,18vw,4.5rem)] overflow-hidden rounded-lg border-2 border-border-subtle bg-card">
      <div className="flex h-full items-center justify-center">
        {isSpinning ? (
          <span className="font-display text-3xl font-bold tabular-nums text-on-subtle/60">?</span>
        ) : (
          <span
            className={`font-display text-3xl font-bold tabular-nums ${
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

export function DigitSlotsGame() {
  const {
    state,
    balance,
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
    reels,
    result,
    bank,
    gambleRound,
    gambleDigit,
    error,
    session,
  } = state;

  const payTable = getSlotPayTable();
  const isJackpot = result?.outcome === 'triple_seven';
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isWin = !!result && result.multiplier > 0;
  const marketReady = ticks.length > 0 || lastConsumedTick !== null;

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
          {payTable.map((row) => (
            <div
              key={row.outcome}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                result?.outcome === row.outcome
                  ? 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning'
                  : 'border-transparent bg-subtle text-on-subtle'
              }`}
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
          <p>Three live digits stop the reels from left to right.</p>
          <p>After any win, enter a 50/50 double-or-nothing round (up to {MAX_GAMBLE_ROUNDS}x).</p>
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
            Line
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {reels.every((d) => d !== null) ? reels.join(' ') : '—'}
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
    if (phase === 'spinning') return 'Spinning…';
    if (phase === 'result' && isWin) return `${result!.label} · ${bank.toFixed(0)} credits at stake`;
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
            Spin reels
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
    <GameShell infoSections={infoSections}>
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
          <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-4 py-3 gap-3">
            <div className="flex items-center justify-between w-full max-w-sm">
              <span className="body-xs text-on-subtle uppercase">Reels</span>
              {session ? (
                <SessionProgress completed={session.completed} total={session.total} />
              ) : (
                <span className="rounded-full bg-subtle px-3 py-1 text-xs text-on-subtle">Manual</span>
              )}
            </div>

            <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-subtle/60 px-4 py-6 shadow-sm">
              <div className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-semantic-warning/30" aria-hidden />
              <div className="relative flex justify-center gap-2 sm:gap-3">
                {reels.map((digit, idx) => (
                  <Reel key={idx} digit={digit} isSpinning={phase === 'spinning' && digit === null} />
                ))}
              </div>
              <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Live digit payline</p>
            </div>

            {result && phase !== 'spinning' && phase !== 'idle' ? (
              <p className="text-sm text-on-subtle text-center">
                {result.label}
                {result.multiplier > 0 ? (
                  <span className="ml-1 font-display tabular-nums text-semantic-win">
                    +{(stake * result.multiplier).toFixed(0)}
                  </span>
                ) : null}
              </p>
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
        subtitle="Triple 7 paid the top-line multiplier."
        amount={result ? stake * result.multiplier : undefined}
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
