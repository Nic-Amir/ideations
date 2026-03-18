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
      <SheetTrigger className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground md:hidden">
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-r border-border bg-background p-0">
        <SheetHeader className="px-3 py-3">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-foreground" />
            <span className="font-display text-sm font-semibold">Ideations</span>
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
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100 ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                  isActive ? 'text-foreground' : ''
                }`}>
                  <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{game.name}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {game.category} · {game.risk}
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
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <Shield className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-medium">Provably Fair</span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
