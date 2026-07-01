'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, CardContent } from '@trading-game/design-intelligence-layer';
import { cn } from '@/lib/utils';

export type ResultTier = 'loss' | 'push' | 'win' | 'bigWin';

export interface ResultOverlayProps {
  open: boolean;
  won: boolean;
  title: string;
  subtitle?: string;
  amount?: number;
  amountLabel?: string;
  onDismiss: () => void;
  autoDismissMs?: number;
  primaryAction?: { label: string; onClick: () => void };
  tier?: ResultTier;
}

function tierStyles(tier: ResultTier) {
  switch (tier) {
    case 'bigWin':
      return {
        badge: 'bg-primary/15 text-primary',
        amount: 'text-primary',
        icon: '★',
      };
    case 'win':
      return {
        badge: 'bg-semantic-win/15 text-semantic-win',
        amount: 'text-semantic-win',
        icon: '✓',
      };
    case 'push':
      return {
        badge: 'bg-subtle text-on-subtle',
        amount: 'text-on-prominent',
        icon: '=',
      };
    case 'loss':
    default:
      return {
        badge: 'bg-semantic-loss/15 text-semantic-loss',
        amount: 'text-semantic-loss',
        icon: '✕',
      };
  }
}

export function getResultTierFromPayout(payout: number): ResultTier {
  if (payout < 1) return 'loss';
  if (payout < 1.05) return 'push';
  if (payout > 5) return 'bigWin';
  return 'win';
}

export function ResultOverlay({
  open,
  won,
  title,
  subtitle,
  amount,
  amountLabel,
  onDismiss,
  autoDismissMs = 0,
  primaryAction,
  tier,
}: ResultOverlayProps) {
  const resolvedTier = tier ?? (won ? 'win' : 'loss');
  const styles = tierStyles(resolvedTier);
  const showAsWin = resolvedTier === 'win' || resolvedTier === 'bigWin';

  useEffect(() => {
    if (!open || !autoDismissMs) return;
    const t = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [open, autoDismissMs, onDismiss]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={primaryAction ? undefined : onDismiss}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs"
          >
            <Card className="border border-border-subtle shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full text-2xl font-display font-bold',
                    styles.badge,
                  )}
                >
                  {styles.icon}
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-on-prominent">{title}</p>
                  {subtitle ? (
                    <p className="mt-1 text-sm text-on-subtle">{subtitle}</p>
                  ) : null}
                </div>
                {amount !== undefined ? (
                  <p
                    className={cn(
                      'font-display text-2xl font-bold tabular-nums',
                      styles.amount,
                    )}
                  >
                    {showAsWin ? '+' : resolvedTier === 'loss' ? '−' : ''}
                    {Math.abs(amount).toLocaleString()}
                    {amountLabel ? (
                      <span className="text-sm font-normal text-on-subtle ml-1">{amountLabel}</span>
                    ) : null}
                  </p>
                ) : null}
                {primaryAction ? (
                  <Button variant="primary" className="w-full min-h-[44px]" onClick={primaryAction.onClick}>
                    {primaryAction.label}
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full min-h-[44px]" onClick={onDismiss}>
                    Continue
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
