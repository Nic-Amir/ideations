'use client';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@trading-game/design-intelligence-layer';
import { cn } from '@/lib/utils';
import {
  TARGET_GROUPS,
  TARGET_GROUP_LABELS,
  getTargetPayout,
  formatTargetProbability,
  type PlinkoBetType,
  type TargetGroup,
} from '@/lib/games/plinko-target';
import { getPlinkoMode, type PlinkoModeId } from '@/lib/games/plinko-modes';

export function PlinkoBetTypeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: PlinkoBetType;
  onChange: (type: PlinkoBetType) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next && next !== value) onChange(next as PlinkoBetType);
      }}
      variant="outline"
      size="sm"
      spacing={4}
      className={cn('w-full', disabled && 'pointer-events-none opacity-60')}
      aria-label="Bet type"
    >
      <ToggleGroupItem value="wall" className="flex-1 min-h-[40px] font-body text-xs" aria-label="Wall bet">
        Wall
      </ToggleGroupItem>
      <ToggleGroupItem value="target" className="flex-1 min-h-[40px] font-body text-xs" aria-label="Target bet">
        Target
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function PlinkoTargetPicker({
  value,
  modeId,
  onChange,
  disabled = false,
}: {
  value: TargetGroup;
  modeId: PlinkoModeId;
  onChange: (group: TargetGroup) => void;
  disabled?: boolean;
}) {
  const zones = getPlinkoMode(modeId).config.zones;

  return (
    <div
      role="radiogroup"
      aria-label="Target band"
      className={cn(
        'grid grid-cols-3 gap-1.5',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {TARGET_GROUPS.map((group) => {
        const selected = group === value;
        const payout = getTargetPayout(group);
        const color = zones.find((z) => z.displayGroup === group)?.color ?? '#7B8794';
        return (
          <button
            key={group}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(group)}
            className={cn(
              'flex flex-col items-center rounded-lg border px-2 py-1.5 transition-colors min-h-[48px]',
              selected
                ? 'border-primary bg-primary/10'
                : 'border-border-subtle bg-subtle hover:bg-card',
            )}
          >
            <span className="flex items-center gap-1 text-[11px] font-medium text-on-prominent">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              {TARGET_GROUP_LABELS[group]}
            </span>
            <span className="font-display text-xs font-bold tabular-nums text-primary">
              {payout}×
            </span>
            <span className="text-[9px] tabular-nums text-on-subtle">
              {formatTargetProbability(group)} hit
            </span>
          </button>
        );
      })}
    </div>
  );
}
