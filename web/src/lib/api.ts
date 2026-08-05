/**
 * The ONLY way the frontend talks to the backend.
 *
 * Authentication is a session cookie set by /auth/login. Requests are made
 * same-origin (the dev server and the Static Web App both proxy /api), so the
 * httpOnly cookie rides along automatically — the browser never handles the
 * token, and there is nothing for this layer to attach.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

/** Error shape returned by the API (see shared/errors.ts on the server). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Multipart upload. When set, `body` is ignored. */
  formData?: FormData;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin", // send the session cookie
    ...(body !== undefined ? { body } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const parsed = (await res.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        res.status,
        parsed?.error?.code ?? "internal_error",
        parsed?.error?.message ?? res.statusText,
        parsed?.error?.details
      );
    }
    throw new ApiError(res.status, "internal_error", res.statusText || "Request failed");
  }

  return (isJson ? await res.json() : await res.text()) as T;
}

/**
 * Multipart upload that reports byte-level progress.
 *
 * `fetch` has no way to observe how much of a request body has been sent, so
 * this is the one call in this layer built on XMLHttpRequest. Cookie behaviour
 * is deliberately identical to `request()`: `withCredentials` is left at its
 * default of false, which sends the session cookie same-origin and withholds it
 * cross-origin — exactly what `credentials: "same-origin"` does.
 */
function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, "aborted", "Upload cancelled"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));

    xhr.upload.onprogress = (e) => {
      // `lengthComputable` is false for chunked bodies; leave the bar alone
      // rather than reporting a percentage we cannot actually compute.
      if (onProgress && e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const raw = xhr.responseText;

      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204 || raw === "") {
          resolve(undefined as T);
          return;
        }
        try {
          resolve((isJson ? JSON.parse(raw) : raw) as T);
        } catch {
          reject(new ApiError(xhr.status, "internal_error", "Malformed response from server"));
        }
        return;
      }

      let parsed: ApiErrorBody | null = null;
      if (isJson) {
        try {
          parsed = JSON.parse(raw) as ApiErrorBody;
        } catch {
          parsed = null;
        }
      }
      reject(
        new ApiError(
          xhr.status,
          parsed?.error?.code ?? "internal_error",
          parsed?.error?.message ?? xhr.statusText ?? "Upload failed",
          parsed?.error?.details
        )
      );
    };

    xhr.onerror = () =>
      reject(new ApiError(0, "network_error", "Connection lost during upload"));
    xhr.ontimeout = () => reject(new ApiError(0, "timeout", "Upload timed out"));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled"));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(formData);
  });
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { method: "GET", ...(query ? { query } : {}), ...(signal ? { signal } : {}) }),

  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),

  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),

  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", formData }),

  /** Multipart upload that reports send progress as a 0–100 percentage. */
  uploadWithProgress,

  /** Download a binary response (Excel export, PDF, …). */
  blob: async (path: string, query?: RequestOptions["query"]): Promise<Blob> => {
    const res = await fetch(buildUrl(path, query), { credentials: "same-origin" });
    if (!res.ok) {
      throw new ApiError(res.status, "internal_error", res.statusText || "Download failed");
    }
    return res.blob();
  },
};

/** Session profile returned by /me and /auth/login. */
export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "user";
  isActive: boolean;
}

/** Public Entra SSO status for the login page. */
export interface SsoPublicConfig {
  enabled: boolean;
  tenantId?: string | null;
  clientId?: string | null;
}

/** Full Entra SSO configuration (admin). */
export interface SsoConfig {
  enabled: boolean;
  tenantId: string | null;
  clientId: string | null;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<SessionUser>("/auth/login", { email, password }),
  logout: () => api.post<{ ok: boolean }>("/auth/logout"),
  me: () => api.get<SessionUser>("/me"),

  /** Whether the login page should offer Microsoft sign-in (+ its public ids). */
  ssoConfig: () => api.get<SsoPublicConfig>("/auth/sso/config"),
  /** Exchange a verified Entra ID token for an application session. */
  ssoLogin: (idToken: string) => api.post<SessionUser>("/auth/sso/entra", { idToken }),
};

/** Admin settings API. */
export const settingsApi = {
  getSso: () => api.get<SsoConfig>("/settings/sso"),
  putSso: (config: SsoConfig) => api.put<SsoConfig>("/settings/sso", config),
};
