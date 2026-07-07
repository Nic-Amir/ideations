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

export function useDerbySound() {
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

  /** Soft gallop tick per race tick; pitch and volume rise in the stretch. */
  const playGallopTick = useCallback(
    (tickIndex: number, stretchProgress: number) => {
      if (!soundEnabled) return;
      if (tickIndex === lastTickRef.current) return;
      lastTickRef.current = tickIndex;

      const ctx = ensureContext();
      if (!ctx) return;
      const inStretch = stretchProgress > 0;
      playTone(
        ctx,
        190 + (tickIndex % 2) * 24 + stretchProgress * 90,
        0.04,
        0.03 + stretchProgress * 0.03,
        'triangle',
      );
      if (inStretch && tickIndex % 2 === 0) vibrate(6);
    },
    [soundEnabled, ensureContext],
  );

  /** Blip when one of the picked horses gains a rank. */
  const playRankGain = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 880, 0.07, 0.06, 'square');
    }
  }, [soundEnabled, ensureContext]);

  /** Lower blip when a picked horse loses a rank. */
  const playRankLoss = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 330, 0.07, 0.045, 'square');
    }
  }, [soundEnabled, ensureContext]);

  /** Photo-finish sting at the line. */
  const playFinish = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) playTone(ctx, 1180, 0.16, 0.09, 'square');
    }
    vibrate([12, 40, 12]);
  }, [soundEnabled, ensureContext]);

  const playWin = useCallback(() => {
    if (soundEnabled) {
      const ctx = ensureContext();
      if (ctx) {
        [523, 659, 784, 1047].forEach((freq, i) => {
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

  const resetRace = useCallback(() => {
    lastTickRef.current = -1;
  }, []);

  return {
    playGallopTick,
    playRankGain,
    playRankLoss,
    playFinish,
    playWin,
    playLoss,
    resetRace,
  };
}
