'use client';

import { motion } from 'framer-motion';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { MobileNav } from './mobile-nav';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useIsDesktop } from '@/hooks/use-media-query';
import { useMounted } from '@/hooks/use-mounted';
import { Badge } from '@/components/ui/badge';
import { usePathname } from 'next/navigation';
import { getPageContext } from './page-context';
import { ConnectionIndicator } from './connection-indicator';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useSettingsStore();
  const { balance, isLowBalance } = useBalanceStore();
  const isDesktop = useIsDesktop();
  const mounted = useMounted();
  const pathname = usePathname();
  const pageContext = getPageContext(pathname);

  const marginLeft = mounted && isDesktop ? (sidebarCollapsed ? 72 : 260) : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 surface-grid opacity-15" />
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <header className="fixed top-0 left-0 right-0 z-30 flex h-12 items-center gap-2.5 border-b border-white/6 bg-background/95 px-3 backdrop-blur-sm md:hidden">
        <MobileNav />
        <div className="min-w-0">
          <span className="block truncate font-display text-sm font-semibold tracking-tight">
            {pageContext.title}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {pageContext.game ? `${pageContext.game.category} · ${pageContext.game.risk}` : 'Terminal'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pageContext.usesStream ? <ConnectionIndicator /> : null}
          <span className={`font-mono-game text-[13px] font-bold tabular-nums ${isLowBalance ? 'text-destructive' : 'text-primary'}`}>
            {mounted ? balance.toLocaleString() : '—'}
          </span>
          <Badge variant="outline" className="border-white/8 bg-white/[0.03] text-muted-foreground">
            Demo
          </Badge>
        </div>
      </header>

      <div className="hidden md:block">
        <TopBar />
      </div>

      <motion.main
        className="min-h-screen pt-12 md:pt-14"
        animate={{ marginLeft }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <div className="app-container relative z-10">{children}</div>
      </motion.main>
    </div>
  );
}
