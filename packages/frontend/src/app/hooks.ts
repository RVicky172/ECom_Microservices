import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

/** `useDispatch` typed for this app's store. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
/** `useSelector` typed for this app's state. */
export const useAppSelector = useSelector.withTypes<RootState>();
