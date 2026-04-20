// WebSocket client that reconnects automatically and dispatches typed events.
export type EventTopic =
  | 'system.metrics' | 'session.update' | 'session.event'
  | 'agent.update'   | 'cost.update'    | 'alert.new'
  | 'alert.resolved' | 'job.update'     | 'log.new'
  | 'insight.new'    | 'memory.update'  | 'kb.update';

type Handler<T = unknown> = (data: T) => void;

class LiveSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<Handler>> = new Map();
  private reconnectDelay = 1000;
  private workspace = 'default';
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(workspace = 'default') {
    if (typeof window === 'undefined') return;
    this.workspace = workspace;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.open();
  }

  private open() {
    const url = `${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4001'}?workspace=${this.workspace}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.dispatch('__connected', true);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'event') {
          this.dispatch(msg.topic, msg.data);
          this.dispatch('*', msg);
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.dispatch('__disconnected', true);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => { this.ws?.close(); };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }, this.reconnectDelay);
  }

  on<T>(topic: string, handler: Handler<T>) {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic)!.add(handler as Handler);
    return () => this.off(topic, handler);
  }

  off<T>(topic: string, handler: Handler<T>) {
    this.handlers.get(topic)?.delete(handler as Handler);
  }

  private dispatch(topic: string, data: unknown) {
    this.handlers.get(topic)?.forEach(h => h(data));
  }

  get isConnected() { return this.connected; }
  get connectionCount() { return this.handlers.size; }
}

export const liveSocket = new LiveSocket();
