'use client';

import { cn } from '@/lib/utils';

interface GameViewportProps {
  market?: React.ReactNode;
  play: React.ReactNode;
  dock: React.ReactNode;
  className?: string;
}

export function GameViewport({ market, play, dock, className }: GameViewportProps) {
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 overflow-hidden', className)}>
      {market ? <div className="shrink-0">{market}</div> : null}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{play}</div>
      <div className="shrink-0 border-t border-border-subtle bg-prominent pb-safe">
        {dock}
      </div>
    </div>
  );
}
