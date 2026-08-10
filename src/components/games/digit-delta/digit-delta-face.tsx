'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DigitExtraction } from '@/components/games/shared/digit-extraction';
import type { ParsedTick } from '@/types';
import type {
  DigitDeltaPhase,
  DigitDeltaStepId,
  PendingCall,
  SettleCompare,
} from '@/hooks/use-digit-delta';
import { cn } from '@/lib/utils';

const STEPS: { id: DigitDeltaStepId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'hold', label: 'Hold' },
  { id: 'dealer', label: 'Dealer' },
  { id: 'result', label: 'Result' },
];

interface DigitDeltaFaceProps {
  phase: DigitDeltaPhase;
  headline: string;
  stepId: DigitDeltaStepId;
  tableTick: ParsedTick | null;
  liveTick: ParsedTick | null;
  liveDigit: number | null;
  extractionKey: number;
  settleCompare: SettleCompare | null;
  pendingCall: PendingCall | null;
  playerDigits: number[];
  dealerDigits: number[];
  dealerBanner: string | null;
  pLen: number;
  dLen: number;
  liveDelta: number | null;
  projectedPayoutUsdt: number;
  showDealerColumn: boolean;
  onDrawAgain?: () => void;
  canDrawAgain?: boolean;
}

function compareCue(compare: SettleCompare): { label: string; tone: string } {
  return {
    label: compare.reasonLabel,
    tone: compare.won ? 'text-semantic-win' : 'text-semantic-loss',
  };
}

export function DigitDeltaFace({
  phase,
  headline,
  stepId,
  tableTick,
  liveTick,
  liveDigit,
  extractionKey,
  settleCompare,
  pendingCall,
  playerDigits,
  dealerDigits,
  dealerBanner,
  pLen,
  dLen,
  liveDelta,
  projectedPayoutUsdt,
  showDealerColumn,
  onDrawAgain,
  canDrawAgain,
}: DigitDeltaFaceProps) {
  const extractionTick =
    settleCompare && liveTick && liveTick.lastDigit === settleCompare.settlementDigit
      ? liveTick
      : tableTick;

  const showExtraction =
    Boolean(extractionTick) &&
    (phase === 'ready' ||
      phase === 'drawing' ||
      phase === 'player_decision' ||
      phase === 'awaiting_player_tick' ||
      phase === 'awaiting_dealer_face' ||
      phase === 'awaiting_dealer_tick' ||
      phase === 'settled' ||
      Boolean(settleCompare));

  const showDelta =
    showDealerColumn ||
    phase === 'awaiting_dealer_face' ||
    phase === 'player_decision';

  const deltaTone =
    liveDelta === null
      ? 'neutral'
      : liveDelta > 0
        ? 'lead'
        : liveDelta === 0
          ? 'push'
          : 'behind';

  const awaitingLine = pendingCall
    ? `Waiting ${pendingCall.pick === 'higher' ? 'Higher' : pendingCall.pick === 'lower' ? 'Lower' : 'Stand'} vs ${pendingCall.face}`
    : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-4">
      <StepRail active={stepId} />

      <p className="text-center text-sm font-medium text-on-prominent">{headline}</p>

      {/* Persistent live feed — Ladder-style */}
      <div className="flex items-center gap-2 text-xs text-on-subtle">
        <span className="uppercase tracking-wide">Live</span>
        <span
          className={cn(
            'inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-subtle font-display text-sm font-bold tabular-nums text-on-prominent',
            liveDigit === null && 'text-on-subtle',
          )}
        >
          {liveDigit ?? '—'}
        </span>
        {liveTick?.quote ? (
          <span className="tabular-nums opacity-80">{liveTick.quote}</span>
        ) : null}
      </div>

      {showExtraction && extractionTick ? (
        <DigitExtraction tick={extractionTick} triggerKey={extractionKey} />
      ) : null}

      {awaitingLine ? (
        <p className="text-center text-xs font-semibold text-primary tabular-nums">
          {awaitingLine}
        </p>
      ) : null}

      {settleCompare ? (
        <motion.div
          key={`${settleCompare.side}-${settleCompare.settlementDigit}-${extractionKey}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-0.5"
        >
          <p className="font-display text-base tabular-nums text-on-prominent">
            {settleCompare.side === 'dealer' ? 'Dealer · ' : 'You · '}
            <span>{settleCompare.entryDigit}</span>
            <span className="mx-2 text-on-subtle">→</span>
            <span>{settleCompare.settlementDigit}</span>
          </p>
          <p className={cn('text-sm font-semibold', compareCue(settleCompare).tone)}>
            {compareCue(settleCompare).label}
          </p>
        </motion.div>
      ) : null}

      <div className="grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
        <HandColumn
          label="You"
          digits={playerDigits}
          length={pLen}
          tone="player"
          active={
            phase === 'ready' ||
            phase === 'player_decision' ||
            phase === 'awaiting_player_tick' ||
            phase === 'drawing'
          }
        />

        <DeltaBadge
          show={showDelta}
          liveDelta={liveDelta}
          projectedPayoutUsdt={projectedPayoutUsdt}
          tone={deltaTone}
          settled={phase === 'settled'}
        />

        <HandColumn
          label="Dealer"
          digits={dealerDigits}
          length={dLen}
          tone="dealer"
          active={
            phase === 'awaiting_dealer_face' ||
            phase === 'awaiting_dealer_tick'
          }
          placeholder={!showDealerColumn}
          banner={showDealerColumn ? dealerBanner : null}
        />
      </div>

      {phase === 'ready' && canDrawAgain && onDrawAgain ? (
        <button
          type="button"
          onClick={onDrawAgain}
          className="min-h-[44px] px-3 text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          Draw again
        </button>
      ) : null}
    </div>
  );
}

function StepRail({ active }: { active: DigitDeltaStepId }) {
  const activeIndex = STEPS.findIndex((s) => s.id === active);
  return (
    <ol className="flex w-full max-w-sm items-center gap-0.5 px-1">
      {STEPS.map((step, i) => {
        const isActive = step.id === active;
        const isDone = i < activeIndex;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-0.5">
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums',
                  isActive
                    ? 'bg-primary text-on-prominent-static-inverse'
                    : isDone
                      ? 'bg-primary/20 text-primary'
                      : 'bg-subtle text-on-subtle',
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  'text-[9px] uppercase tracking-wide',
                  isActive ? 'font-semibold text-on-prominent' : 'text-on-subtle',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <div
                className={cn(
                  'mb-3 h-px flex-1',
                  i < activeIndex ? 'bg-primary/40' : 'bg-border-subtle',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DeltaBadge({
  show,
  liveDelta,
  projectedPayoutUsdt,
  tone,
  settled,
}: {
  show: boolean;
  liveDelta: number | null;
  projectedPayoutUsdt: number;
  tone: 'neutral' | 'lead' | 'push' | 'behind';
  settled: boolean;
}) {
  if (!show) {
    return <div className="flex w-14 flex-col items-center pt-6" />;
  }

  const label =
    liveDelta === null
      ? 'Δ'
      : liveDelta > 0
        ? `Δ${liveDelta}`
        : liveDelta === 0
          ? 'Push'
          : `−${Math.abs(liveDelta)}`;

  const sub =
    liveDelta === null
      ? 'vs dealer'
      : liveDelta > 0
        ? projectedPayoutUsdt > 0
          ? `~${projectedPayoutUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : 'you lead'
        : liveDelta === 0
          ? 'stake back'
          : 'behind';

  return (
    <div className="flex w-14 flex-col items-center pt-5">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${label}-${settled}`}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: settled ? [1, 1.08, 1] : 1, opacity: 1 }}
          transition={{ duration: settled ? 0.45 : 0.2 }}
          className={cn(
            'flex min-h-[3rem] w-full flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center',
            tone === 'lead' && 'border-semantic-win/40 bg-semantic-win/10',
            tone === 'push' && 'border-border-subtle bg-subtle',
            tone === 'behind' && 'border-semantic-loss/40 bg-semantic-loss/10',
            tone === 'neutral' && 'border-border-subtle bg-subtle/60',
          )}
        >
          <span
            className={cn(
              'font-display text-lg font-black tabular-nums',
              tone === 'lead' && 'text-semantic-win',
              tone === 'behind' && 'text-semantic-loss',
              (tone === 'push' || tone === 'neutral') && 'text-on-prominent',
            )}
          >
            {label}
          </span>
          <span className="text-[9px] leading-tight text-on-subtle tabular-nums">
            {sub}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function HandColumn({
  label,
  digits,
  length,
  tone,
  active,
  placeholder,
  banner,
}: {
  label: string;
  digits: number[];
  length: number;
  tone: 'player' | 'dealer';
  active?: boolean;
  placeholder?: boolean;
  banner?: string | null;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[9rem] flex-col gap-2 rounded-xl border p-2.5',
        active ? 'border-primary/35 bg-primary/5' : 'border-border-subtle bg-subtle/30',
        placeholder && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-on-prominent">{label}</span>
        <span className="font-display text-xs tabular-nums text-on-subtle">
          len {length}
        </span>
      </div>

      {banner ? (
        <motion.p
          key={banner}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-md bg-subtle px-2 py-1 text-[10px] font-medium leading-snug text-on-prominent"
        >
          {banner}
        </motion.p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {placeholder && digits.length === 0 ? (
          <span className="text-xs text-on-subtle">Waiting…</span>
        ) : digits.length === 0 ? (
          <span className="text-xs text-on-subtle">—</span>
        ) : (
          digits.map((d, i) => (
            <motion.span
              key={`${tone}-${i}-${d}`}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg font-display text-sm font-bold tabular-nums',
                tone === 'player'
                  ? 'bg-primary/15 text-on-prominent'
                  : 'bg-subtle text-on-prominent',
                i === digits.length - 1 && 'ring-2 ring-primary/45',
              )}
            >
              {d}
            </motion.span>
          ))
        )}
      </div>
    </div>
  );
}
