import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './sessionSlice';
import { storeApi } from '../api/storeApi';

/** The single Redux store: session flags plus the RTK Query cache. */
export const store = configureStore({
  reducer: {
    session: sessionReducer,
    [storeApi.reducerPath]: storeApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(storeApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
