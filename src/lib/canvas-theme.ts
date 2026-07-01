'use strict';

export interface CanvasTheme {
  background: string;
  subtle: string;
  card: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  primary: string;
  secondaryHover: string;
  borderSubtle: string;
  borderProminent: string;
  win: string;
  loss: string;
  warning: string;
  info: string;
  fontFamily: string;
}

let probeEl: HTMLDivElement | null = null;

function resolve(varName: string, fallback = '#000'): string {
  if (typeof document === 'undefined') return fallback;
  if (!probeEl) {
    probeEl = document.createElement('div');
    probeEl.style.display = 'none';
    document.body.appendChild(probeEl);
  }
  probeEl.style.color = `var(${varName})`;
  const c = getComputedStyle(probeEl).color;
  return c || fallback;
}

export function withAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(',').map((s) => parseFloat(s.trim()));
    return `rgba(${parts[0] || 0},${parts[1] || 0},${parts[2] || 0},${alpha})`;
  }
  return color;
}

export function resolveTheme(): CanvasTheme {
  let fontFamily =
    '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.style.display = 'none';
    el.style.fontFamily =
      'var(--font-plus-jakarta-sans, "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif)';
    document.body.appendChild(el);
    fontFamily = getComputedStyle(el).fontFamily || fontFamily;
    document.body.removeChild(el);
  }

  return {
    background: resolve('--prominent', '#ffffff'),
    subtle: resolve('--subtle', '#f5f5f5'),
    card: resolve('--card', '#ffffff'),
    textPrimary: resolve('--on-prominent', '#000000'),
    textSecondary: resolve('--on-subtle', '#666666'),
    textInverse: resolve('--on-prominent-static-inverse', '#ffffff'),
    primary: resolve('--primary', '#2323ff'),
    secondaryHover: resolve('--secondary-hover', '#f5f5f5'),
    borderSubtle: resolve('--border-subtle', '#eeeeee'),
    borderProminent: resolve('--border-prominent', '#000000'),
    win: resolve('--semantic-win', '#008832'),
    loss: resolve('--semantic-loss', '#ff3355'),
    warning: resolve('--semantic-warning', '#ff6600'),
    info: resolve('--semantic-info', '#3daaff'),
    fontFamily,
  };
}
