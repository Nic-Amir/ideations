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

/** Below this many per-tick σ from the barrier, approach ticks start playing. */
const APPROACH_SIGMA = 2;

export function useBarrierRaceSound() {
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

  /**
   * Rising tick as the closest asset approaches the barrier.
   * `closestSigma` is the smaller of the two assets' distances in per-tick σ;
   * pitch rises as it shrinks.
   */
  const playApproachTick = useCallback(
    (tickIndex: number, closestSigma: number) => {
      if (!soundEnabled) return;
      if (tickIndex === lastTickRef.current) return;
      lastTickRef.current = tickIndex;
      if (closestSigma > APPROACH_SIGMA || closestSigma <= 0) return;

      const ctx = ensureContext();
      if (!ctx) return;
      const closeness = 1 - closestSigma / APPROACH_SIGMA;
      playTone(ctx, 520 + closeness * 620, 0.045, 0.05 + closeness * 0.04, 'triangle');
      if (closeness > 0.75) vibrate(8);
    },
    [soundEnabled, ensureContext],
  );

  const playBarrierHit = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 1320, 0.15, 0.1, 'square');
    }
    vibrate([12, 40, 12]);
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

  const playRefund = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 440, 0.12, 0.07, 'sine');
    }
  }, [soundEnabled, ensureContext]);

  /** Two-note "register" chirp when a position is sold mid-race. */
  const playCashOut = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) {
        playTone(ctx, 740, 0.08, 0.09, 'triangle');
        setTimeout(() => {
          if (!ctxRef.current || ctxRef.current.state === 'closed') return;
          playTone(ctxRef.current, 988, 0.12, 0.08, 'triangle');
        }, 70);
      }
    }
    vibrate([10, 20, 10]);
  }, [soundEnabled, ensureContext]);

  const resetRace = useCallback(() => {
    lastTickRef.current = -1;
  }, []);

  return {
    playApproachTick,
    playBarrierHit,
    playWin,
    playLoss,
    playRefund,
    playCashOut,
    resetRace,
  };
}
