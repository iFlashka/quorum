/**
 * WebSocketManager — singleton-обёртка над одним WS-соединением к серверу.
 *
 * Отвечает за:
 *   - auth: при connect шлёт {t: hello, access}
 *   - 4001 auth_failed → пробуем refresh tokens, реконнект
 *   - exponential backoff с джиттером при network drop
 *   - heartbeat: каждые 25s шлём {t: ping}, сервер отвечает pong (или закроет за 60s)
 *   - dispatch ServerEvent в подписчиков (UI компоненты через `subscribe`)
 *
 * Пользователь api: get/set runtime + автоматическое подключение когда auth есть.
 */

import {
  ClientEventSchema,
  ServerEventSchema,
  type ClientEvent,
  type ServerEvent,
} from '@quorum/shared';

const PING_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed';

export interface WebSocketManagerDeps {
  /** Базовый HTTP-URL сервера (`http://...` / `https://...`); WS-URL вычисляется. */
  baseUrl: string;
  /** Текущий access-токен или null если разлогинены. */
  getAccessToken: () => string | null;
  /** Если access протух — пытаемся обновить и вернуть новый access. */
  refreshAccess: () => Promise<string | null>;
  /** Колбэк когда сервер отверг auth (после двух неудачных попыток refresh). */
  onAuthLost: () => void;
}

type Listener = (event: ServerEvent) => void;

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private wantOpen = false;
  private refreshTriedThisCycle = false;

  constructor(private readonly deps: WebSocketManagerDeps) {}

  /** Открыть соединение (idempotent). */
  connect(): void {
    this.wantOpen = true;
    if (this.status === 'connecting' || this.status === 'open') return;
    this.openSocket();
  }

  /** Закрыть и больше не реконнектить. */
  disconnect(): void {
    this.wantOpen = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.tearDownSocket();
    this.setStatus('idle');
  }

  /** Отправить событие серверу. Если соединение не open — silently dropped. */
  send(event: ClientEvent): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const parsed = ClientEventSchema.safeParse(event);
    if (!parsed.success) return;
    this.socket.send(JSON.stringify(parsed.data));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ---- internals ----

  private openSocket(): void {
    const access = this.deps.getAccessToken();
    if (!access) {
      this.setStatus('idle');
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const wsUrl =
      this.deps.baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      // Шлём hello первым же frame'ом — server ждёт 5s.
      socket.send(JSON.stringify({ t: 'hello', access }));
    });

    socket.addEventListener('message', (e) => {
      this.onMessage(e.data as string);
    });

    socket.addEventListener('close', (e) => {
      this.tearDownSocket();
      if (e.code === 4001) {
        // auth_failed: пробуем refresh один раз за цикл.
        if (!this.refreshTriedThisCycle) {
          this.refreshTriedThisCycle = true;
          void (async (): Promise<void> => {
            const fresh = await this.deps.refreshAccess();
            if (fresh && this.wantOpen) {
              this.scheduleReconnect(0);
            } else {
              this.deps.onAuthLost();
              this.setStatus('failed');
            }
          })();
          return;
        }
        this.deps.onAuthLost();
        this.setStatus('failed');
        return;
      }
      if (this.wantOpen) {
        this.scheduleReconnect();
      } else {
        this.setStatus('idle');
      }
    });

    socket.addEventListener('error', () => {
      // close дойдёт следом, там reconnect.
    });
  }

  private onMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const result = ServerEventSchema.safeParse(parsed);
    if (!result.success) return;
    const event = result.data;

    if (event.t === 'ready') {
      this.reconnectAttempts = 0;
      this.refreshTriedThisCycle = false;
      this.setStatus('open');
      this.startPing();
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Один listener не должен ронять остальных.
      }
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ t: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private tearDownSocket(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.socket) {
      // remove listeners — на всякий случай, чтобы они не сработали ещё раз.
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
  }

  private scheduleReconnect(overrideDelay?: number): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts += 1;
    this.setStatus('reconnecting');
    const delay =
      overrideDelay ??
      Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6)),
      ) + Math.random() * 250;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantOpen) this.openSocket();
    }, delay);
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch {
        // ignore
      }
    }
  }
}
