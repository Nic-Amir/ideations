'use client';

import { useDerivConnection, useFeedSource } from '@/hooks/use-tick-stream';
import { useMounted } from '@/hooks/use-mounted';

const STATUS_CONFIG = {
  connected: { color: 'bg-semantic-win', label: 'Live feed', tone: 'text-semantic-win' },
  connecting: { color: 'bg-semantic-warning', label: 'Connecting', tone: 'text-semantic-warning' },
  reconnecting: { color: 'bg-semantic-warning', label: 'Reconnecting', tone: 'text-semantic-warning' },
  disconnected: { color: 'bg-semantic-loss', label: 'Disconnected', tone: 'text-semantic-loss' },
} as const;

const DEMO_CONFIG = {
  color: 'bg-semantic-warning',
  label: 'Demo feed',
  tone: 'text-semantic-warning',
} as const;

export function ConnectionIndicator() {
  const status = useDerivConnection();
  const feedSource = useFeedSource();
  const mounted = useMounted();

  if (!mounted) return null;

  const config =
    status === 'connected' && feedSource === 'demo'
      ? DEMO_CONFIG
      : STATUS_CONFIG[status];

  const showPulse =
    status === 'connected' || status === 'reconnecting';

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`relative flex h-1.5 w-1.5 rounded-full ${config.color}`}
      >
        {showPulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.color} opacity-40`}
          />
        )}
      </span>
      <span className={`text-xs font-medium ${config.tone}`}>{config.label}</span>
    </div>
  );
}
