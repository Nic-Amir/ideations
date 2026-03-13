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

  const marginLeft = mounted && isDesktop ? (sidebarCollapsed ? 88 : 288) : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 surface-grid opacity-25" />
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center gap-3 border-b border-white/8 bg-[rgba(9,17,28,0.82)] px-3 backdrop-blur-xl md:hidden">
        <MobileNav />
        <div className="min-w-0">
          <span className="block truncate font-display text-base font-semibold tracking-tight">
            {pageContext.title}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {pageContext.game ? `${pageContext.game.category} · ${pageContext.game.risk} risk` : 'Terminal overview'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pageContext.usesStream ? <ConnectionIndicator /> : null}
          <span className={`font-mono-game text-sm font-bold ${isLowBalance ? 'text-destructive' : 'text-primary'}`}>
            {mounted ? balance.toLocaleString() : '—'}
          </span>
          <Badge variant="outline" className="rounded-full border-white/10 bg-white/4 px-2 py-0 text-[10px] text-muted-foreground">
            Demo
          </Badge>
        </div>
      </header>

      {/* Desktop top bar */}
      <div className="hidden md:block">
        <TopBar />
      </div>

      {/* Main content */}
      <motion.main
        className="min-h-screen pt-16 md:pt-[4.5rem]"
        animate={{ marginLeft }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <div className="app-container relative z-10">{children}</div>
      </motion.main>
    </div>
  );
}
