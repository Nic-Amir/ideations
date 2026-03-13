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
      className="fixed top-0 right-0 z-30 border-b border-white/8 bg-[rgba(9,17,28,0.82)] backdrop-blur-xl"
      animate={{ left: sidebarCollapsed ? 88 : 288 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      <div className="app-container flex h-18 items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <div className="section-label">
              {pageContext.game ? `${pageContext.game.category} module` : 'Workspace'}
            </div>
            <div className="truncate font-display text-xl font-semibold tracking-tight">
              {pageContext.title}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {pageContext.subtitle}
            </div>
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-sm transition-colors hover:bg-white/8">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono-game text-xs">
                  {selectedSymbol?.name ?? selectedIndex}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SUPPORTED_SYMBOLS.map((sym) => (
                  <DropdownMenuItem
                    key={sym.id}
                    onClick={() => setSelectedIndex(sym.id as DerivSymbol)}
                    className="flex items-center justify-between gap-4"
                  >
                    <span>{sym.name}</span>
                    <Badge variant="secondary" className="text-xs font-mono-game">
                      {sym.tickFreq}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {pageContext.usesStream ? <ConnectionIndicator /> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-2 lg:flex">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div className="text-xs text-muted-foreground">
              Net
            </div>
            <div
              className={`font-mono-game text-sm ${
                net >= 0 ? 'text-primary' : 'text-destructive'
              }`}
            >
              {net >= 0 ? '+' : ''}
              {net.toLocaleString()}
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 ${
              isLowBalance && mounted
                ? 'border-destructive/30 bg-destructive/10'
                : 'border-white/8 bg-white/4'
            }`}
          >
            <span className="text-xs text-muted-foreground">Balance</span>
            <span
              className={`text-sm ${
                isLowBalance && mounted ? 'text-destructive' : 'text-primary'
              }`}
            >
              {mounted ? <AnimatedBalance value={balance} /> : '—'}
            </span>
            <span className="text-xs text-muted-foreground">credits</span>
          </div>

          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-2xl border border-white/8 bg-white/4 p-2 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground">
              <RotateCcw className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Balance</DialogTitle>
                <DialogDescription>
                  This will reset your demo balance to 10,000 credits and clear
                  your wagering statistics. This action cannot be undone.
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
            className="hidden gap-1 rounded-full border-white/10 bg-white/4 px-3 text-xs text-muted-foreground md:inline-flex"
          >
            Demo only
          </Badge>
        </div>
      </div>
    </motion.header>
  );
}
