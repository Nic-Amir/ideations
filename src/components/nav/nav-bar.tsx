'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useIsDesktop } from '@/hooks/use-media-query';
import { useMounted } from '@/hooks/use-mounted';
import { GAMES } from '@/lib/games/game-registry';
import { SUPPORTED_SYMBOLS } from '@/types';
import type { DerivSymbol } from '@/types';
import { GameIcon } from '@/components/layout/game-icon';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sparkles,
  ChevronDown,
  Activity,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  Home,
} from 'lucide-react';

const ACCENT_INDICATOR: Record<string, string> = {
  emerald: 'bg-game-emerald',
  violet: 'bg-game-violet',
  amber: 'bg-game-amber',
  cyan: 'bg-game-cyan',
};

const ACCENT_TEXT_ACTIVE: Record<string, string> = {
  emerald: 'text-game-emerald',
  violet: 'text-game-violet',
  amber: 'text-game-amber',
  cyan: 'text-game-cyan',
};

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

function DesktopNav() {
  const pathname = usePathname();
  const { selectedIndex, setSelectedIndex, soundEnabled, setSoundEnabled } =
    useSettingsStore();
  const { balance, resetBalance, isLowBalance } = useBalanceStore();
  const mounted = useMounted();
  const [resetOpen, setResetOpen] = useState(false);

  const selectedSymbol = SUPPORTED_SYMBOLS.find((s) => s.id === selectedIndex);
  const net = balance - 10_000;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-11 items-center border-b border-border bg-background">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 px-4"
      >
        <Sparkles className="h-3.5 w-3.5 text-foreground" />
        <span className="font-display text-[13px] font-semibold tracking-tight">
          Ideations
        </span>
      </Link>

      <Separator orientation="vertical" className="mx-1 h-5 opacity-30" />

      <div className="flex items-center gap-0.5 px-2">
        {GAMES.map((game) => {
          const active = pathname === `/game/${game.slug}`;
          return (
            <Link
              key={game.slug}
              href={`/game/${game.slug}`}
              className={`relative flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono-game text-[11px] transition-colors ${
                active
                  ? `text-foreground ${ACCENT_TEXT_ACTIVE[game.accent] ?? ''}`
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GameIcon iconKey={game.iconKey} className="h-3 w-3" />
              <span>{game.shortName}</span>
              {active && (
                <motion.div
                  className={`absolute bottom-0 left-1 right-1 h-[2px] rounded-full ${ACCENT_INDICATOR[game.accent] ?? 'bg-foreground'}`}
                  layoutId="nav-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </Link>
          );
        })}

        <Separator orientation="vertical" className="mx-1.5 h-4 opacity-30" />

        <Link
          href="/provably-fair"
          className={`rounded px-2 py-1.5 font-mono-game text-[11px] transition-colors ${
            pathname === '/provably-fair'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Fair
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-3 px-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded bg-accent px-2 py-1 font-mono-game text-[10px] transition-colors hover:bg-accent/80">
            <Activity className="h-2.5 w-2.5 text-muted-foreground" />
            <span>{selectedSymbol?.name ?? selectedIndex}</span>
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SUPPORTED_SYMBOLS.map((sym) => (
              <DropdownMenuItem
                key={sym.id}
                onClick={() => setSelectedIndex(sym.id as DerivSymbol)}
                className="flex items-center justify-between gap-4"
              >
                <span>{sym.name}</span>
                <span className="font-mono-game text-[10px] text-muted-foreground">
                  {sym.tickFreq}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ConnectionIndicator />

        <div className="flex items-center gap-1.5 font-mono-game text-[11px]">
          <span className="hidden text-muted-foreground lg:inline">Net</span>
          <span
            className={`hidden tabular-nums lg:inline ${
              net >= 0 ? 'text-success' : 'text-destructive'
            }`}
          >
            {net >= 0 ? '+' : ''}
            {net.toLocaleString()}
          </span>
          <Separator
            orientation="vertical"
            className="mx-1 hidden h-3.5 opacity-20 lg:block"
          />
          <span
            className={`tabular-nums ${
              isLowBalance && mounted ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {mounted ? <AnimatedBalance value={balance} /> : '\u2014'}
          </span>
          <span className="text-[9px] text-muted-foreground">cr</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
            <Settings className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setSoundEnabled(!soundEnabled)}>
              <span className="flex items-center gap-2">
                {soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                {soundEnabled ? 'Sound on' : 'Sound off'}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setResetOpen(true)}
              className="text-destructive"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset balance
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Balance</DialogTitle>
              <DialogDescription>
                Reset demo balance to 10,000 credits. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  resetBalance();
                  setResetOpen(false);
                }}
              >
                Reset to 10,000
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </nav>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/"
        className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[9px] ${
          pathname === '/'
            ? 'text-foreground'
            : 'text-muted-foreground'
        }`}
      >
        <Home className="h-4 w-4" />
        <span>Home</span>
      </Link>
      {GAMES.map((game) => {
        const active = pathname === `/game/${game.slug}`;
        return (
          <Link
            key={game.slug}
            href={`/game/${game.slug}`}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[9px] ${
              active
                ? `text-foreground ${ACCENT_TEXT_ACTIVE[game.accent] ?? ''}`
                : 'text-muted-foreground'
            }`}
          >
            <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
            <span>{game.shortName}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileTopBar() {
  const { balance, isLowBalance } = useBalanceStore();
  const mounted = useMounted();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-11 items-center justify-between border-b border-border bg-background px-3">
      <Link href="/" className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-foreground" />
        <span className="font-display text-[13px] font-semibold tracking-tight">
          Ideations
        </span>
      </Link>
      <div className="flex items-center gap-2.5">
        <ConnectionIndicator />
        <span
          className={`font-mono-game text-[11px] tabular-nums ${
            isLowBalance && mounted ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {mounted ? balance.toLocaleString() : '\u2014'}
        </span>
      </div>
    </header>
  );
}

export function NavBar() {
  const isDesktop = useIsDesktop();
  const mounted = useMounted();

  if (!mounted) return null;

  if (isDesktop) return <DesktopNav />;

  return (
    <>
      <MobileTopBar />
      <MobileBottomNav />
    </>
  );
}
