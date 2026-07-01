'use client';

import { useDerivConnection } from '@/hooks/use-tick-stream';
import { useMounted } from '@/hooks/use-mounted';

const STATUS_CONFIG = {
  connected: { color: 'bg-semantic-win', label: 'Live feed', tone: 'text-semantic-win' },
  connecting: { color: 'bg-semantic-warning', label: 'Connecting', tone: 'text-semantic-warning' },
  reconnecting: { color: 'bg-semantic-warning', label: 'Reconnecting', tone: 'text-semantic-warning' },
  disconnected: { color: 'bg-semantic-loss', label: 'Disconnected', tone: 'text-semantic-loss' },
} as const;

export function ConnectionIndicator() {
  const status = useDerivConnection();
  const mounted = useMounted();

  if (!mounted) return null;

  const config = STATUS_CONFIG[status];

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`relative flex h-1.5 w-1.5 rounded-full ${config.color}`}
      >
        {(status === 'connected' || status === 'reconnecting') && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.color} opacity-40`}
          />
        )}
      </span>
      <span className={`text-xs font-medium ${config.tone}`}>{config.label}</span>
    </div>
  );
}
