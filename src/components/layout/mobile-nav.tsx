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
      <SheetTrigger className="inline-flex items-center justify-center rounded-md border border-white/6 bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground md:hidden">
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-r border-white/6 bg-sidebar p-0">
        <SheetHeader className="px-3 py-3">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/16 bg-primary/8 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="section-label">Ideations</span>
              <span className="block font-display text-sm font-semibold">Trade The Noise</span>
            </div>
          </SheetTitle>
        </SheetHeader>
        <Separator className="opacity-30" />
        <nav className="space-y-0.5 px-2 py-3">
          <div className="mb-2 px-1">
            <span className="section-label">Modules</span>
          </div>
          {GAMES.map((game) => {
            const isActive = pathname === `/game/${game.slug}`;
            return (
              <Link
                key={game.slug}
                href={`/game/${game.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors duration-100 ${
                  isActive
                    ? 'border-primary/20 bg-primary/8 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                  isActive
                    ? 'border-primary/16 bg-primary/10 text-primary'
                    : 'border-white/6 bg-white/[0.03]'
                }`}>
                  <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">{game.name}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {game.category} · {game.risk} · {game.sessionLength}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <Separator className="opacity-30" />
        <div className="px-2 py-3">
          <Link
            href="/provably-fair"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/6 bg-white/[0.03]">
              <Shield className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">Provably Fair</span>
              <span className="block text-[10px] text-muted-foreground">
                Audit the math
              </span>
            </span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
