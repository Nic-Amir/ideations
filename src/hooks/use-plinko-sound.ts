'use strict';

import { useCallback, useRef } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function usePlinkoSound() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef(new Map<number, number>());

  const ensureContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = getAudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }, []);

  const playTick = useCallback(
    (runId: number, tickIndex: number) => {
      if (!soundEnabled) return;
      const prev = lastTickRef.current.get(runId);
      if (prev === tickIndex) return;
      lastTickRef.current.set(runId, tickIndex);
      const ctx = ensureContext();
      if (!ctx) return;
      playTone(ctx, 880 + tickIndex * 40, 0.04, 0.06, 'triangle');
    },
    [soundEnabled, ensureContext],
  );

  const playLand = useCallback(
    (payout: number) => {
      if (!soundEnabled) return;
      const ctx = ensureContext();
      if (!ctx) return;
      const baseFreq = payout >= 10 ? 660 : payout >= 1 ? 440 : 220;
      playTone(ctx, baseFreq, 0.12, 0.1, 'sine');
      if (payout >= 1) {
        setTimeout(() => {
          if (!ctxRef.current || ctxRef.current.state === 'closed') return;
          playTone(ctxRef.current, baseFreq * 1.5, 0.1, 0.08, 'sine');
        }, 80);
      }
    },
    [soundEnabled, ensureContext],
  );

  const playBigWin = useCallback(() => {
    if (!soundEnabled) return;
    const ctx = ensureContext();
    if (!ctx) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => {
        if (!ctxRef.current || ctxRef.current.state === 'closed') return;
        playTone(ctxRef.current, freq, 0.18, 0.09, 'sine');
      }, i * 100);
    });
  }, [soundEnabled, ensureContext]);

  const clearRunTicks = useCallback((runId: number) => {
    lastTickRef.current.delete(runId);
  }, []);

  return { playTick, playLand, playBigWin, clearRunTicks };
}
