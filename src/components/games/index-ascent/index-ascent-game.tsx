'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { Minus, Plus, ShieldCheck, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBalanceStore } from '@/stores/balance-store';
import { useIsLandscape } from '@/hooks/use-landscape';
import { useIndexAscent, type AscentRoundResult } from '@/hooks/use-index-ascent';
import {
  CRASH_HOUSE_EDGE,
  getMilestoneTable,
  getPerTickCrashProbability,
  getSurvivalProbability,
  getTicksToReachMultiplier,
  MIN_CASHOUT_MULTIPLIER,
} from '@/lib/games/index-ascent';
import { CRASH_SYMBOLS } from '@/types';
import type { CrashSymbol, CrashSymbolInfo, IndexAscentState } from '@/types';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import { LiveTickChart } from '@/components/games/shared/live-tick-chart';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import { AscentCurve } from './ascent-curve';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';

const AUTO_CASHOUT_PRESETS = [1.5, 2, 5, 10] as const;
type AutoExitMode = 'off' | 'preset' | 'custom';

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString();
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function PositionTicket({
  symbol,
  onSymbolChange,
  autoExitMode,
  presetTarget,
  customTarget,
  onAutoExitModeChange,
  onPresetTargetChange,
  onCustomTargetChange,
  customTargetValid,
  target,
  stake,
}: {
  symbol: CrashSymbol;
  onSymbolChange: (symbol: CrashSymbol) => void;
  autoExitMode: AutoExitMode;
  presetTarget: number;
  customTarget: string;
  onAutoExitModeChange: (mode: AutoExitMode) => void;
  onPresetTargetChange: (target: number) => void;
  onCustomTargetChange: (target: string) => void;
  customTargetValid: boolean;
  target: number | null;
  stake: number;
}) {
  const info = CRASH_SYMBOLS.find((item) => item.id === symbol)!;
  const perTickRisk = getPerTickCrashProbability(info.avgTicksPerCrash);
  const targetTicks = target ? getTicksToReachMultiplier(target, info.avgTicksPerCrash) : null;
  const targetSurvival = targetTicks !== null
    ? getSurvivalProbability(targetTicks, info.avgTicksPerCrash)
    : null;
  const targetReturn = target ? stake * target : null;

  return (
    <section aria-label="Position ticket" className="rounded-xl border border-border-subtle bg-subtle/65 p-3 shadow-sm [@media(max-height:520px)]:p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Position ticket</p>
          <p className="text-xs font-semibold text-on-prominent [@media(max-height:520px)]:hidden">Choose market and exit protection</p>
        </div>
        <span className="rounded-full bg-prominent px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-on-subtle">Ready</span>
      </div>

      <div className="mt-3 [@media(max-height:520px)]:mt-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-semibold uppercase tracking-wide text-on-subtle">Crash index</span>
          <span className="tabular-nums text-semantic-loss">{percent(perTickRisk, perTickRisk < 0.01 ? 2 : 1)} correction / tick</span>
        </div>
        <div role="radiogroup" aria-label="Crash index" className="grid grid-cols-3 gap-1.5">
          {CRASH_SYMBOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={symbol === item.id}
              onClick={() => onSymbolChange(item.id)}
              className={cn(
                'min-h-[44px] rounded-lg border px-2 text-center transition-colors',
                symbol === item.id
                  ? 'border-border-prominent bg-prominent text-on-prominent shadow-sm'
                  : 'border-border-subtle text-on-subtle hover:text-on-prominent',
              )}
            >
              <span className="block font-display text-sm font-bold">{item.name.replace('Crash ', '')}</span>
              <span className="block text-[8px] font-medium uppercase tracking-wide opacity-75">1 in {item.avgTicksPerCrash}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-on-subtle [@media(max-height:520px)]:hidden">{info.description}</p>
      </div>

      <div className="mt-3 [@media(max-height:520px)]:mt-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-semibold uppercase tracking-wide text-on-subtle">Auto exit</span>
          <span className="text-on-subtle [@media(max-height:520px)]:hidden">Optional protection</span>
          <span className="hidden tabular-nums text-on-subtle [@media(max-height:520px)]:inline">
            {targetSurvival !== null && targetReturn !== null
              ? `${percent(targetSurvival)} survive · ${formatCredits(targetReturn)} return`
              : 'Manual exit'}
          </span>
        </div>
        <div role="radiogroup" aria-label="Auto exit target" className="grid grid-cols-6 gap-1">
          <button
            type="button"
            role="radio"
            aria-checked={autoExitMode === 'off'}
            onClick={() => onAutoExitModeChange('off')}
            className={cn(
              'min-h-[44px] rounded-lg text-[10px] font-semibold transition-colors',
              autoExitMode === 'off' ? 'bg-prominent text-on-prominent shadow-sm' : 'text-on-subtle',
            )}
          >
            Off
          </button>
          {AUTO_CASHOUT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={autoExitMode === 'preset' && presetTarget === preset}
              onClick={() => onPresetTargetChange(preset)}
              className={cn(
                'min-h-[44px] rounded-lg font-display text-[10px] font-semibold tabular-nums transition-colors',
                autoExitMode === 'preset' && presetTarget === preset
                  ? 'bg-prominent text-on-prominent shadow-sm'
                  : 'text-on-subtle',
              )}
            >
              {preset}×
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={autoExitMode === 'custom'}
            onClick={() => onAutoExitModeChange('custom')}
            className={cn(
              'min-h-[44px] rounded-lg text-[10px] font-semibold transition-colors',
              autoExitMode === 'custom' ? 'bg-prominent text-on-prominent shadow-sm' : 'text-on-subtle',
            )}
          >
            Custom
          </button>
        </div>
        {autoExitMode === 'custom' ? (
          <div className="mt-2">
            <label htmlFor="ascent-custom-target" className="sr-only">Custom auto-exit multiplier</label>
            <div className={cn('flex min-h-[44px] items-center rounded-lg border bg-prominent px-3', customTargetValid ? 'border-border-subtle' : 'border-semantic-loss')}>
              <Target className="mr-2 h-4 w-4 text-on-subtle" />
              <input
                id="ascent-custom-target"
                type="number"
                inputMode="decimal"
                min={MIN_CASHOUT_MULTIPLIER}
                max={100}
                step="0.01"
                value={customTarget}
                onChange={(event) => onCustomTargetChange(event.target.value)}
                aria-invalid={!customTargetValid}
                aria-describedby={!customTargetValid ? 'ascent-custom-target-error' : undefined}
                className="min-w-0 flex-1 bg-transparent font-display text-sm font-bold tabular-nums text-on-prominent outline-none"
              />
              <span className="text-xs text-on-subtle">× target</span>
            </div>
            {!customTargetValid ? (
              <p id="ascent-custom-target-error" className="mt-1 text-[10px] text-semantic-loss">Enter a target from 1.01× to 100×.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-prominent px-2 py-2 text-center [@media(max-height:520px)]:hidden">
        <div>
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Target survival</p>
          <p className="font-display text-xs font-bold tabular-nums text-on-prominent">{targetSurvival !== null ? percent(targetSurvival) : 'Manual'}</p>
        </div>
        <div className="border-x border-border-subtle">
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Target time</p>
          <p className="font-display text-xs font-bold tabular-nums text-on-prominent">{targetTicks !== null ? `${targetTicks}s` : 'Open'}</p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Projected return</p>
          <p className="font-display text-xs font-bold tabular-nums text-semantic-win">{targetReturn !== null ? formatCredits(targetReturn) : 'Live'}</p>
        </div>
      </div>
    </section>
  );
}

function LivePositionPanel({
  info,
  stake,
  ticksSurvived,
  autoCashout,
}: {
  info: CrashSymbolInfo;
  stake: number;
  ticksSurvived: number;
  autoCashout: number | null;
}) {
  const perTickRisk = getPerTickCrashProbability(info.avgTicksPerCrash);

  return (
    <section aria-label="Live position" className="rounded-xl border border-border-subtle bg-subtle/65 p-3 shadow-sm [@media(max-height:520px)]:p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Locked position</p>
          <p className="text-xs font-semibold text-on-prominent">{info.name} · {autoCashout ? `auto ${autoCashout.toFixed(2)}×` : 'manual exit'}</p>
        </div>
        <span className="rounded-full bg-semantic-win/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-semantic-win">Live</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-prominent px-2 py-2 text-center [@media(max-height:520px)]:mt-2">
        <div>
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Locked stake</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">{formatCredits(stake)}</p>
        </div>
        <div className="border-x border-border-subtle px-2">
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Survived</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">{ticksSurvived} ticks</p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Protection</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">{autoCashout ? `${autoCashout.toFixed(2)}×` : 'Manual'}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums">
        <span className="flex items-center gap-1.5 text-on-prominent"><ShieldCheck className="h-3.5 w-3.5 text-semantic-win" />Position is locked</span>
        <span className="text-semantic-loss">{percent(perTickRisk, perTickRisk < 0.01 ? 2 : 1)} risk / tick</span>
      </div>
    </section>
  );
}

function PositionChart({
  curve,
  phase,
  info,
  stake,
  multiplier,
  ticksSurvived,
  autoCashout,
  marketStreak,
  marketCrashes,
}: {
  curve: number[];
  phase: IndexAscentState;
  info: CrashSymbolInfo;
  stake: number;
  multiplier: number;
  ticksSurvived: number;
  autoCashout: number | null;
  marketStreak: number;
  marketCrashes: number[];
}) {
  const positionValue = stake * multiplier;
  const netPL = positionValue - stake;
  const perTickRisk = getPerTickCrashProbability(info.avgTicksPerCrash);
  const targetProgress = autoCashout
    ? Math.max(0, Math.min(100, ((multiplier - 1) / (autoCashout - 1)) * 100))
    : null;
  const statusLabel = phase === 'flying' ? 'Live' : phase === 'crashed' ? 'Corrected' : phase === 'cashed_out' ? 'Closed' : 'Preview';

  return (
    <section aria-label="Position return" className="relative flex min-h-[300px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-prominent [@media(max-height:520px)]:min-h-[180px]">
      <div className="flex min-h-[38px] items-center gap-2 border-b border-border-subtle px-3 [@media(max-height:520px)]:min-h-[32px]">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <div className="shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-on-subtle">Position return</p>
            <p className="text-[9px] font-medium tabular-nums text-on-prominent [@media(max-height:520px)]:hidden">Survival runway</p>
          </div>
          <span className={cn('rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide', phase === 'flying' ? 'bg-semantic-win/10 text-semantic-win' : phase === 'crashed' ? 'bg-semantic-loss/10 text-semantic-loss' : 'bg-subtle text-on-subtle')}>{statusLabel}</span>
        </div>
        {marketCrashes.length > 0 ? (
          <div className="scrollbar-hide flex min-w-0 gap-1 overflow-x-auto" aria-label="Recent market corrections">
            {marketCrashes.slice(0, 3).map((value, index) => (
              <span key={`${index}-${value}`} className="shrink-0 rounded-full border border-border-subtle bg-subtle px-2 py-1 text-[8px] font-semibold tabular-nums text-on-subtle">↘ {value.toFixed(3)}×</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-border-subtle bg-subtle/45 px-3 py-2 [@media(max-height:520px)]:py-1.5">
        <div>
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Current return</p>
          <p className="font-display text-2xl font-bold leading-none tabular-nums text-on-prominent [@media(max-height:520px)]:text-lg">{multiplier.toFixed(3)}×</p>
        </div>
        <div className="border-l border-border-subtle pl-3">
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Position value</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">{formatCredits(positionValue)}</p>
          <p className="text-[8px] text-on-subtle [@media(max-height:520px)]:hidden">credits</p>
        </div>
        <div className="border-l border-border-subtle pl-3">
          <p className="text-[8px] uppercase tracking-wide text-on-subtle">Net P/L</p>
          <p className={cn('font-display text-sm font-bold tabular-nums', netPL > 0 ? 'text-semantic-win' : netPL < 0 ? 'text-semantic-loss' : 'text-on-prominent')}>{netPL > 0 ? '+' : netPL < 0 ? '−' : ''}{formatCredits(Math.abs(netPL))}</p>
          <p className="text-[8px] text-on-subtle [@media(max-height:520px)]:hidden">credits</p>
        </div>
      </div>

      {targetProgress !== null ? (
        <div className="border-b border-border-subtle px-3 py-1.5 [@media(max-height:520px)]:hidden">
          <div className="mb-1 flex justify-between text-[8px] font-medium tabular-nums text-on-subtle"><span>Target progress</span><span>{targetProgress.toFixed(0)}% to {autoCashout!.toFixed(2)}×</span></div>
          <div className="h-1 overflow-hidden rounded-full bg-border-subtle"><div className="h-full rounded-full bg-semantic-warning transition-[width] duration-300" style={{ width: `${targetProgress}%` }} /></div>
        </div>
      ) : null}

      <div className="relative min-h-[145px] flex-1 [@media(max-height:520px)]:min-h-0">
        <AscentCurve curve={curve} phase={phase} autoCashoutTarget={autoCashout} className="absolute inset-0" />
        {phase === 'idle' ? (
          <div className="pointer-events-none absolute inset-x-[18%] top-1/2 -translate-y-1/2 rounded-lg border border-border-subtle bg-card/90 px-3 py-2 text-center shadow-sm backdrop-blur-sm [@media(max-height:520px)]:hidden">
            <p className="text-[10px] font-semibold text-on-prominent">Your return advances one step per surviving tick</p>
            <p className="mt-0.5 text-[9px] text-on-subtle">Enter a position to start the runway.</p>
          </div>
        ) : null}
        <AnimatePresence>
          {phase === 'crashed' ? (
            <motion.div className="absolute inset-0 bg-semantic-loss/15" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4] }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex min-h-[26px] items-center justify-between gap-3 border-t border-border-subtle px-3 text-[9px] font-medium tabular-nums text-on-subtle [@media(max-height:520px)]:hidden">
        <span className="text-semantic-loss">{percent(perTickRisk, perTickRisk < 0.01 ? 2 : 1)} correction risk every tick</span>
        <span>Position {ticksSurvived} · Market run {marketStreak}</span>
      </div>
    </section>
  );
}

function AscentDock({
  isLandscape,
  flying,
  stake,
  maxStake,
  balance,
  multiplier,
  ticksSurvived,
  entryDisabled,
  onStakeChange,
  onEnter,
  onExit,
}: {
  isLandscape: boolean;
  flying: boolean;
  stake: number;
  maxStake: number;
  balance: number;
  multiplier: number;
  ticksSurvived: number;
  entryDisabled: boolean;
  onStakeChange: (stake: number) => void;
  onEnter: () => void;
  onExit: () => void;
}) {
  const returnAmount = stake * multiplier;
  const netPL = returnAmount - stake;
  const exitDisabled = multiplier < MIN_CASHOUT_MULTIPLIER && ticksSurvived < 1;
  const effectiveMax = Math.max(10, Math.min(maxStake, balance));
  const action = flying ? (
    <Button variant="primary" className="min-h-[52px] w-full" disabled={exitDisabled} onClick={onExit} aria-label={`Exit now at ${multiplier.toFixed(3)} times for ${formatCredits(returnAmount)} credits, net ${netPL > 0 ? 'profit' : netPL < 0 ? 'loss' : 'break even'} ${formatCredits(Math.abs(netPL))} credits`}>
      <span className="flex flex-col items-center leading-tight"><span>Exit now · {multiplier.toFixed(3)}×</span><span className="text-[9px] font-normal opacity-80">Return {formatCredits(returnAmount)} · Net {netPL > 0 ? '+' : netPL < 0 ? '−' : ''}{formatCredits(Math.abs(netPL))}</span></span>
    </Button>
  ) : (
    <Button variant="primary" className="min-h-[52px] w-full" disabled={entryDisabled} onClick={onEnter} aria-label={`Enter position with ${formatCredits(stake)} credit stake`}>
      Enter position · {formatCredits(stake)} credits
    </Button>
  );

  if (!isLandscape) {
    return <StakeDock stake={stake} max={maxStake} balance={balance} onStakeChange={onStakeChange} stakeDisabled={flying} showSlider={!flying} actions={action} />;
  }

  return (
    <div className="grid min-h-[60px] grid-cols-[44px_minmax(100px,0.7fr)_44px_minmax(230px,1.3fr)] items-center gap-2 px-4 py-2">
      <Button variant="primary" size="icon" aria-label="Decrease stake" disabled={flying || stake <= 10} onClick={() => onStakeChange(Math.max(10, stake - 10))} className="min-h-[44px] min-w-[44px]"><Minus className="h-4 w-4" /></Button>
      <div className="min-w-0 text-center"><p className="text-[9px] text-on-subtle">{flying ? 'Locked stake' : 'Stake'}</p><p className="truncate font-display text-xl font-bold leading-tight tabular-nums text-on-prominent">{formatCredits(stake)} <span className="font-body text-xs font-normal text-on-subtle">Credits</span></p></div>
      <Button variant="primary" size="icon" aria-label="Increase stake" disabled={flying || stake >= effectiveMax} onClick={() => onStakeChange(Math.min(effectiveMax, stake + 10))} className="min-h-[44px] min-w-[44px]"><Plus className="h-4 w-4" /></Button>
      {action}
    </div>
  );
}

function ResultDetails({ result, symbol, ticksSurvived }: { result: AscentRoundResult; symbol: CrashSymbol; ticksSurvived: number }) {
  const info = CRASH_SYMBOLS.find((item) => item.id === symbol)!;
  const returned = result.outcome === 'cashed_out' ? result.winAmount : 0;
  const netPL = returned - result.stake;

  return (
    <div className="space-y-3 text-left">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-subtle p-2.5 text-center">
        <div><p className="text-[9px] uppercase tracking-wide text-on-subtle">Returned</p><p className="font-display text-sm font-bold tabular-nums text-on-prominent">{formatCredits(returned)}</p></div>
        <div><p className="text-[9px] uppercase tracking-wide text-on-subtle">Ticks survived</p><p className="font-display text-sm font-bold tabular-nums text-on-prominent">{ticksSurvived}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <span className="text-on-subtle">Market</span><span className="text-right font-semibold text-on-prominent">{info.name}</span>
        <span className="text-on-subtle">Stake</span><span className="text-right font-display font-semibold tabular-nums text-on-prominent">{formatCredits(result.stake)}</span>
        <span className="text-on-subtle">Exit multiplier</span><span className="text-right font-display font-semibold tabular-nums text-on-prominent">{result.multiplier.toFixed(3)}×</span>
        <span className="text-on-subtle">Net P/L</span><span className={cn('text-right font-display font-bold tabular-nums', netPL > 0 ? 'text-semantic-win' : netPL < 0 ? 'text-semantic-loss' : 'text-on-prominent')}>{netPL > 0 ? '+' : netPL < 0 ? '−' : ''}{formatCredits(Math.abs(netPL))}</span>
      </div>
    </div>
  );
}

export function IndexAscentGame() {
  const { balance } = useBalanceStore();
  const isLandscape = useIsLandscape();
  const [symbol, setSymbol] = useState<CrashSymbol>('CRASH150N');
  const [stake, setStake] = useState(100);
  const [autoExitMode, setAutoExitMode] = useState<AutoExitMode>('off');
  const [presetTarget, setPresetTarget] = useState<number>(1.5);
  const [customTarget, setCustomTarget] = useState('3.00');
  const {
    phase,
    multiplier,
    ticksSurvived,
    curve,
    ticks,
    marketStreak,
    marketCrashes,
    lastResult,
    roundHistory,
    launch,
    cashOut,
    reset,
  } = useIndexAscent(symbol);

  const customTargetNumber = Number(customTarget);
  const customTargetValid = customTarget.trim() !== '' && Number.isFinite(customTargetNumber) && customTargetNumber >= MIN_CASHOUT_MULTIPLIER && customTargetNumber <= 100;
  const autoCashout = autoExitMode === 'off'
    ? null
    : autoExitMode === 'preset'
      ? presetTarget
      : customTargetValid
        ? customTargetNumber
        : null;
  const info = CRASH_SYMBOLS.find((item) => item.id === symbol)!;
  const flying = phase === 'flying';
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const entryDisabled = stake > balance || balance <= 0 || ticks.length === 0 || (autoExitMode === 'custom' && !customTargetValid);
  const showResultOverlay = lastResult !== null && (phase === 'cashed_out' || phase === 'crashed');
  const resultReturn = lastResult?.outcome === 'cashed_out' ? lastResult.winAmount : 0;
  const resultNetPL = lastResult ? resultReturn - lastResult.stake : 0;
  const resultTier = resultNetPL > 0 ? 'win' : resultNetPL < 0 ? 'loss' : 'push';
  const milestones = getMilestoneTable(info.avgTicksPerCrash).filter((milestone) => Number.isFinite(milestone.ticks));

  const handleEnter = useCallback(() => {
    launch(stake, autoCashout);
  }, [launch, stake, autoCashout]);

  const handlePresetTarget = (target: number) => {
    setPresetTarget(target);
    setAutoExitMode('preset');
  };

  const infoSections: GameInfoSection[] = [
    {
      id: 'milestones',
      label: 'Targets',
      content: (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs font-medium uppercase tracking-wide text-on-subtle"><span>Exit at</span><span>Time</span><span className="text-right">Survival</span></div>
          {milestones.map((milestone) => (
            <div key={milestone.multiplier} className="grid grid-cols-3 gap-2 rounded-lg bg-subtle px-3 py-2 text-xs text-on-subtle"><span className="font-display tabular-nums text-on-prominent">{milestone.multiplier}×</span><span className="font-display tabular-nums">{milestone.seconds >= 120 ? `${Math.round(milestone.seconds / 60)} min` : `${milestone.seconds}s`}</span><span className="text-right font-display tabular-nums">{percent(milestone.survivalProb)}</span></div>
          ))}
          <p className="text-xs text-on-subtle">Payouts carry a {(CRASH_HOUSE_EDGE * 100).toFixed(0)}% platform margin at every exit point.</p>
        </div>
      ),
    },
    {
      id: 'history',
      label: 'History',
      content: roundHistory.length ? (
        <div className="space-y-2">
          {roundHistory.map((round) => {
            const netPL = (round.outcome === 'cashed_out' ? round.winAmount : 0) - round.stake;
            return (
              <div key={round.id} className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2 text-xs text-on-subtle"><span>Round {round.id}</span><span className="font-display tabular-nums text-on-prominent">{round.multiplier.toFixed(3)}×</span><span className={netPL > 0 ? 'text-semantic-win' : netPL < 0 ? 'text-semantic-loss' : 'text-on-prominent'}>{netPL > 0 ? '+' : netPL < 0 ? '−' : ''}{formatCredits(Math.abs(netPL))}</span></div>
            );
          })}
        </div>
      ) : <p className="text-sm text-on-subtle">No rounds yet.</p>,
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle"><p>Your return multiplier builds on every tick the Deriv Crash index ascends without correcting.</p><p>Correction odds are memoryless: every tick carries the same risk regardless of the current run length.</p><p>Exit any time after the first surviving tick, or set an automatic target before entry.</p></div>
      ),
    },
  ];

  return (
    <GameShell infoSections={infoSections} showSymbolPicker={false}>
      <GameViewport
        market={
          ticks.length > 0 ? (
            <div className="shrink-0 border-b border-border-subtle px-4 pb-1 pt-2">
              <div className="relative overflow-hidden rounded-lg">
                <LiveTickChart ticks={ticks} className="w-full" />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-2 pt-1.5">
                  <div className="pointer-events-auto rounded border border-border-subtle bg-card/90 px-2 py-0.5 backdrop-blur-sm"><div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wide text-on-subtle">Live index</span><ConnectionIndicator /></div></div>
                  <div className="rounded border border-border-subtle bg-card/90 px-2 py-0.5 text-[10px] text-on-subtle backdrop-blur-sm">{info.name} · run <span className="font-display font-semibold tabular-nums text-on-prominent">{marketStreak}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center justify-center border-b border-border-subtle py-6"><Spinner /></div>
          )
        }
        play={
          <div className="scrollbar-hide flex min-h-0 flex-1 overflow-y-auto px-4 py-3 [@media(max-height:520px)]:py-2">
            <div className="grid min-h-0 w-full grid-rows-[auto_minmax(260px,1fr)] gap-3 [@media(max-height:520px)]:grid-cols-[minmax(245px,0.9fr)_minmax(300px,1.1fr)] [@media(max-height:520px)]:grid-rows-1">
              <div className="min-w-0">
                {flying ? (
                  <LivePositionPanel info={info} stake={stake} ticksSurvived={ticksSurvived} autoCashout={autoCashout} />
                ) : (
                  <PositionTicket symbol={symbol} onSymbolChange={setSymbol} autoExitMode={autoExitMode} presetTarget={presetTarget} customTarget={customTarget} onAutoExitModeChange={setAutoExitMode} onPresetTargetChange={handlePresetTarget} onCustomTargetChange={setCustomTarget} customTargetValid={customTargetValid} target={autoCashout} stake={stake} />
                )}
              </div>
              <PositionChart curve={curve} phase={phase} info={info} stake={stake} multiplier={multiplier} ticksSurvived={ticksSurvived} autoCashout={autoCashout} marketStreak={marketStreak} marketCrashes={marketCrashes} />
            </div>
          </div>
        }
        dock={<AscentDock isLandscape={isLandscape} flying={flying} stake={stake} maxStake={maxStake} balance={balance} multiplier={multiplier} ticksSurvived={ticksSurvived} entryDisabled={entryDisabled} onStakeChange={setStake} onEnter={handleEnter} onExit={cashOut} />}
      />

      <ResultOverlay
        open={showResultOverlay}
        won={resultNetPL > 0}
        tier={resultTier}
        title={lastResult?.outcome === 'cashed_out' ? 'Position closed' : 'Index corrected'}
        subtitle={lastResult?.outcome === 'cashed_out' ? `Exited at ${lastResult.multiplier.toFixed(3)}×.` : `The market corrected at ${lastResult?.multiplier.toFixed(3)}×.`}
        amount={lastResult ? Math.round(Math.abs(resultNetPL)) : undefined}
        amountLabel="net"
        onDismiss={reset}
        details={lastResult ? <ResultDetails result={lastResult} symbol={symbol} ticksSurvived={ticksSurvived} /> : undefined}
        primaryAction={{ label: 'Trade again', onClick: reset }}
      />
    </GameShell>
  );
}
