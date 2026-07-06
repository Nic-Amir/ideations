'use strict';

import { resolveTheme, withAlpha } from '@/lib/canvas-theme';

/** Same win/loss greens & reds as Split payout labels (`--semantic-win` / `--semantic-loss`). */
export function getPayoutOutcomeColors() {
  const theme = resolveTheme();
  return { win: theme.win, loss: theme.loss };
}

export function payoutOutcomeColor(payout: number): string {
  const { win, loss } = getPayoutOutcomeColors();
  return payout >= 1 ? win : loss;
}

export function getPlinkoChartColors() {
  const theme = resolveTheme();
  const { win, loss } = getPayoutOutcomeColors();
  return {
    bg: theme.background,
    grid: withAlpha(theme.borderSubtle, 0.6),
    gridActive: withAlpha(theme.primary, 0.12),
    startLine: withAlpha(theme.textSecondary, 0.4),
    text: theme.textSecondary,
    textMuted: theme.textSecondary,
    pathPrimary: theme.primary,
    pathPrimaryFaint: withAlpha(theme.primary, 0.15),
    pathPrimaryMuted: withAlpha(theme.primary, 0.5),
    pathPrimaryGlow: withAlpha(theme.primary, 0.6),
    semanticWin: win,
    semanticLoss: loss,
    emptyPrompt: theme.textSecondary,
    pricePillBg: theme.primary,
    pricePillText: theme.textInverse,
    pricePillShadow: withAlpha(theme.textPrimary, 0.15),
    warning: theme.warning,
    nearMissFlash: withAlpha(theme.warning, 0.55),
    zoneFlash: withAlpha(theme.textPrimary, 0.35),
  };
}

export function getChartPadding(rightStripWidth: number) {
  return { top: 20, right: rightStripWidth, bottom: 32, left: 56 };
}

export function getPayoutStripWidth(chartWidth: number): number {
  return chartWidth < 480 ? 62 : 78;
}
