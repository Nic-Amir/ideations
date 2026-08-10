'use client';

import { Button } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { DigitDeltaPickStrip } from '@/components/games/digit-delta/digit-delta-pick-strip';
import { DigitDeltaFace } from '@/components/games/digit-delta/digit-delta-face';
import { useDigitDelta } from '@/hooks/use-digit-delta';
import { cn } from '@/lib/utils';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Draw a free face digit, stake once, then call Higher or Lower to
          collect a streak. Hold when you are ready (length ≥ 2).
        </p>
        <p>
          The dealer must follow house rules: 0–4 Higher, 5 Stand, 6–9 Lower —
          until they stand or bust. You win the length Δ vs the dealer. Ties
          refund your stake.
        </p>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Δ payouts',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Fixed total return on Δ = your length − dealer length: 2.7× · 3.65× ·
          4.9× · 6.8× · 9.5× (Δ1…Δ5+). Tuned near ~97% RTP if you Hold around
          length 3.
        </p>
      </div>
    ),
  },
];

export function DigitDeltaGame() {
  const {
    stake,
    setStake,
    phase,
    result,
    history,
    playError,
    revealDigit,
    faceDigit,
    tableTick,
    liveDigit,
    liveTick,
    extractionKey,
    settleCompare,
    dealerChip,
    playerDigits,
    dealerDigits,
    pLen,
    dLen,
    holdAllowed,
    higherOffered,
    lowerOffered,
    payLegend,
    balance,
    maxStake,
    marketReady,
    canTrade,
    placePick,
    onHold,
    dismissResult,
    drawFace,
  } = useDigitDelta();

  const needDraw = phase === 'need_draw';
  const drawing = phase === 'drawing';
  const ready = phase === 'ready';
  const playerDecision = phase === 'player_decision';
  const awaitingPlayer = phase === 'awaiting_player_tick';
  const awaitingDealer =
    phase === 'awaiting_dealer_face' || phase === 'awaiting_dealer_tick';
  const canPick = (ready && canTrade) || playerDecision;

  return (
    <GameShell title="Digit Delta" infoSections={INFO_SECTIONS} showSymbolPicker>
      <GameViewport
        play={
          <DigitDeltaFace
            phase={phase}
            faceDigit={faceDigit}
            revealDigit={revealDigit}
            tableTick={tableTick}
            liveTick={liveTick}
            liveDigit={liveDigit}
            extractionKey={extractionKey}
            settleCompare={settleCompare}
            playerDigits={playerDigits}
            dealerDigits={dealerDigits}
            dealerChip={dealerChip}
            pLen={pLen}
            dLen={dLen}
          />
        }
        dock={
          <div className="flex flex-col gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {playError ? (
              <div className="px-4">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {!marketReady && (needDraw || ready) ? (
              <div className="px-4">
                <GameNotice tone="info">Waiting for ticks…</GameNotice>
              </div>
            ) : null}

            {drawing ? (
              <div className="px-4">
                <GameNotice tone="info">Drawing from next tick…</GameNotice>
              </div>
            ) : null}

            {awaitingPlayer ? (
              <div className="px-4">
                <GameNotice tone="info">Next tick settles your call…</GameNotice>
              </div>
            ) : null}

            {awaitingDealer ? (
              <div className="px-4">
                <GameNotice tone="info">
                  {phase === 'awaiting_dealer_face'
                    ? 'Dealer face incoming…'
                    : 'Dealer must draw…'}
                </GameNotice>
              </div>
            ) : null}

            {(needDraw || (drawing && faceDigit === null)) && marketReady ? (
              <div className="px-4">
                <Button
                  variant="primary"
                  className="w-full min-h-[48px]"
                  disabled={drawing}
                  onClick={() => void drawFace()}
                >
                  {drawing ? 'Drawing…' : 'Draw to start'}
                </Button>
              </div>
            ) : null}

            {ready || playerDecision ? (
              <div className="flex flex-wrap justify-center gap-2 px-4 text-[11px] text-on-subtle">
                {payLegend.map((row) => (
                  <span key={row.delta} className="tabular-nums">
                    Δ{row.delta}{' '}
                    <span className="font-display text-on-prominent">
                      {row.mult}×
                    </span>
                  </span>
                ))}
              </div>
            ) : null}

            {ready ? (
              <StakeDock
                stake={stake}
                max={maxStake}
                balance={balance}
                onStakeChange={setStake}
                stakeDisabled={!ready}
              />
            ) : null}

            {playerDecision ? (
              <div className="flex flex-col gap-2 px-4">
                <div className="flex items-center justify-between text-xs text-on-subtle">
                  <span>
                    Your length{' '}
                    <span className="font-display font-semibold tabular-nums text-on-prominent">
                      {pLen}
                    </span>
                  </span>
                  <span className="text-on-subtle">Hold recommended at 3</span>
                </div>
                <Button
                  variant="primary"
                  className="w-full min-h-[48px]"
                  disabled={!holdAllowed}
                  onClick={() => void onHold()}
                >
                  Hold · beat the dealer
                </Button>
              </div>
            ) : null}

            {(ready || playerDecision) && !awaitingPlayer ? (
              <div className="px-4">
                <DigitDeltaPickStrip
                  higherOffered={higherOffered}
                  lowerOffered={lowerOffered}
                  canPick={canPick}
                  onTap={(p) => void placePick(p)}
                  faceDigit={faceDigit}
                />
              </div>
            ) : null}

            {history.length > 0 && (ready || needDraw) ? (
              <p className="px-4 text-center text-xs text-on-subtle">
                Last {Math.min(history.length, 5)}:{' '}
                {history.slice(0, 5).map((h, i) => (
                  <span
                    key={`${h.outcome}-${i}`}
                    className={cn(
                      'font-display tabular-nums mx-0.5',
                      h.outcome === 'WON'
                        ? 'text-semantic-win'
                        : h.outcome === 'REFUNDED'
                          ? 'text-on-prominent'
                          : 'text-semantic-loss',
                    )}
                  >
                    {h.outcome === 'WON'
                      ? `Δ${h.delta}`
                      : h.outcome === 'REFUNDED'
                        ? 'tie'
                        : 'bust'}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        }
      />

      <ResultOverlay
        open={phase === 'settled' && result !== null}
        won={result?.outcome === 'WON'}
        title={
          result?.outcome === 'WON'
            ? `Won · Δ${result.delta}`
            : result?.outcome === 'REFUNDED'
              ? 'Push · stake back'
              : result?.settleReason === 'player_bust'
                ? 'Bust'
                : 'Dealer outran you'
        }
        subtitle={
          result
            ? `You ${result.playerLen} · Dealer ${result.dealerLen}`
            : undefined
        }
        amount={
          result?.outcome === 'LOST' ? result.stakeUsdt : result?.payoutUsdt
        }
        amountLabel={
          result?.outcome === 'WON'
            ? 'Payout'
            : result?.outcome === 'REFUNDED'
              ? 'Refund'
              : 'Lost stake'
        }
        tier={
          result
            ? result.outcome === 'REFUNDED'
              ? 'push'
              : getResultTierFromPayout(
                  result.outcome === 'WON'
                    ? result.payoutUsdt / Math.max(result.stakeUsdt, 1e-9)
                    : 0,
                )
            : 'loss'
        }
        onDismiss={dismissResult}
        autoDismissMs={3500}
        showAutoDismissBar
      />
    </GameShell>
  );
}
