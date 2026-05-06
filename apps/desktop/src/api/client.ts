/**
 * Тонкий fetch-обёртка с авто-refresh при 401 и единой обработкой ошибок API.
 * Не зависит от React/Tauri — может использоваться из любого слоя.
 */

export interface ApiErrorBody {
  error: string;
  code?: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Текущий access-токен (in-memory). */
  getAccessToken: () => string | null;
  /** Обновить токены (вызывается при 401). Возвращает новый access или null если refresh упал. */
  refreshTokens: () => Promise<string | null>;
  /** Вызывается когда мы окончательно невалидны — фронт уводит на /login. */
  onAuthLost: () => void;
}

interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  /** Установить true чтобы не пытаться авто-refresh при 401 (например для самого /auth/refresh). */
  skipRefresh?: boolean;
}

export class ApiClient {
  private readonly opts: ApiClientOptions;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(opts: ApiClientOptions) {
    this.opts = opts;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = `${this.opts.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...opts.headers,
    };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const access = this.opts.getAccessToken();
    if (access && !headers.Authorization) headers.Authorization = `Bearer ${access}`;

    const res = await fetch(url, { ...opts, headers, body });

    if (res.status === 401 && !opts.skipRefresh) {
      const newAccess = await this.coalescedRefresh();
      if (!newAccess) {
        this.opts.onAuthLost();
        throw await this.toApiError(res);
      }
      // повторяем оригинальный запрос с новым access
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
      const retry = await fetch(url, { ...opts, headers: retryHeaders, body });
      return this.unwrap<T>(retry);
    }

    return this.unwrap<T>(res);
  }

  private async coalescedRefresh(): Promise<string | null> {
    this.refreshInFlight ??= this.opts.refreshTokens().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async unwrap<T>(res: Response): Promise<T> {
    if (res.ok) {
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }
    throw await this.toApiError(res);
  }

  private async toApiError(res: Response): Promise<ApiError> {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = { error: 'NetworkError', message: res.statusText || `HTTP ${res.status}` };
    }
    return new ApiError(res.status, body);
  }
}
