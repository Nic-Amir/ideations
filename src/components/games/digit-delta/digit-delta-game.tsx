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
          <strong className="text-on-prominent">1. Build</strong> — Draw a free
          face, set stake, call Higher or Lower to grow your digit streak.
        </p>
        <p>
          <strong className="text-on-prominent">2. Hold</strong> — Lock your
          length (at least 2; 3 is recommended), then the dealer plays.
        </p>
        <p>
          <strong className="text-on-prominent">3. Beat the dealer</strong> —
          Win if your length beats theirs. Paid on Δ. Ties refund stake.
        </p>
      </div>
    ),
  },
  {
    id: 'dealer',
    label: 'Dealer rules',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>House policy is fixed — no choice:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Face 0–4 → must call Higher</li>
          <li>Face 5 → Stand (settle now)</li>
          <li>Face 6–9 → must call Lower</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Δ payouts',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>Total return including stake:</p>
        <p className="font-display tabular-nums text-on-prominent">
          Δ1 2.7× · Δ2 3.65× · Δ3 4.9× · Δ4 6.8× · Δ5+ 9.5×
        </p>
        <p>~97% RTP if you Hold around length 3.</p>
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
    tableTick,
    liveTick,
    liveDigit,
    extractionKey,
    settleCompare,
    pendingCall,
    dealerBanner,
    playerDigits,
    dealerDigits,
    pLen,
    dLen,
    liveDelta,
    projectedPayoutUsdt,
    holdHint,
    stepId,
    headline,
    holdAllowed,
    higherOffered,
    lowerOffered,
    faceDigit,
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
  const showDealerColumn =
    dealerDigits.length > 0 ||
    awaitingDealer ||
    (phase === 'settled' && (result?.dealerLen ?? 0) > 0);
  const holdRecommended = playerDecision && pLen >= 3;

  const resultTitle =
    result?.outcome === 'WON'
      ? `Won · Δ${result.delta}`
      : result?.outcome === 'REFUNDED'
        ? 'Push · stake back'
        : result?.settleReason === 'player_bust'
          ? result.pickLabel
            ? `Bust · called ${result.pickLabel}`
            : 'Bust'
          : 'Dealer outran you';

  const resultSubtitle = result
    ? result.settleReason === 'player_bust' && result.compareLine
      ? `${result.compareLine}${result.reasonLabel ? ` · ${result.reasonLabel}` : ''}`
      : result.reasonLabel ??
        `You ${result.playerLen} · Dealer ${result.dealerLen}`
    : undefined;

  const autoDismissMs =
    result?.outcome === 'LOST' && result.settleReason === 'player_bust'
      ? 5000
      : 3500;

  return (
    <GameShell title="Digit Delta" infoSections={INFO_SECTIONS} showSymbolPicker>
      <GameViewport
        play={
          <DigitDeltaFace
            phase={phase}
            headline={headline}
            stepId={stepId}
            tableTick={tableTick}
            liveTick={liveTick}
            liveDigit={liveDigit}
            extractionKey={extractionKey}
            settleCompare={settleCompare}
            pendingCall={pendingCall}
            playerDigits={playerDigits}
            dealerDigits={dealerDigits}
            dealerBanner={dealerBanner}
            pLen={pLen}
            dLen={dLen}
            liveDelta={liveDelta}
            projectedPayoutUsdt={projectedPayoutUsdt}
            showDealerColumn={showDealerColumn}
            canDrawAgain={ready && !drawing}
            onDrawAgain={() => void drawFace()}
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
                <GameNotice tone="info">Drawing face digit…</GameNotice>
              </div>
            ) : null}

            {awaitingPlayer ? (
              <div className="px-4">
                <GameNotice tone="info">
                  {pendingCall
                    ? `Waiting ${pendingCall.pick === 'higher' ? 'Higher' : 'Lower'} vs ${pendingCall.face}…`
                    : 'Next tick settles your call…'}
                </GameNotice>
              </div>
            ) : null}

            {awaitingDealer ? (
              <div className="px-4">
                <GameNotice tone="info">
                  {dealerBanner ?? "Dealer's turn…"}
                </GameNotice>
              </div>
            ) : null}

            {(needDraw || (drawing && playerDigits.length === 0)) &&
            marketReady ? (
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

            {ready ? (
              <>
                <div className="px-4">
                  <p className="mb-2 text-center text-xs text-on-subtle">
                    Stake locks on your first Higher / Lower call
                  </p>
                  <StakeDock
                    stake={stake}
                    max={maxStake}
                    balance={balance}
                    onStakeChange={setStake}
                    stakeDisabled={!ready}
                  />
                </div>
                <div className="px-4">
                  <DigitDeltaPickStrip
                    higherOffered={higherOffered}
                    lowerOffered={lowerOffered}
                    canPick={canPick}
                    onTap={(p) => void placePick(p)}
                    faceDigit={faceDigit}
                    mode="start"
                  />
                </div>
              </>
            ) : null}

            {playerDecision ? (
              <>
                <div className="px-4">
                  <DigitDeltaPickStrip
                    higherOffered={higherOffered}
                    lowerOffered={lowerOffered}
                    canPick={canPick}
                    onTap={(p) => void placePick(p)}
                    faceDigit={faceDigit}
                    mode="collect"
                  />
                </div>
                {holdAllowed ? (
                  <div className="flex flex-col gap-1.5 px-4">
                    <Button
                      variant={holdRecommended ? 'primary' : 'secondary'}
                      className="w-full min-h-[48px]"
                      onClick={() => void onHold()}
                    >
                      {holdRecommended
                        ? 'Hold · recommended'
                        : 'Hold · lock length'}
                    </Button>
                    {holdHint ? (
                      <p className="text-center text-[11px] text-on-subtle">
                        {holdHint}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="px-4 text-center text-[11px] text-on-subtle">
                    Collect one more digit before you can Hold
                  </p>
                )}
              </>
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
        title={resultTitle}
        subtitle={resultSubtitle}
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
        autoDismissMs={autoDismissMs}
        showAutoDismissBar
      />
    </GameShell>
  );
}
