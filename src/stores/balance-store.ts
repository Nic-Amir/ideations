'use strict';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_BALANCE = 10_000;
const LOW_BALANCE_THRESHOLD = 100;

interface BalanceState {
  balance: number;
  isLowBalance: boolean;
  totalWagered: number;
  totalWon: number;
  placeBet: (amount: number) => boolean;
  addWinnings: (amount: number) => void;
  adjustBalance: (amount: number) => void;
  resetBalance: () => void;
}

export const useBalanceStore = create<BalanceState>()(
  persist(
    (set, get) => ({
      balance: DEFAULT_BALANCE,
      isLowBalance: false,
      totalWagered: 0,
      totalWon: 0,

      placeBet: (amount: number) => {
        const { balance } = get();
        if (amount <= 0 || amount > balance) return false;
        set((state) => ({
          balance: state.balance - amount,
          isLowBalance: state.balance - amount < LOW_BALANCE_THRESHOLD,
          totalWagered: state.totalWagered + amount,
        }));
        return true;
      },

      addWinnings: (amount: number) => {
        if (amount <= 0) return;
        set((state) => ({
          balance: state.balance + amount,
          isLowBalance: state.balance + amount < LOW_BALANCE_THRESHOLD,
          totalWon: state.totalWon + amount,
        }));
      },

      adjustBalance: (amount: number) => {
        if (amount === 0) return;
        set((state) => {
          const nextBalance = Math.max(0, state.balance + amount);
          return {
            balance: nextBalance,
            isLowBalance: nextBalance < LOW_BALANCE_THRESHOLD,
          };
        });
      },

      resetBalance: () => {
        set({
          balance: DEFAULT_BALANCE,
          isLowBalance: false,
          totalWagered: 0,
          totalWon: 0,
        });
      },
    }),
    {
      name: 'ideations-balance',
    }
  )
);
