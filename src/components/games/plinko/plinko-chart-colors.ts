'use strict';

import { resolveTheme, withAlpha } from '@/lib/canvas-theme';

export function getPlinkoChartColors() {
  const theme = resolveTheme();
  return {
    bg: theme.subtle,
    grid: withAlpha(theme.borderSubtle, 0.6),
    startLine: withAlpha(theme.textSecondary, 0.4),
    text: theme.textSecondary,
    textMuted: theme.textSecondary,
    pathUp: theme.win,
    pathDown: theme.loss,
    pathUpFaint: withAlpha(theme.win, 0.15),
    pathDownFaint: withAlpha(theme.loss, 0.15),
    pathUpGlow: withAlpha(theme.win, 0.6),
    pathDownGlow: withAlpha(theme.loss, 0.6),
    emptyPrompt: theme.textSecondary,
    digitBadgeBg: withAlpha(theme.textPrimary, 0.1),
    digitBadgeText: theme.textPrimary,
    zoneFlash: withAlpha(theme.textPrimary, 0.35),
  };
}

export function getChartPadding(rightStripWidth: number) {
  return { top: 20, right: rightStripWidth, bottom: 32, left: 56 };
}

export function getPayoutStripWidth(chartWidth: number): number {
  return chartWidth < 480 ? 48 : 64;
}
