'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@trading-game/design-intelligence-layer';
import { cn } from '@/lib/utils';
import type { SettleChipNotice } from '@/hooks/use-volatility-plinko';

const VARIANT_BADGE: Record<
  NonNullable<SettleChipNotice['variant']>,
  'standard' | 'fill-warning' | 'fill-success' | 'fill' | 'ghost-fail'
> = {
  core: 'ghost-fail',
  nearMiss: 'fill-warning',
  micro: 'fill-success',
  win: 'fill-success',
  batch: 'fill',
};

export function PlinkoSettleChip({ chip }: { chip: SettleChipNotice | null }) {
  const positive = (chip?.netPL ?? 0) >= 0;
  const variantKey = chip?.variant ?? (chip?.kind === 'batch' ? 'batch' : positive ? 'win' : 'core');
  const payout = chip?.payout;
  const payoutWin = payout !== undefined && payout >= 1;

  return (
    <AnimatePresence mode="wait">
      {chip ? (
        <motion.div
          key={chip.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex justify-center px-3 py-1"
        >
          <Badge
            variant={VARIANT_BADGE[variantKey]}
            size="md"
            className="gap-2 px-3 py-1.5 font-display tabular-nums"
          >
            {chip.kind === 'batch' ? (
              <span className="body-sm text-on-prominent">
                {chip.count} paths · {chip.wins} wins · {positive ? '+' : ''}
                {chip.netPL.toFixed(0)} cr
              </span>
            ) : (
              <>
                {payout !== undefined ? (
                  <span
                    className={cn(
                      'body-sm font-bold leading-none',
                      payoutWin ? 'text-semantic-win' : 'text-semantic-loss',
                    )}
                  >
                    {payout}×
                  </span>
                ) : null}
                {chip.zoneLabel ? (
                  <span className="body-xs text-on-subtle">{chip.zoneLabel}</span>
                ) : null}
                <span
                  className={cn(
                    'body-xs font-semibold',
                    positive ? 'text-semantic-win' : 'text-semantic-loss',
                  )}
                >
                  {positive ? '+' : ''}
                  {chip.netPL.toFixed(0)} cr
                </span>
              </>
            )}
          </Badge>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
