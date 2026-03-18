'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
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
    <div className={cn('rounded-md border px-3 py-2.5 text-sm', toneClass)}>
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
    <div
      className={cn(
        'px-1 text-[12px] text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

export function GameBetslip({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel rounded-lg p-3">
      {children}
    </section>
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
    <section className={cn('surface-panel rounded-lg p-3', className)}>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
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

function MobileMarketStrip({
  lastConsumedTick,
  extractionKey,
  ticks,
}: {
  lastConsumedTick: ParsedTick | null;
  extractionKey: number;
  ticks: ParsedTick[];
}) {
  if (!lastConsumedTick && ticks.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md bg-accent px-3 py-2 xl:hidden">
      {lastConsumedTick ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Quote</span>
            <span className="font-mono-game text-[12px] text-foreground">
              {lastConsumedTick.numericQuote.toFixed(2)}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex-1">
            <DigitExtraction tick={lastConsumedTick} triggerKey={extractionKey} />
          </div>
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground">Waiting for ticks...</span>
      )}
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
  return (
    <div className="page-gutter space-y-3">
      {statusLine}

      <MobileMarketStrip
        lastConsumedTick={lastConsumedTick}
        extractionKey={extractionKey}
        ticks={ticks}
      />

      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_248px]">
        <aside className="order-3 xl:order-1">
          <section className="surface-panel rounded-lg p-3 xl:sticky xl:top-16">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="section-label">Market feed</span>
              {ticks.length > 0 ? (
                <span className="font-mono-game text-[10px] text-muted-foreground">
                  {ticks.length}
                </span>
              ) : null}
            </div>

            {marketContent ? (
              <div className="space-y-2">{marketContent}</div>
            ) : (
              <div className="space-y-2">
                {lastConsumedTick ? (
                  <div className="surface-inset rounded-md px-2.5 py-2">
                    <div className="text-[10px] text-muted-foreground">Latest</div>
                    <div className="mt-0.5 font-mono-game text-sm text-foreground">
                      {lastConsumedTick.numericQuote.toFixed(2)}
                    </div>
                  </div>
                ) : null}

                <LiveTickChart
                  ticks={ticks}
                  highlightedTicks={highlightedTicks}
                  height={140}
                />

                <div className="surface-inset rounded-md px-2.5 py-2">
                  <DigitExtraction tick={lastConsumedTick} triggerKey={extractionKey} />
                </div>

                {marketSummary ? (
                  <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {marketSummary}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </aside>

        <main className="order-1 space-y-3 xl:order-2">
          <section className="surface-panel rounded-lg p-3">
            {playArea}
          </section>
          {tabs.length ? <GameSecondaryTabs tabs={tabs} /> : null}
        </main>

        <aside className="order-2 xl:order-3">
          <div className="xl:sticky xl:top-16">
            <GameBetslip>{controls}</GameBetslip>
          </div>
        </aside>
      </div>
    </div>
  );
}
