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
      ? 'border-primary/20 bg-primary/10 text-primary'
      : tone === 'warning'
        ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
        : tone === 'danger'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : tone === 'info'
            ? 'border-sky-400/20 bg-sky-400/10 text-sky-200'
            : 'border-white/8 bg-white/4 text-foreground';

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
        'rounded-md border border-white/6 bg-white/[0.03] px-3 py-2.5 text-sm text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

export function GameBetslip({
  title = 'Betslip',
  description = 'Set your stake and place the next action.',
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel rounded-lg p-4">
      <div className="mb-3">
        <div className="section-label">Controls</div>
        <h2 className="mt-1 font-display text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
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
    <section className={cn('surface-panel rounded-lg p-3 md:p-4', className)}>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              selectedTab.id === tab.id
                ? 'border-primary/16 bg-primary/8 text-primary'
                : 'border-white/6 bg-white/[0.03] text-muted-foreground hover:text-foreground'
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
      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_268px]">
        <aside className="order-3 xl:order-1">
          <section className="surface-panel rounded-lg p-3 xl:sticky xl:top-18">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="section-label">Market feed</div>
                <h2 className="mt-0.5 font-display text-[15px] font-semibold tracking-tight">
                  Live rail
                </h2>
              </div>
              {ticks.length > 0 ? (
                <div className="rounded-md border border-white/6 bg-white/[0.03] px-2 py-0.5 font-mono-game text-[10px] text-muted-foreground">
                  {ticks.length}
                </div>
              ) : null}
            </div>

            {marketContent ? (
              <div className="space-y-2">{marketContent}</div>
            ) : (
              <div className="space-y-2">
                {lastConsumedTick ? (
                  <div className="rounded-md border border-white/6 bg-white/[0.03] px-2.5 py-2">
                    <div className="section-label">Latest quote</div>
                    <div className="mt-0.5 font-mono-game text-sm text-primary">
                      {lastConsumedTick.numericQuote.toFixed(2)}
                    </div>
                  </div>
                ) : null}

                <LiveTickChart
                  ticks={ticks}
                  highlightedTicks={highlightedTicks}
                  height={160}
                />

                <div className="rounded-md border border-white/6 bg-white/[0.03] px-2.5 py-2">
                  <DigitExtraction tick={lastConsumedTick} triggerKey={extractionKey} />
                </div>

                {marketSummary ? (
                  <div className="rounded-md border border-white/6 bg-white/[0.03] px-2.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    {marketSummary}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </aside>

        <main className="order-1 space-y-3 xl:order-2">
          {statusLine}
          <section className="surface-panel rounded-lg p-3 md:p-4">
            {playArea}
          </section>
          {tabs.length ? <GameSecondaryTabs tabs={tabs} /> : null}
        </main>

        <aside className="order-2 xl:order-3">
          <div className="xl:sticky xl:top-18">
            <GameBetslip>{controls}</GameBetslip>
          </div>
        </aside>
      </div>
    </div>
  );
}
