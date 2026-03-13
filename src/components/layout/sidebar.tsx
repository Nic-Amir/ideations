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
      className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-all ${
        isActive
          ? 'border-primary/25 bg-primary/10 text-foreground shadow-[0_10px_30px_rgba(94,234,212,0.12)]'
          : 'border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/4 hover:text-foreground'
      } ${collapsed ? 'justify-center px-2' : ''}`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
          isActive
            ? 'border-primary/20 bg-primary/12 text-primary'
            : 'border-white/8 bg-white/4 text-muted-foreground group-hover:text-foreground'
        }`}
      >
        {icon}
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate font-medium">{label}</span>
          {meta && (
            <span className="block truncate pt-0.5 text-[11px] text-muted-foreground">
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
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/8 bg-[linear-gradient(180deg,rgba(9,17,28,0.98),rgba(8,16,24,0.96))] backdrop-blur-xl"
      animate={{ width: sidebarCollapsed ? 88 : 288 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!sidebarCollapsed ? (
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="section-label">Ideations</span>
              <span className="block font-display text-lg font-semibold tracking-tight">
                Trade The Noise
              </span>
            </div>
          </Link>
        ) : (
          <Link
            href="/"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary"
          >
            <Sparkles className="h-5 w-5" />
          </Link>
        )}
      </div>

      <div className="px-4 pb-4">
        {!sidebarCollapsed ? (
          <div className="surface-panel-muted rounded-2xl px-4 py-3">
            <div className="section-label">Terminal</div>
            <p className="mt-1 text-sm text-foreground">Demo market gaming desk</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Live tick modules, cleaner risk framing, zero signup friction.
            </p>
          </div>
        ) : (
          <div className="mx-auto h-2 w-10 rounded-full bg-white/8" />
        )}
      </div>

      <Separator className="opacity-40" />

      <nav className="flex-1 space-y-5 px-3 py-4">
        {!sidebarCollapsed && (
          <div className="px-2">
            <span className="section-label">Game modules</span>
          </div>
        )}
        <div className="space-y-2">
          {GAMES.map((game) => (
            <NavLink
              key={game.slug}
              href={`/game/${game.slug}`}
              icon={<GameIcon iconKey={game.iconKey} className="h-5 w-5" />}
              label={game.name}
              meta={`${game.category} · ${game.risk} risk`}
              isActive={pathname === `/game/${game.slug}`}
              collapsed={sidebarCollapsed}
            />
          ))}
        </div>
      </nav>

      <Separator className="opacity-40" />

      <div className="space-y-2 px-3 py-4">
        <NavLink
          href="/provably-fair"
          icon={<Shield className="h-5 w-5" />}
          label="Provably Fair"
          meta="Math, sources, and assumptions"
          isActive={pathname === '/provably-fair'}
          collapsed={sidebarCollapsed}
        />

        {sidebarCollapsed ? (
          <Tooltip>
            <TooltipTrigger
              className="flex w-full items-center justify-center rounded-2xl border border-transparent px-2 py-3 text-muted-foreground transition-all hover:border-white/8 hover:bg-white/4 hover:text-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="right">
              {soundEnabled ? 'Mute' : 'Unmute'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm text-muted-foreground transition-all hover:border-white/8 hover:bg-white/4 hover:text-foreground"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/4">
              {soundEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">
                {soundEnabled ? 'Sound enabled' : 'Sound muted'}
              </span>
              <span className="block pt-0.5 text-[11px] text-muted-foreground">
                Keep motion and audio signals controlled
              </span>
            </span>
          </button>
        )}
      </div>

      <Separator className="opacity-40" />

      <div className="p-3">
        <Button
          variant="ghost"
          size="lg"
          onClick={toggleSidebar}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </motion.aside>
  );
}
