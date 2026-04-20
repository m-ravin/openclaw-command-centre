import { useEffect, useState } from 'react';
import { liveSocket } from '../lib/ws';
import type { EventTopic } from '../lib/ws';

export type { EventTopic };

export function useLiveData<T>(topic: EventTopic, initial: T): { data: T; connected: boolean } {
  const [data, setData] = useState<T>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsub      = liveSocket.on<T>(topic, setData);
    const unsubConn  = liveSocket.on('__connected',    () => setConnected(true));
    const unsubDisc  = liveSocket.on('__disconnected', () => setConnected(false));
    return () => { unsub(); unsubConn(); unsubDisc(); };
  }, [topic]);

  return { data, connected };
}

export function useLiveList<T extends { id: string }>(
  topic: EventTopic,
  initial: T[]
): { items: T[]; connected: boolean } {
  const [items, setItems]       = useState<T[]>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsub = liveSocket.on<T>(topic, (incoming) => {
      setItems(prev => {
        const idx = prev.findIndex(x => x.id === incoming.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = incoming; return next; }
        return [incoming, ...prev];
      });
    });
    const unsubConn = liveSocket.on('__connected',    () => setConnected(true));
    const unsubDisc = liveSocket.on('__disconnected', () => setConnected(false));
    return () => { unsub(); unsubConn(); unsubDisc(); };
  }, [topic]);

  return { items, connected };
}
