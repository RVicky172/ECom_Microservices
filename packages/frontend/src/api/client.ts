/**
 * Axios clients used by the whole app, plus the in-memory access token.
 *
 * - {@link api}: normal API calls. Adds the bearer token and transparently
 *   refreshes it once on a 401.
 * - {@link authApi}: auth endpoints (login, logout, refresh). No interceptors,
 *   so a failing refresh can never trigger another refresh.
 *
 * Both send cookies (`withCredentials`) so the HttpOnly refresh cookie reaches
 * the auth service through the gateway.
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';

/** Base URL of the API gateway. */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Window event dispatched when the session can no longer be refreshed. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

/** localStorage key remembering that the user explicitly signed out. */
const SIGNED_OUT_SESSION_KEY = 'mercato:signed-out';

/** Client for authenticated API requests (bearer token + auto refresh). */
export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

/** Client for auth endpoints; intentionally has no interceptors. */
export const authApi = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

/** Short-lived JWT. Kept in memory only, never in browser storage. */
let accessToken: string | null = null;
/** Turned off during sign-out so a 401 cannot resurrect the session. */
let automaticRefreshEnabled = true;
/** The in-flight refresh, shared by every request that hit a 401 at once. */
let refreshRequest: Promise<void> | null = null;

/** True when the user signed out and the session should not be auto-restored. */
export const isExplicitlySignedOut = (): boolean => {
  return typeof window !== 'undefined' && window.localStorage.getItem(SIGNED_OUT_SESSION_KEY) === 'true';
};

/** Remember an explicit sign-out across reloads and tabs. */
export const markExplicitSignOut = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SIGNED_OUT_SESSION_KEY, 'true');
  }
};

/** Forget the explicit sign-out marker (called after a successful sign-in). */
export const clearExplicitSignOut = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SIGNED_OUT_SESSION_KEY);
  }
};

/** Replace (or clear, with `null`) the in-memory access token. */
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

/** The current in-memory access token, for requests made outside Axios (e.g. streaming `fetch`). */
export const getAccessToken = (): string | null => accessToken;

/** True when a 401 may be fixed by refreshing (a session exists and the user didn't sign out). */
export const canRefreshSession = (): boolean =>
  automaticRefreshEnabled && !isExplicitlySignedOut() && accessToken !== null;

/**
 * Get a new access token from the refresh cookie. Concurrent callers share one
 * request, so a burst of 401s triggers a single refresh.
 * Rejects when there is no valid refresh session.
 */
export const refreshAccessToken = (): Promise<void> => {
  if (!refreshRequest) {
    refreshRequest = authApi
      .post<{ accessToken: string | null }>('/api/v1/auth/refresh')
      .then(({ data }) => {
        if (!data.accessToken) {
          throw new Error('No active refresh session');
        }
        setAccessToken(data.accessToken);
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
};

/** Clear the token and tell the app the session is gone (handled by `useSessionBootstrap`). */
export const expireSession = (): void => {
  setAccessToken(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
};

/**
 * Stop refreshing tokens automatically and wait for any refresh already in
 * progress to settle. Used right before logging out.
 */
export const pauseAutomaticRefresh = async (): Promise<void> => {
  automaticRefreshEnabled = false;

  if (refreshRequest) {
    try {
      await refreshRequest;
    } catch {
      // A failed refresh must not prevent logout from revoking the session.
    }
  }
};

/** Re-enable automatic token refresh. */
export const resumeAutomaticRefresh = (): void => {
  automaticRefreshEnabled = true;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set once a request has been retried after a refresh, to prevent loops. */
  _retry?: boolean;
}

/**
 * On a 401, refresh the access token once and replay the original request.
 * If the refresh fails, clear the token and emit {@link SESSION_EXPIRED_EVENT}
 * so `useSessionBootstrap` can send the user back to the sign-in page.
 */
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return Promise.reject(error);
  }

  const request = error.config as RetriableRequestConfig | undefined;
  const isRefreshRequest = request?.url?.includes('/api/v1/auth/refresh');
  if (error.response?.status !== 401 || !request || request._retry || isRefreshRequest || !canRefreshSession()) {
    return Promise.reject(error);
  }

  request._retry = true;
  try {
    await refreshAccessToken();
    return api(request);
  } catch (refreshError) {
    expireSession();
    return Promise.reject(refreshError);
  }
});
