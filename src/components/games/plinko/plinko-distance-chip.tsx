'use client';

import { Badge } from '@trading-game/design-intelligence-layer';
import { getDistanceToNextZoneLabel, estimateLiveZScore } from '@/lib/games/plinko';
import type { PlinkoModeId } from '@/lib/games/plinko-modes';
import type { RunDisplay } from '@/hooks/use-volatility-plinko';

export function PlinkoDistanceChip({
  activeRuns,
  modeId,
}: {
  activeRuns: RunDisplay[];
  modeId: PlinkoModeId;
}) {
  const head = activeRuns[activeRuns.length - 1];
  if (!head || head.animProgress >= 1) return null;

  const quotes = head.run.quotes;
  const total = quotes.length - 1;
  const progress = head.pathRevealProgress;
  const fracIndex = Math.min(progress * total, total);
  const i = Math.floor(fracIndex);
  const t = fracIndex - i;
  const j = Math.min(i + 1, total);
  const price = quotes[i] + t * (quotes[j] - quotes[i]);
  const z = estimateLiveZScore(price, head.run.startPrice, modeId);
  const label = getDistanceToNextZoneLabel(z, modeId);
  if (!label) return null;

  return (
    <Badge
      variant="standard"
      size="sm"
      className="absolute top-2 left-2 z-10 tabular-nums font-display"
    >
      {label}
    </Badge>
  );
}
