'use client';

import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { DigitDeltaPickStrip } from '@/components/games/digit-delta/digit-delta-pick-strip';
import { DigitDeltaFace } from '@/components/games/digit-delta/digit-delta-face';
import { useDigitDelta, type DigitDeltaResult } from '@/hooks/use-digit-delta';
import { cn } from '@/lib/utils';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          <strong className="text-on-prominent">1. Build</strong> — Draw a free
          face, set stake, call Higher or Lower to grow your digit streak. Same
          digit → reroll (not collected, hand unchanged).
        </p>
        <p>
          <strong className="text-on-prominent">2. Hold</strong> — Lock your
          length (at least 2; 3 is the sweet spot), then the dealer plays. Reach
          length 6 for a fixed jackpot — dealer does not play.
        </p>
        <p>
          <strong className="text-on-prominent">3. Beat the dealer</strong> —
          Dealer bust → you win (Δ = length diff). Stand → win if your length is
          longer; paid on Δ. Ties refund stake.
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
          <li>Same floor as you: must call after the opening digit</li>
          <li>Face 0–3 → Higher</li>
          <li>Face 4–6 → Stand once length ≥ 2</li>
          <li>Face 7–9 → Lower</li>
          <li>On length 1 with 4–6 → still calls (Higher on ≤5, Lower on ≥6)</li>
        </ul>
        <p>
          Dealer bust → you win with Δ = your length − dealer length (at least
          Δ1). Stand → same Δ formula.
        </p>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Δ payouts',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>Tapered total return including stake:</p>
        <p className="font-display tabular-nums text-on-prominent">
          Δ1 2.25× · Δ2 2.55× · Δ3 2.8× · Δ4 3× · Δ5+ 3.15×
        </p>
        <p>
          Length-6 jackpot: <strong className="text-on-prominent">3.6×</strong>{' '}
          fixed. Hold around 3 for ~98.5% RTP — longer is spicier, not better EV.
        </p>
      </div>
    ),
  },
];

function resultTitleFor(result: DigitDeltaResult): string {
  switch (result.settleReason) {
    case 'auto_win_cap':
      return 'Jackpot · length 6';
    case 'dealer_bust':
      return 'Dealer bust · you win';
    case 'length_win':
      return `Won · Δ${result.delta}`;
    case 'length_tie':
      return 'Push · stake back';
    case 'length_loss':
      return 'Dealer longer';
    case 'player_bust':
      return result.pickLabel
        ? `Bust · called ${result.pickLabel}`
        : 'Bust';
    default:
      if (result.outcome === 'WON') return `Won · Δ${result.delta}`;
      if (result.outcome === 'REFUNDED') return 'Push · stake back';
      return 'Round over';
  }
}

function dealerStopLabel(reason: DigitDeltaResult['dealerStopReason']): string | null {
  if (reason === 'bust') return 'Dealer stopped · bust';
  if (reason === 'stand') return 'Dealer stopped · stand';
  return null;
}

function DeltaResultDetails({ result }: { result: DigitDeltaResult }) {
  const stop = dealerStopLabel(result.dealerStopReason);
  return (
    <div className="mx-auto w-full max-w-xs space-y-2 rounded-lg border border-border-subtle bg-subtle/40 px-3 py-2.5 text-left text-xs">
      <div className="flex justify-between gap-3 tabular-nums">
        <span className="text-on-subtle">You</span>
        <span className="font-display text-on-prominent">
          {result.playerDigits.join(' · ') || '—'}{' '}
          <span className="text-on-subtle">· len {result.playerLen}</span>
        </span>
      </div>
      <div className="flex justify-between gap-3 tabular-nums">
        <span className="text-on-subtle">Dealer</span>
        <span className="font-display text-on-prominent">
          {result.dealerDigits.length > 0
            ? result.dealerDigits.join(' · ')
            : '—'}{' '}
          <span className="text-on-subtle">· len {result.dealerLen}</span>
        </span>
      </div>
      <div className="flex justify-between gap-3 border-t border-border-subtle pt-2 tabular-nums">
        <span className="text-on-subtle">Δ</span>
        <span className="font-display font-semibold text-on-prominent">
          {result.delta}
          {result.payoutMult > 0 ? ` · ${result.payoutMult}×` : ''}
        </span>
      </div>
      {result.compareLine ? (
        <p className="text-on-subtle tabular-nums">
          Last compare {result.compareLine}
          {result.pickLabel ? ` · ${result.pickLabel}` : ''}
        </p>
      ) : null}
      {stop ? <p className="text-on-subtle">{stop}</p> : null}
    </div>
  );
}

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
    ticks,
    highlightedTicks,
    lastConsumedTick,
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

  const marketStripReady = ticks.length > 0 || lastConsumedTick !== null;

  const resultTitle = result ? resultTitleFor(result) : '';
  const resultSubtitle = result
    ? result.settleReason === 'player_bust' && result.compareLine
      ? `${result.compareLine}${result.reasonLabel ? ` · ${result.reasonLabel}` : ''}`
      : result.reasonLabel ??
        `You ${result.playerLen} · Dealer ${result.dealerLen}`
    : undefined;

  const autoDismissMs =
    result?.settleReason === 'player_bust' ||
    result?.settleReason === 'dealer_bust' ||
    result?.settleReason === 'length_win' ||
    result?.settleReason === 'length_loss' ||
    result?.settleReason === 'auto_win_cap'
      ? 5500
      : 3500;

  return (
    <GameShell title="Digit Delta" infoSections={INFO_SECTIONS} showSymbolPicker>
      <GameViewport
        market={
          marketStripReady ? (
            <MiniMarketStrip
              ticks={ticks}
              highlightedTicks={highlightedTicks}
              lastConsumedTick={lastConsumedTick}
              extractionKey={extractionKey}
            />
          ) : (
            <div className="flex shrink-0 items-center justify-center border-b border-border-subtle py-6">
              <Spinner />
            </div>
          )
        }
        play={
          <DigitDeltaFace
            phase={phase}
            headline={headline}
            stepId={stepId}
            tableTick={tableTick}
            liveTick={liveTick}
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
        details={result ? <DeltaResultDetails result={result} /> : undefined}
      />
    </GameShell>
  );
}
