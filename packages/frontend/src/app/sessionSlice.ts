import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Minimal session flags. The user profile lives in the RTK Query cache and the
 * access token lives in memory in `api/client.ts`; neither is duplicated here.
 */
interface SessionState {
  /** A valid session exists (an access token is held in memory). */
  active: boolean;
  /** The startup session check has finished, whatever its outcome. */
  initialized: boolean;
}

const initialState: SessionState = { active: false, initialized: false };

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    /** Record the outcome of a session check, sign-in, sign-out or expiry. */
    setSessionResolved(state, action: PayloadAction<boolean>) {
      state.active = action.payload;
      state.initialized = true;
    },
  },
});

export const { setSessionResolved } = sessionSlice.actions;
export default sessionSlice.reducer;
