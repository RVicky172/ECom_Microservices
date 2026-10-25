/** The route guard for signed-in pages. */
import { Navigate, Outlet, useLocation } from 'react-router';
import { StatusScreen } from '../components/StatusScreen';
import { useSession } from '../hooks/useSession';
import { paths, type LoginRedirectState } from './paths';

/**
 * Route guard for everything behind sign-in.
 *
 * - While the session is being restored it shows a status screen.
 * - When nobody is signed in it redirects to the login page, remembering the
 *   requested URL in `location.state.from`.
 * - Otherwise it renders the child routes.
 *
 * Because children only mount when authenticated, they can call data hooks
 * without `skip` conditions.
 *
 * This is a UX guard only; the API gateway enforces access on the server.
 */
export function RequireAuth(): React.JSX.Element {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'pending') {
    return <StatusScreen message="Checking your session..." />;
  }

  if (status === 'anonymous') {
    const state: LoginRedirectState = { from: location.pathname + location.search };
    return <Navigate to={paths.login} replace state={state} />;
  }

  return <Outlet />;
}
