// Central pub/sub event bus — all real-time data flows through here.
// WebSocket clients subscribe to topics; internal services publish to them.

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

export type EventTopic =
  | 'system.metrics'
  | 'session.update'
  | 'session.event'
  | 'agent.update'
  | 'cost.update'
  | 'alert.new'
  | 'alert.resolved'
  | 'job.update'
  | 'log.new'
  | 'insight.new'
  | 'memory.update'
  | 'kb.update';

export interface BusEvent<T = unknown> {
  topic: EventTopic;
  workspace?: string;
  data: T;
  ts: string;
}

interface ClientMeta {
  ws: WebSocket;
  workspace: string;
  topics: Set<EventTopic> | 'all';
}

class EventBus {
  private clients: Map<string, ClientMeta> = new Map();
  private clientCounter = 0;

  attach(wss: WebSocketServer) {
    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const id = `client_${++this.clientCounter}`;
      const url = new URL(req.url || '/', `http://localhost`);
      const workspace = url.searchParams.get('workspace') || 'default';
      const topicsParam = url.searchParams.get('topics');

      const topics: Set<EventTopic> | 'all' = topicsParam
        ? new Set(topicsParam.split(',') as EventTopic[])
        : 'all';

      this.clients.set(id, { ws, workspace, topics });

      ws.on('close', () => this.clients.delete(id));
      ws.on('error', () => this.clients.delete(id));

      // Send welcome snapshot
      ws.send(JSON.stringify({ type: 'connected', id, workspace }));
    });
  }

  publish<T>(event: BusEvent<T>) {
    const msg = JSON.stringify({ type: 'event', ...event });
    for (const [, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (event.workspace && client.workspace !== event.workspace && event.workspace !== '*') continue;
      if (client.topics !== 'all' && !client.topics.has(event.topic)) continue;
      try { client.ws.send(msg); } catch { /* ignore */ }
    }
  }

  emit<T>(topic: EventTopic, data: T, workspace = '*') {
    this.publish({ topic, workspace, data, ts: new Date().toISOString() });
  }

  get connectionCount() {
    return this.clients.size;
  }
}

export const bus = new EventBus();
