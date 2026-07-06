'use client';

import { Badge } from '@trading-game/design-intelligence-layer';
import { Flame } from 'lucide-react';
import type { BarrierZone } from '@/lib/games/plinko-modes';

export function PlinkoStreakBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <Badge variant="fill-success" size="sm" className="gap-1 tabular-nums">
      <Flame className="size-3" aria-hidden />
      {count} streak
    </Badge>
  );
}

export function formatZoneRange(zone: BarrierZone): string {
  if (zone.minSigma === 0) return `|Z| < ${zone.maxSigma}σ`;
  if (zone.maxSigma === Infinity) return `|Z| ≥ ${zone.minSigma}σ`;
  return `${zone.minSigma}σ – ${zone.maxSigma}σ`;
}
