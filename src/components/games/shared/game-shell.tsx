'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HeaderNavigationBlock,
  Item,
  ItemContent,
  ItemTitle,
  NavigationButton,
} from '@trading-game/design-intelligence-layer';
import {
  Activity,
  Info,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  Check,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useMounted } from '@/hooks/use-mounted';
import { useIsDesktop } from '@/hooks/use-media-query';
import { GameInfoDrawer, type GameInfoSection } from './game-info-drawer';
import { SUPPORTED_SYMBOLS } from '@/types';
import type { DerivSymbol } from '@/types';

interface GameShellProps {
  children: React.ReactNode;
  infoSections?: GameInfoSection[];
  showSymbolPicker?: boolean;
}

export function GameShell({
  children,
  infoSections = [],
  showSymbolPicker = true,
}: GameShellProps) {
  const router = useRouter();
  const mounted = useMounted();
  const isDesktop = useIsDesktop();
  const { selectedIndex, setSelectedIndex, soundEnabled, setSoundEnabled } =
    useSettingsStore();
  const { balance, resetBalance } = useBalanceStore();
  const [resetOpen, setResetOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [symbolDrawerOpen, setSymbolDrawerOpen] = useState(false);

  const selectedSymbol = SUPPORTED_SYMBOLS.find((s) => s.id === selectedIndex);

  const symbolPickerButton = (
    <NavigationButton
      size="md"
      aria-label="Market symbol"
      onClick={() => {
        if (!isDesktop) setSymbolDrawerOpen(true);
      }}
    >
      <Activity className="w-5 h-5" />
    </NavigationButton>
  );

  return (
    <div className="fixed inset-0 flex justify-center bg-prominent overflow-hidden">
      <div className="flex flex-col w-full max-w-[608px] h-[100dvh] min-h-0 overflow-hidden">
        <HeaderNavigationBlock
          onBack={() => router.push('/')}
          badge={{ label: 'Demo', variant: 'fill-demo' }}
          balance={{
            amount: mounted ? balance.toLocaleString() : '—',
            currency: 'Credits',
          }}
          actions={
            <>
              {showSymbolPicker ? (
                isDesktop ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>{symbolPickerButton}</DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {SUPPORTED_SYMBOLS.map((sym) => (
                        <DropdownMenuItem
                          key={sym.id}
                          onClick={() => setSelectedIndex(sym.id as DerivSymbol)}
                        >
                          <span>{sym.name}</span>
                          <span className="ml-4 text-on-subtle text-xs">{sym.tickFreq}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  symbolPickerButton
                )
              ) : null}

              {infoSections.length > 0 ? (
                <NavigationButton
                  size="md"
                  aria-label="Game info"
                  onClick={() => setInfoOpen(true)}
                >
                  <Info className="w-5 h-5" />
                </NavigationButton>
              ) : null}

              <NavigationButton
                size="md"
                onClick={() => setSoundEnabled(!soundEnabled)}
                aria-label={soundEnabled ? 'Mute' : 'Unmute'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-5 h-5" />
                ) : (
                  <VolumeX className="w-5 h-5" />
                )}
              </NavigationButton>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <NavigationButton size="md" aria-label="Settings">
                    <Settings className="w-5 h-5" />
                  </NavigationButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setResetOpen(true)}>
                    <RotateCcw className="w-4 h-4" />
                    Reset balance
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{children}</div>

        {infoSections.length > 0 ? (
          <GameInfoDrawer
            open={infoOpen}
            onOpenChange={setInfoOpen}
            sections={infoSections}
          />
        ) : null}

        {showSymbolPicker && !isDesktop ? (
          <Drawer open={symbolDrawerOpen} onOpenChange={setSymbolDrawerOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Select market</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-safe space-y-1">
                {SUPPORTED_SYMBOLS.map((sym) => (
                  <Item
                    key={sym.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedIndex(sym.id as DerivSymbol);
                      setSymbolDrawerOpen(false);
                    }}
                  >
                    <ItemContent>
                      <ItemTitle>{sym.name}</ItemTitle>
                    </ItemContent>
                    {selectedIndex === sym.id ? (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    ) : null}
                  </Item>
                ))}
              </div>
            </DrawerContent>
          </Drawer>
        ) : null}

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent showCloseButton>
            <DialogHeader>
              <DialogTitle>Reset balance</DialogTitle>
              <DialogDescription>
                Reset demo balance to 10,000 credits. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
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
    </div>
  );
}
