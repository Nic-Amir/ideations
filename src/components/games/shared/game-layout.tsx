'use client';

import { cn } from '@/lib/utils';

type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface GameTab {
  id: string;
  label: string;
  content: React.ReactNode;
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
      ? 'border-semantic-win/20 bg-semantic-win/10 text-semantic-win'
      : tone === 'warning'
        ? 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning'
        : tone === 'danger'
          ? 'border-semantic-loss/20 bg-semantic-loss/10 text-semantic-loss'
          : tone === 'info'
            ? 'border-semantic-info/20 bg-semantic-info/10 text-semantic-info'
            : 'bg-subtle text-on-prominent border border-border-subtle';

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-sm', toneClass)}>
      {children}
    </div>
  );
}

export { GameViewport } from './game-viewport';
