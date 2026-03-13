'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { DerivClient, getDerivClient } from './client';

const DerivContext = createContext<DerivClient | null>(null);

export function DerivProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<DerivClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = getDerivClient();
  }

  useEffect(() => {
    const client = clientRef.current!;
    client.connect();
    return () => {
      // Don't dispose on unmount since it's a singleton — just let it persist
    };
  }, []);

  return (
    <DerivContext.Provider value={clientRef.current}>
      {children}
    </DerivContext.Provider>
  );
}

export function useDerivClient(): DerivClient {
  const client = useContext(DerivContext);
  if (!client) {
    throw new Error('useDerivClient must be used within a DerivProvider');
  }
  return client;
}
