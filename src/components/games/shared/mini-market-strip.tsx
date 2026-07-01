'use client';

import { LiveTickChart } from './live-tick-chart';
import { DigitExtraction } from './digit-extraction';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import type { ParsedTick } from '@/types';

interface MiniMarketStripProps {
  ticks: ParsedTick[];
  highlightedTicks?: ParsedTick[];
  lastConsumedTick?: ParsedTick | null;
  extractionKey?: number;
}

export function MiniMarketStrip({
  ticks,
  highlightedTicks = [],
  lastConsumedTick = null,
  extractionKey = 0,
}: MiniMarketStripProps) {
  return (
    <div className="shrink-0 px-4 pt-2 pb-1 border-b border-border-subtle">
      <div className="relative overflow-hidden rounded-lg">
        <LiveTickChart
          ticks={ticks}
          highlightedTicks={highlightedTicks}
          className="w-full"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-2 pt-1.5">
          <div className="pointer-events-auto rounded bg-card/90 px-2 py-0.5 backdrop-blur-sm border border-border-subtle">
            <ConnectionIndicator />
          </div>
          {lastConsumedTick ? (
            <div className="rounded bg-card/90 px-2 py-0.5 backdrop-blur-sm border border-border-subtle">
              <DigitExtraction tick={lastConsumedTick} triggerKey={extractionKey} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
