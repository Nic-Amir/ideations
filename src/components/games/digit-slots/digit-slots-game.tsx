'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useDigitSlots } from '@/hooks/use-digit-slots';
import { getSlotPayTable } from '@/lib/games/digit-slots';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  GameLayout,
  GameNotice,
  GameStatusLine,
} from '@/components/games/shared/game-layout';

const SESSION_OPTIONS = [10, 50, 100] as const;
const MAX_GAMBLE_ROUNDS = 5;

// ---------------------------------------------------------------------------
// Reel
// ---------------------------------------------------------------------------

function Reel({ digit, isSpinning }: { digit: number | null; isSpinning: boolean }) {
  return (
    <div className="relative h-24 w-[4.5rem] overflow-hidden rounded-2xl border-2 border-border bg-card">
      <div className="flex h-full items-center justify-center">
        {isSpinning ? (
          <span className="font-mono-game text-4xl font-bold text-muted-foreground/60">?</span>
        ) : (
          <span
            className={`font-mono-game text-4xl font-bold ${
              digit === 7 ? 'text-[#7B2FBE] text-glow-purple' : 'text-primary'
            }`}
          >
            {digit ?? '?'}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session progress bar
// ---------------------------------------------------------------------------

function SessionProgress({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-muted-foreground">
      <span>
        {completed}/{total}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // -- status line -----------------------------------------------------------

  let statusText = 'Set your stake and spin.';
  if (phase === 'spinning') statusText = 'Spinning...';
  else if (phase === 'result' && isWin) statusText = `${result!.label} — ${bank.toFixed(0)} credits at stake.`;
  else if (phase === 'result' && !isWin) statusText = `${result?.label ?? 'No match'}.`;
  else if (phase === 'gambling') statusText = 'Double or nothing...';
  else if (phase === 'gambleWon') statusText = `Won! Bank: ${bank.toFixed(0)} credits.`;
  else if (phase === 'gambleLost') statusText = `Bust — digit ${gambleDigit}.`;
  else if (phase === 'awaitingResume') statusText = `Session paused — ${(session?.total ?? 0) - (session?.completed ?? 0)} spins remaining.`;
  else if (phase === 'sessionComplete') statusText = 'Session complete.';

  // -- play area -------------------------------------------------------------

  const playArea = (
    <div className="space-y-5">
      {/* Jackpot banner */}
      <AnimatePresence>
        {isJackpot && (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <GameNotice tone="success">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold text-purple-200">Jackpot hit</p>
                  <p className="mt-1 text-xs text-purple-100/80">Triple 7 paid the top-line multiplier.</p>
                </div>
                <div className="font-mono-game text-xl font-semibold text-purple-200">777</div>
              </div>
            </GameNotice>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reels */}
      <div className="rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,27,42,0.95),rgba(10,18,30,0.88))] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="section-label">Reels</div>
          {session ? (
            <SessionProgress completed={session.completed} total={session.total} />
          ) : (
            <div className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-muted-foreground">
              Manual
            </div>
          )}
        </div>
        <div className="flex justify-center gap-3 md:gap-5">
          {reels.map((digit, idx) => (
            <Reel key={idx} digit={digit} isSpinning={phase === 'spinning' && digit === null} />
          ))}
        </div>
      </div>

      {/* Spin result notice */}
      {phase !== 'spinning' && phase !== 'idle' && phase !== 'awaitingResume' && phase !== 'sessionComplete' && result ? (
        <GameNotice tone={result.multiplier > 0 ? 'success' : 'default'}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-lg font-semibold">{result.label}</p>
              <p className="mt-1 text-xs opacity-80">
                {result.multiplier > 0
                  ? `${result.multiplier}x on ${stake} stake.`
                  : 'No paying line.'}
              </p>
            </div>
            <div className="font-mono-game text-lg font-semibold">
              {result.multiplier > 0 ? `${(stake * result.multiplier).toFixed(0)}` : '0'}
            </div>
          </div>
        </GameNotice>
      ) : null}

      {/* -- Phase-specific panels ------------------------------------------ */}

      {/* Win: offer Double or Nothing / Cash Out */}
      {phase === 'result' && isWin && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-display text-base font-semibold text-amber-200">Double or Nothing</div>
              <p className="mt-1 text-sm text-amber-100/80">
                Risk your {bank.toFixed(0)} credits. Digits 5-9 double, 0-4 lose.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
              <Button onClick={performGamble} variant="secondary" className="border border-amber-400/30">
                Double or Nothing
              </Button>
              <Button onClick={cashOut} variant="outline">
                Cash Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loss in manual mode: Spin Again */}
      {phase === 'result' && !isWin && !session && (
        <Button onClick={performSpin} variant="outline" className="h-11 w-full">
          Spin again
        </Button>
      )}

      {/* Loss in session: auto-continuing indicator */}
      {phase === 'result' && !isWin && session && (
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-center">
          <p className="text-sm text-muted-foreground">Next spin starting...</p>
        </div>
      )}

      {/* Gambling in progress */}
      {phase === 'gambling' && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-center">
          <p className="text-sm text-amber-200/80">Gambling...</p>
        </div>
      )}

      {/* Gamble won: Double Again / Cash Out */}
      {phase === 'gambleWon' && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-display text-base font-semibold text-amber-200">
                Won! Bank: {bank.toFixed(0)} credits
              </div>
              <p className="mt-1 text-sm text-amber-100/80">
                Digit {gambleDigit} hit. Double again or take your credits.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
              <Button
                onClick={performGamble}
                variant="secondary"
                className="border border-amber-400/30"
                disabled={gambleRound >= MAX_GAMBLE_ROUNDS}
              >
                Double or Nothing
              </Button>
              <Button onClick={cashOut} variant="outline">
                Cash Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Gamble lost (manual only — session auto-transitions to awaitingResume) */}
      {phase === 'gambleLost' && !session && (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-display text-base font-semibold text-red-200">
                Bust — digit {gambleDigit}
              </div>
              <p className="mt-1 text-sm text-red-100/80">Lost the gamble.</p>
            </div>
            <Button onClick={performSpin} variant="outline" className="md:min-w-[140px]">
              Spin again
            </Button>
          </div>
        </div>
      )}

      {/* Awaiting resume (session paused after win resolution) */}
      {phase === 'awaitingResume' && session && (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-display text-base font-semibold text-primary">
                {session.total - session.completed} spins remaining
              </div>
              <p className="mt-1 text-sm text-primary/80">Continue the session or stop and see your results.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
              <Button onClick={continueSession}>Continue</Button>
              <Button onClick={stopSession} variant="outline">
                Stop Session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Session complete: summary */}
      {phase === 'sessionComplete' && session && (
        <div className="space-y-4 rounded-2xl border border-white/8 bg-white/4 p-5">
          <div className="text-center">
            <div className="font-display text-lg font-semibold">Session Complete</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.completed} / {session.total} spins played
            </p>
          </div>
          <div className="flex justify-center">
            {(() => {
              const pnl = balance - session.startBalance;
              const isPositive = pnl >= 0;
              return (
                <div
                  className={`rounded-xl border px-6 py-3 text-center ${
                    isPositive
                      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                      : 'border-red-400/20 bg-red-400/10 text-red-300'
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide opacity-70">Net P&amp;L</div>
                  <div className="font-mono-game text-2xl font-semibold">
                    {isPositive ? '+' : ''}
                    {pnl.toFixed(0)}
                  </div>
                </div>
              );
            })()}
          </div>
          <Button onClick={dismissSummary} variant="outline" className="h-11 w-full">
            Done
          </Button>
        </div>
      )}

      {/* Error */}
      {error && <GameNotice tone="danger">{error}</GameNotice>}
    </div>
  );

  // -- controls (betslip) ----------------------------------------------------

  const controls = (
    <div className="space-y-4">
      {/* Stake slider */}
      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-muted-foreground">Stake</span>
          <span className="font-mono-game text-primary">{stake}</span>
        </div>
        <Slider
          value={[stake]}
          onValueChange={(v) => setStake(Array.isArray(v) ? v[0] : v)}
          min={10}
          max={maxStake}
          step={10}
          disabled={phase !== 'idle'}
        />
      </div>

      {/* Idle: manual spin + session selector */}
      {phase === 'idle' && (
        <>
          <Button
            onClick={performSpin}
            className="h-12 w-full text-base font-semibold"
            disabled={stake > balance || balance <= 0}
          >
            Spin reels
          </Button>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Auto-spin session</div>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => startSession(count)}
                  disabled={stake > balance || balance <= 0}
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  {count} spins
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* During session: stop button */}
      {session && phase !== 'idle' && phase !== 'sessionComplete' && (
        <Button
          onClick={stopSession}
          variant="outline"
          className="h-11 w-full"
        >
          Stop session
        </Button>
      )}
    </div>
  );

  // -- tabs ------------------------------------------------------------------

  const tabContent = [
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          {payTable.map((row) => (
            <div
              key={row.outcome}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                result?.outcome === row.outcome
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-white/8 bg-white/4 text-muted-foreground'
              }`}
            >
              <span>{row.label}</span>
              <div className="flex gap-4 font-mono-game">
                <span className="w-12 text-right">{row.probability}</span>
                <span className="w-10 text-right">{row.multiplier > 0 ? `${row.multiplier}x` : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Three live digits stop the reels from left to right.</p>
          <p>Matching patterns settle according to the pay table.</p>
          <p>After any win, you can enter a 50/50 double-or-nothing round (up to {MAX_GAMBLE_ROUNDS}x).</p>
          <p>Auto-spin sessions run 10, 50, or 100 spins. Wins pause for your gamble decision.</p>
        </div>
      ),
    },
    {
      id: 'stats',
      label: 'Stats',
      content: (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
            Mode
            <div className="mt-1 font-mono-game text-sm text-foreground">
              {session ? `Session ${session.completed}/${session.total}` : 'Manual'}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
            Line
            <div className="mt-1 font-mono-game text-sm text-foreground">
              {reels.every((d) => d !== null) ? reels.join(' ') : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
            Bank
            <div className="mt-1 font-mono-game text-sm text-foreground">{bank ? bank.toFixed(0) : '0'}</div>
          </div>
        </div>
      ),
    },
  ];

  // -- render ----------------------------------------------------------------

  return (
    <GameLayout
      ticks={ticks}
      highlightedTicks={highlightedTicks}
      lastConsumedTick={lastConsumedTick}
      extractionKey={extractionKey}
      marketSummary="Three consecutive live digits stop the reels from left to right."
      statusLine={<GameStatusLine>{statusText}</GameStatusLine>}
      playArea={playArea}
      controls={controls}
      tabs={tabContent}
    />
  );
}
