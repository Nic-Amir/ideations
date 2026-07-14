'use client';

import { Button, Slider } from '@trading-game/design-intelligence-layer';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StakeDockProps {
  stake: number;
  min?: number;
  max: number;
  step?: number;
  balance: number;
  currency?: string;
  onStakeChange: (value: number) => void;
  stakeDisabled?: boolean;
  showSlider?: boolean;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function StakeDock({
  stake,
  min = 10,
  max,
  step = 10,
  balance,
  currency = 'Credits',
  onStakeChange,
  stakeDisabled = false,
  showSlider = false,
  footer,
  actions,
  className,
}: StakeDockProps) {
  const effectiveMax = Math.max(min, Math.min(max, balance));
  const decDisabled = stakeDisabled || stake <= min;
  const incDisabled = stakeDisabled || stake >= effectiveMax;

  return (
    <div className={cn('flex flex-col gap-3 px-4 pt-3 [@media(max-height:720px)]:gap-2 [@media(max-height:720px)]:pt-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="primary"
          size="icon"
          disabled={decDisabled}
          aria-label="Decrease stake"
          onClick={() => onStakeChange(Math.max(min, stake - step))}
          className="min-h-[44px] min-w-[44px]"
        >
          <Minus className="w-4 h-4" />
        </Button>
        <div className="flex flex-col items-center min-w-0 flex-1">
          <p className="text-[10px] text-on-subtle font-body">Stake</p>
          <p className="text-2xl font-bold font-display text-on-prominent leading-tight tabular-nums">
            {stake.toLocaleString()}{' '}
            <span className="text-sm font-normal font-body text-on-subtle">{currency}</span>
          </p>
        </div>
        <Button
          variant="primary"
          size="icon"
          disabled={incDisabled}
          aria-label="Increase stake"
          onClick={() => onStakeChange(Math.min(effectiveMax, stake + step))}
          className="min-h-[44px] min-w-[44px]"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {showSlider && !stakeDisabled ? (
        <Slider
          value={[stake]}
          onValueChange={(v) => onStakeChange(Array.isArray(v) ? v[0] : v)}
          min={min}
          max={effectiveMax}
          step={step}
        />
      ) : null}

      {footer ? <div className="text-center text-xs text-on-subtle">{footer}</div> : null}

      {actions ? <div className="flex flex-col gap-2">{actions}</div> : null}
    </div>
  );
}
