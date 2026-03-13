'use strict';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DerivSymbol } from '@/types';

interface SettingsState {
  selectedIndex: DerivSymbol;
  soundEnabled: boolean;
  reducedMotion: boolean;
  sidebarCollapsed: boolean;
  setSelectedIndex: (index: DerivSymbol) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedIndex: 'R_100',
      soundEnabled: true,
      reducedMotion: false,
      sidebarCollapsed: false,

      setSelectedIndex: (index) => set({ selectedIndex: index }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'ideations-settings',
    }
  )
);
