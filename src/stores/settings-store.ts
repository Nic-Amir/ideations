'use strict';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DerivSymbol } from '@/types';

interface SettingsState {
  selectedIndex: DerivSymbol;
  soundEnabled: boolean;
  reducedMotion: boolean;
  setSelectedIndex: (index: DerivSymbol) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedIndex: '1HZ100V',
      soundEnabled: true,
      reducedMotion: false,

      setSelectedIndex: (index) => set({ selectedIndex: index }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
    }),
    {
      name: 'ideations-settings',
    }
  )
);
