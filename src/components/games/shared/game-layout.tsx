'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import { useDerivConnection } from '@/hooks/use-tick-stream';
import { useMounted } from '@/hooks/use-mounted';
import { SUPPORTED_SYMBOLS } from '@/types';
import { LiveTickChart } from './live-tick-chart';
import { DigitExtraction } from './digit-extraction';
import type { ParsedTick } from '@/types';

type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface GameTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface GameLayoutProps {
  ticks: ParsedTick[];
  highlightedTicks: ParsedTick[];
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
  playArea: React.ReactNode;
  controls: React.ReactNode;
  tabs?: GameTab[];
  statusLine?: React.ReactNode;
  marketSummary?: React.ReactNode;
  marketContent?: React.ReactNode;
}

export function GameNotice({
  tone = 'default',
  children,
}: {
  tone?: MetricTone;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success/20 bg-success/8 text-success'
      : tone === 'warning'
        ? 'border-warning/20 bg-warning/8 text-warning'
        : tone === 'danger'
          ? 'border-destructive/20 bg-destructive/8 text-destructive'
          : tone === 'info'
            ? 'border-info/20 bg-info/8 text-info'
            : 'bg-accent text-foreground';

  return (
    <div className={cn('rounded border px-3 py-2.5 text-sm', toneClass)}>
      {children}
    </div>
  );
}

export function GameStatusLine({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-1 text-[11px] text-muted-foreground', className)}>
      {children}
    </div>
  );
}

export function GameBetslip({ children }: { children: React.ReactNode }) {
  return (
    <section className="surface-panel rounded p-3">{children}</section>
  );
}

export function GameSecondaryTabs({
  tabs,
  className,
}: {
  tabs: GameTab[];
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');

  if (!tabs.length) return null;

  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <section className={cn('surface-panel rounded p-3', className)}>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded px-2.5 py-1 font-mono-game text-[10px] font-medium transition-colors',
              selectedTab.id === tab.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{selectedTab.content}</div>
    </section>
  );
}

function MarketBar({
  ticks,
  lastConsumedTick,
  extractionKey,
}: {
  ticks: ParsedTick[];
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
}) {
  const { selectedIndex } = useSettingsStore();
  const status = useDerivConnection();
  const mounted = useMounted();
  const symbol = SUPPORTED_SYMBOLS.find((s) => s.id === selectedIndex);

  if (!mounted) return null;
  if (ticks.length === 0 && !lastConsumedTick) return null;

  const statusDot =
    status === 'connected'
      ? 'bg-emerald-400'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-amber-400'
        : 'bg-rose-400';

  return (
    <div className="flex items-center gap-3 rounded bg-accent px-3 py-2 font-mono-game text-[11px]">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        <span className="text-muted-foreground">
          {symbol?.name ?? selectedIndex}
        </span>
      </span>
      {lastConsumedTick ? (
        <>
          <span className="text-foreground">
            {lastConsumedTick.numericQuote.toFixed(2)}
          </span>
          <DigitExtraction tick={lastConsumedTick} triggerKey={extractionKey} />
        </>
      ) : (
        <span className="text-muted-foreground">Waiting for ticks...</span>
      )}
      <span className="ml-auto text-[9px] text-muted-foreground">
        {ticks.length} ticks
      </span>
    </div>
  );
}

export function GameLayout({
  ticks,
  highlightedTicks,
  lastConsumedTick,
  extractionKey,
  playArea,
  controls,
  tabs = [],
  statusLine,
  marketSummary,
  marketContent,
}: GameLayoutProps) {
  const hasTickData = ticks.length > 0 || lastConsumedTick !== null;

  const allTabs: GameTab[] = [
    ...tabs,
  ];

  if (hasTickData) {
    allTabs.push({
      id: 'chart',
      label: 'Chart',
      content: (
        <div className="space-y-2">
          <LiveTickChart
            ticks={ticks}
            highlightedTicks={highlightedTicks}
            height={180}
          />
          {marketSummary ? (
            <p className="px-0.5 text-[10px] leading-relaxed text-muted-foreground">
              {marketSummary}
            </p>
          ) : null}
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-2 px-3 py-3 md:px-4">
      {statusLine}

      {hasTickData && (
        <MarketBar
          ticks={ticks}
          lastConsumedTick={lastConsumedTick}
          extractionKey={extractionKey}
        />
      )}

      {marketContent && !hasTickData ? (
        <div className="space-y-2">{marketContent}</div>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <section className="surface-panel rounded p-3">{playArea}</section>
          {allTabs.length > 0 && <GameSecondaryTabs tabs={allTabs} />}
        </div>

        <aside className="lg:sticky lg:top-14 lg:self-start">
          <GameBetslip>{controls}</GameBetslip>
          {marketContent && hasTickData ? (
            <div className="mt-2 space-y-2">{marketContent}</div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
