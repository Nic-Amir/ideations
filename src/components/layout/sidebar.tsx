'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings-store';
import { GAMES } from '@/lib/games/game-registry';
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GameIcon } from './game-icon';

function NavLink({
  href,
  icon,
  label,
  meta,
  isActive,
  collapsed,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  meta?: string;
  isActive: boolean;
  collapsed: boolean;
}) {
  const inner = (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100 ${
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      } ${collapsed ? 'justify-center px-2' : ''}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground group-hover:text-foreground'
        }`}
      >
        {icon}
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{label}</span>
          {meta && (
            <span className="block truncate text-[10px] text-muted-foreground">
              {meta}
            </span>
          )}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger className="w-full">{inner}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, soundEnabled, setSoundEnabled } =
    useSettingsStore();

  return (
    <motion.aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/6 bg-sidebar"
      animate={{ width: sidebarCollapsed ? 72 : 260 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between px-3 py-3">
        {!sidebarCollapsed ? (
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded text-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="font-display text-sm font-semibold tracking-tight">
                Ideations
              </span>
            </div>
          </Link>
        ) : (
          <Link
            href="/"
            className="mx-auto flex h-7 w-7 items-center justify-center rounded text-foreground"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        )}
      </div>

      <Separator className="opacity-30" />

      <nav className="flex-1 space-y-3 px-2 py-3">
        {!sidebarCollapsed && (
          <div className="px-1">
            <span className="section-label">Modules</span>
          </div>
        )}
        <div className="space-y-0.5">
          {GAMES.map((game) => (
            <NavLink
              key={game.slug}
              href={`/game/${game.slug}`}
              icon={<GameIcon iconKey={game.iconKey} className="h-4 w-4" />}
              label={game.name}
              meta={`${game.category} · ${game.risk}`}
              isActive={pathname === `/game/${game.slug}`}
              collapsed={sidebarCollapsed}
            />
          ))}
        </div>
      </nav>

      <Separator className="opacity-30" />

      <div className="space-y-0.5 px-2 py-3">
        <NavLink
          href="/provably-fair"
          icon={<Shield className="h-4 w-4" />}
          label="Provably Fair"
          meta="Audit the math"
          isActive={pathname === '/provably-fair'}
          collapsed={sidebarCollapsed}
        />

        {sidebarCollapsed ? (
          <Tooltip>
            <TooltipTrigger
              className="flex w-full items-center justify-center rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent side="right">
              {soundEnabled ? 'Mute' : 'Unmute'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </span>
            <span className="text-[13px] font-medium">
              {soundEnabled ? 'Sound on' : 'Sound off'}
            </span>
          </button>
        )}
      </div>

      <Separator className="opacity-30" />

      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="text-[12px]">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </motion.aside>
  );
}
