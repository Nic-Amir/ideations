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

function LiveMarketStrip({
  ticks,
  highlightedTicks,
  lastConsumedTick,
  extractionKey,
}: {
  ticks: ParsedTick[];
  highlightedTicks: ParsedTick[];
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
}) {
  const { selectedIndex } = useSettingsStore();
  const status = useDerivConnection();
  const mounted = useMounted();
  const symbol = SUPPORTED_SYMBOLS.find((s) => s.id === selectedIndex);

  if (!mounted) return null;

  const statusDot =
    status === 'connected'
      ? 'bg-emerald-400'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-amber-400'
        : 'bg-rose-400';

  const statusLabel =
    status === 'connected'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting'
        : status === 'reconnecting'
          ? 'Reconnecting'
          : 'Offline';

  return (
    <div className="relative overflow-hidden rounded">
      <LiveTickChart
        ticks={ticks}
        highlightedTicks={highlightedTicks}
        height={100}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-2">
        <div className="flex items-center gap-1.5 rounded bg-[#0f0f11]/80 px-2 py-1 font-mono-game text-[10px] backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-muted-foreground">
            {symbol?.name ?? selectedIndex}
          </span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span className="text-muted-foreground">{statusLabel}</span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span className="text-muted-foreground">{ticks.length}t</span>
        </div>

        <div className="rounded bg-[#0f0f11]/80 px-2 py-1 backdrop-blur-sm">
          <DigitExtraction
            tick={lastConsumedTick}
            triggerKey={extractionKey}
          />
        </div>
      </div>
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
  marketContent,
}: GameLayoutProps) {
  const hasTickData = ticks.length > 0 || lastConsumedTick !== null;

  return (
    <div className="mx-auto max-w-5xl space-y-2 px-3 py-3 md:px-4">
      {statusLine}

      {hasTickData && (
        <LiveMarketStrip
          ticks={ticks}
          highlightedTicks={highlightedTicks}
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
          {tabs.length > 0 && <GameSecondaryTabs tabs={tabs} />}
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
