'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { GAMES } from '@/lib/games/game-registry';
import {
  Menu,
  Shield,
  Sparkles,
} from 'lucide-react';
import { GameIcon } from './game-icon';

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-xl border border-white/8 bg-white/4 p-2 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground md:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-80 border-r border-white/8 bg-[linear-gradient(180deg,rgba(9,17,28,0.98),rgba(8,16,24,0.96))] p-0">
        <SheetHeader className="px-5 py-5">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="section-label">Ideations</span>
              <span className="block font-display text-lg font-semibold">Trade The Noise</span>
            </div>
          </SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-4">
          <div className="surface-panel-muted rounded-2xl px-4 py-3">
            <div className="section-label">Terminal</div>
            <p className="mt-1 text-sm text-foreground">Pick a market module</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              All gameplay runs on live tick digits or a documented simulation model.
            </p>
          </div>
        </div>
        <Separator className="opacity-40" />
        <nav className="space-y-2 px-3 py-4">
          <div className="mb-2 px-2">
            <span className="section-label">Game modules</span>
          </div>
          {GAMES.map((game) => {
            const isActive = pathname === `/game/${game.slug}`;
            return (
              <Link
                key={game.slug}
                href={`/game/${game.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-all ${
                  isActive
                    ? 'border-primary/25 bg-primary/10 text-foreground shadow-[0_10px_30px_rgba(94,234,212,0.12)]'
                    : 'border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/4 hover:text-foreground'
                }`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                  isActive
                    ? 'border-primary/20 bg-primary/12 text-primary'
                    : 'border-white/8 bg-white/4'
                }`}>
                  <GameIcon iconKey={game.iconKey} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{game.name}</span>
                  <span className="block pt-0.5 text-[11px] text-muted-foreground">
                    {game.category} · {game.risk} risk · {game.sessionLength}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <Separator className="opacity-40" />
        <div className="px-3 py-4">
          <Link
            href="/provably-fair"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm text-muted-foreground transition-all hover:border-white/8 hover:bg-white/4 hover:text-foreground"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/4">
              <Shield className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-foreground">Provably Fair</span>
              <span className="block pt-0.5 text-[11px] text-muted-foreground">
                Audit the math, entropy source, and assumptions
              </span>
            </span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
