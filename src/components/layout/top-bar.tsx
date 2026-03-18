'use client';

import { motion } from 'framer-motion';
import { useBalanceStore } from '@/stores/balance-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useMounted } from '@/hooks/use-mounted';
import { SUPPORTED_SYMBOLS } from '@/types';
import type { DerivSymbol } from '@/types';
import { usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, RotateCcw, Activity, TrendingUp } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ConnectionIndicator } from './connection-indicator';
import { getPageContext } from './page-context';

function AnimatedBalance({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const diff = end - start;
    if (diff === 0) return;

    const duration = 400;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    prevValue.current = value;
  }, [value]);

  return (
    <span className="font-mono-game font-bold tabular-nums">
      {displayValue.toLocaleString()}
    </span>
  );
}

export function TopBar() {
  const { balance, resetBalance, isLowBalance } = useBalanceStore();
  const { selectedIndex, setSelectedIndex, sidebarCollapsed } = useSettingsStore();
  const mounted = useMounted();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const pathname = usePathname();

  const selectedSymbol = SUPPORTED_SYMBOLS.find((s) => s.id === selectedIndex);
  const pageContext = getPageContext(pathname);
  const net = balance - 10_000;

  return (
    <motion.header
      className="fixed top-0 right-0 z-30 border-b border-white/6 bg-background/95 backdrop-blur-sm"
      animate={{ left: sidebarCollapsed ? 72 : 260 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <div className="app-container flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-display text-[15px] font-semibold tracking-tight">
                {pageContext.title}
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {pageContext.game ? `${pageContext.game.category}` : 'Workspace'}
              </span>
            </div>
            <div className="truncate text-[12px] text-muted-foreground">
              {pageContext.subtitle}
            </div>
          </div>

          <div className="hidden items-center gap-2 xl:flex">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-white/6 bg-white/[0.03] px-2.5 py-1.5 text-sm transition-colors hover:bg-white/[0.06]">
                <Activity className="h-3 w-3 text-primary" />
                <span className="font-mono-game text-[11px]">
                  {selectedSymbol?.name ?? selectedIndex}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SUPPORTED_SYMBOLS.map((sym) => (
                  <DropdownMenuItem
                    key={sym.id}
                    onClick={() => setSelectedIndex(sym.id as DerivSymbol)}
                    className="flex items-center justify-between gap-4"
                  >
                    <span>{sym.name}</span>
                    <Badge variant="secondary" className="font-mono-game">
                      {sym.tickFreq}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {pageContext.usesStream ? <ConnectionIndicator /> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-md border border-white/6 bg-white/[0.03] px-2.5 py-1.5 lg:flex">
            <span className="text-[11px] text-muted-foreground">Net</span>
            <span
              className={`font-mono-game text-[12px] tabular-nums ${
                net >= 0 ? 'text-primary' : 'text-destructive'
              }`}
            >
              {net >= 0 ? '+' : ''}
              {net.toLocaleString()}
            </span>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${
              isLowBalance && mounted
                ? 'border-destructive/20 bg-destructive/8'
                : 'border-white/6 bg-white/[0.03]'
            }`}
          >
            <span className="text-[11px] text-muted-foreground">Bal</span>
            <span
              className={`text-[12px] ${
                isLowBalance && mounted ? 'text-destructive' : 'text-primary'
              }`}
            >
              {mounted ? <AnimatedBalance value={balance} /> : '—'}
            </span>
          </div>

          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-white/6 bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Balance</DialogTitle>
                <DialogDescription>
                  Reset demo balance to 10,000 credits. Wagering stats will be
                  cleared. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    resetBalance();
                    setResetDialogOpen(false);
                  }}
                >
                  Reset to 10,000
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Badge
            variant="outline"
            className="hidden border-white/6 bg-white/[0.03] text-muted-foreground md:inline-flex"
          >
            Demo
          </Badge>
        </div>
      </div>
    </motion.header>
  );
}
