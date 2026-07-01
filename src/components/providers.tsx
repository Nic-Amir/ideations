'use client';

import { TooltipProvider } from '@trading-game/design-intelligence-layer';
import { DerivProvider } from '@/lib/deriv/provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DerivProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </DerivProvider>
  );
}
