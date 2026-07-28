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

const APPROACH_SIGMA = 1.5;

export function useSyntheticCouponSound() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef(-1);

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

  const playApproachTick = useCallback(
    (tickIndex: number, nearestSigma: number) => {
      if (!soundEnabled) return;
      if (tickIndex === lastTickRef.current) return;
      lastTickRef.current = tickIndex;
      if (nearestSigma > APPROACH_SIGMA || nearestSigma <= 0) return;

      const ctx = ensureContext();
      if (!ctx) return;
      const closeness = 1 - nearestSigma / APPROACH_SIGMA;
      playTone(ctx, 480 + closeness * 640, 0.045, 0.05 + closeness * 0.04, 'triangle');
      if (closeness > 0.75) vibrate(8);
    },
    [soundEnabled, ensureContext],
  );

  const playCoupon = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) {
        playTone(ctx, 880, 0.08, 0.08, 'sine');
        setTimeout(() => {
          if (!ctxRef.current || ctxRef.current.state === 'closed') return;
          playTone(ctxRef.current, 1175, 0.1, 0.07, 'sine');
        }, 70);
      }
    }
    vibrate(12);
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
      if (ctx) playTone(ctx, 180, 0.22, 0.09, 'sine');
    }
    vibrate(40);
  }, [soundEnabled, ensureContext]);

  const resetRound = useCallback(() => {
    lastTickRef.current = -1;
  }, []);

  return {
    playApproachTick,
    playCoupon,
    playWin,
    playLoss,
    resetRound,
  };
}
