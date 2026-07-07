'use strict';

import { useCallback, useRef } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
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

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function useBarrierTouchSound() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const ctxRef = useRef<AudioContext | null>(null);

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

  /** Ding per entry-line crossing; pitch climbs with the running count. */
  const playCrossing = useCallback(
    (count: number) => {
      if (soundEnabled) {
        const ctx = ensureContext();
        if (ctx) {
          const step = Math.min(count, 6);
          playTone(ctx, 660 + step * 110, 0.1, 0.09, 'triangle');
        }
      }
      vibrate(10);
    },
    [soundEnabled, ensureContext],
  );

  /** Two-note rising chirp when a sequence leg completes. */
  const playLegComplete = useCallback(
    (leg: 1 | 2) => {
      if (soundEnabled) {
        const ctx = ensureContext();
        if (ctx) {
          const base = leg === 1 ? 740 : 880;
          playTone(ctx, base, 0.09, 0.09, 'square');
          setTimeout(() => {
            if (!ctxRef.current || ctxRef.current.state === 'closed') return;
            playTone(ctxRef.current, base * 1.25, 0.12, 0.08, 'square');
          }, 90);
        }
      }
      vibrate([12, 30, 12]);
    },
    [soundEnabled, ensureContext],
  );

  /** Low thud when the wrong barrier is touched first (sequence busted). */
  const playBust = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 180, 0.22, 0.09, 'sawtooth');
    }
    vibrate([30, 40, 30]);
  }, [soundEnabled, ensureContext]);

  const playWin = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) {
        [523, 659, 784].forEach((freq, i) => {
          setTimeout(() => {
            if (!ctxRef.current || ctxRef.current.state === 'closed') return;
            playTone(ctxRef.current, freq, 0.16, 0.09, 'sine');
          }, i * 90);
        });
      }
    }
    vibrate([15, 30, 15, 30, 30]);
  }, [soundEnabled, ensureContext]);

  const playLoss = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 220, 0.2, 0.08, 'sine');
    }
    vibrate(40);
  }, [soundEnabled, ensureContext]);

  return {
    playCrossing,
    playLegComplete,
    playBust,
    playWin,
    playLoss,
  };
}
