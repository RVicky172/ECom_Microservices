/**
 * Session hooks: the single place where the UI learns "who is signed in"
 * and the only place that changes it.
 *
 * Data flow:
 *   useSessionBootstrap (once, in App) ──► sessionSlice ──► useSession (anywhere)
 *   useSignIn / useSignOut ─────────────► sessionSlice + storeApi cache
 *
 * The access token itself never lives in Redux; it is held in memory by
 * `api/client.ts`. Redux only records whether a session is active.
 */
import { useCallback, useEffect, useRef } from 'react';
import { storeApi, useGetProfileQuery, useLoginMutation, useLogoutMutation, useRefreshSessionMutation } from '../api/storeApi';
import {
  clearExplicitSignOut,
  isExplicitlySignedOut,
  markExplicitSignOut,
  pauseAutomaticRefresh,
  resumeAutomaticRefresh,
  SESSION_EXPIRED_EVENT,
  setAccessToken,
} from '../api/client';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { setSessionResolved } from '../app/sessionSlice';
import type { AuthUser } from '../types/store';

/**
 * - `pending`: the startup refresh or the profile request is still running.
 * - `authenticated`: a session is active and the profile is loaded.
 * - `anonymous`: nobody is signed in (or the session could not be restored).
 */
export type SessionStatus = 'pending' | 'authenticated' | 'anonymous';

/** Credentials accepted by {@link useSignIn}. */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Restores the session on page load and reacts to session expiry.
 *
 * Must be mounted exactly once, near the root of the tree (see `App.tsx`).
 * It:
 * 1. Calls the refresh endpoint (the browser sends the HttpOnly refresh cookie)
 *    unless the user explicitly signed out earlier.
 * 2. Stores the returned access token in memory and marks the session resolved.
 * 3. Listens for {@link SESSION_EXPIRED_EVENT}, emitted by the Axios client when
 *    a token refresh fails, and clears session state and cached API data.
 */
export const useSessionBootstrap = (): void => {
  const dispatch = useAppDispatch();
  const [refreshSession] = useRefreshSessionMutation();
  // Guards against React StrictMode running the effect twice in development,
  // which would rotate the refresh token twice.
  const restoreStarted = useRef(false);

  useEffect(() => {
    if (restoreStarted.current) {
      return;
    }
    restoreStarted.current = true;

    if (isExplicitlySignedOut()) {
      setAccessToken(null);
      dispatch(setSessionResolved(false));
      return;
    }

    void refreshSession()
      .unwrap()
      .then(({ accessToken }) => {
        setAccessToken(accessToken);
        dispatch(setSessionResolved(!!accessToken));
      })
      .catch(() => {
        setAccessToken(null);
        dispatch(setSessionResolved(false));
      });
  }, [dispatch, refreshSession]);

  useEffect(() => {
    const handleSessionExpired = (): void => {
      setAccessToken(null);
      dispatch(setSessionResolved(false));
      dispatch(storeApi.util.resetApiState());
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [dispatch]);
};

/**
 * Reads the current session. Safe to call from any component.
 *
 * The profile query is shared through the RTK Query cache, so calling this in
 * several components triggers only one network request.
 *
 * @returns The session status and, when authenticated, the signed-in user.
 */
export const useSession = (): { status: SessionStatus; user?: AuthUser } => {
  const active = useAppSelector((state) => state.session.active);
  const initialized = useAppSelector((state) => state.session.initialized);
  const profile = useGetProfileQuery(undefined, { skip: !initialized || !active });

  if (!initialized || (active && !profile.data && !profile.isError)) {
    return { status: 'pending' };
  }
  if (active && profile.data) {
    return { status: 'authenticated', user: profile.data };
  }
  return { status: 'anonymous' };
};

/**
 * Signs a user in with email and password.
 *
 * On success the access token is kept in memory, the session is marked active
 * and the returned profile is written straight into the profile cache, so the
 * store can render without waiting for another request.
 */
export const useSignIn = () => {
  const dispatch = useAppDispatch();
  const [login, { isLoading, isError }] = useLoginMutation();

  const signIn = useCallback(async (credentials: SignInCredentials): Promise<void> => {
    try {
      const result = await login(credentials).unwrap();
      clearExplicitSignOut();
      resumeAutomaticRefresh();
      setAccessToken(result.accessToken);
      dispatch(setSessionResolved(true));
      dispatch(storeApi.util.upsertQueryData('getProfile', undefined, result.user));
    } catch {
      // The error is surfaced through `hasError`; just make sure no stale token remains.
      setAccessToken(null);
    }
  }, [dispatch, login]);

  return { signIn, isSigningIn: isLoading, hasError: isError };
};

/**
 * Signs the current user out.
 *
 * Automatic token refresh is paused first so an in-flight refresh cannot
 * revive the session we are revoking. On success all cached API data is
 * cleared so the next user never sees the previous user's cart or orders.
 * On failure the session is left untouched and `hasError` becomes true.
 */
export const useSignOut = () => {
  const dispatch = useAppDispatch();
  const [logout, { isLoading, isError }] = useLogoutMutation();

  const signOut = useCallback(async (): Promise<void> => {
    markExplicitSignOut();
    await pauseAutomaticRefresh();
    try {
      await logout().unwrap();
    } catch {
      clearExplicitSignOut();
      resumeAutomaticRefresh();
      return;
    }

    setAccessToken(null);
    dispatch(setSessionResolved(false));
    dispatch(storeApi.util.resetApiState());
  }, [dispatch, logout]);

  return { signOut, isSigningOut: isLoading, hasError: isError };
};
