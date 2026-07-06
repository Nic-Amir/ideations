'use client';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@trading-game/design-intelligence-layer';
import { cn } from '@/lib/utils';
import { PLINKO_MODE_IDS, getPlinkoMode, type PlinkoModeId } from '@/lib/games/plinko-modes';

export function PlinkoModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PlinkoModeId;
  onChange: (mode: PlinkoModeId) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next && next !== value) onChange(next as PlinkoModeId);
      }}
      variant="outline"
      size="sm"
      spacing={4}
      className={cn('w-full', disabled && 'pointer-events-none opacity-60')}
      aria-label="Pricing mode"
    >
      {PLINKO_MODE_IDS.map((id) => {
        const mode = getPlinkoMode(id);
        return (
          <ToggleGroupItem
            key={id}
            value={id}
            className="flex-1 min-h-[40px] font-body text-xs"
            aria-label={mode.label}
          >
            {mode.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
