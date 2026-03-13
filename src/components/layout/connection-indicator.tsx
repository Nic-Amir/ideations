'use client';

import { useDerivConnection } from '@/hooks/use-tick-stream';
import { useMounted } from '@/hooks/use-mounted';

const STATUS_CONFIG = {
  connected: { color: 'bg-emerald-400', label: 'Live feed', tone: 'text-emerald-300' },
  connecting: { color: 'bg-amber-400', label: 'Connecting', tone: 'text-amber-200' },
  reconnecting: { color: 'bg-amber-400', label: 'Reconnecting', tone: 'text-amber-200' },
  disconnected: { color: 'bg-rose-400', label: 'Disconnected', tone: 'text-rose-200' },
} as const;

export function ConnectionIndicator() {
  const status = useDerivConnection();
  const mounted = useMounted();

  if (!mounted) return null;

  const config = STATUS_CONFIG[status];

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-1.5">
      <span
        className={`relative flex h-2.5 w-2.5 rounded-full ${config.color}`}
      >
        {(status === 'connected' || status === 'reconnecting') && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.color} opacity-50`}
          />
        )}
      </span>
      <span className={`text-[11px] font-medium ${config.tone}`}>{config.label}</span>
    </div>
  );
}
