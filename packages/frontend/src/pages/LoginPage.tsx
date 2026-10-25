/** The `/login` page. */
import { Navigate, useLocation } from 'react-router';
import { AuthScreen } from '../components/AuthScreen';
import { StatusScreen } from '../components/StatusScreen';
import { useSession, useSignIn } from '../hooks/useSession';
import { paths, type LoginRedirectState } from '../routes/paths';

/**
 * `/login`. Shows the sign-in form, and once a session exists (just signed in
 * or already restored) redirects to the page the user originally asked for.
 */
export function LoginPage(): React.JSX.Element {
  const { status } = useSession();
  const { signIn, isSigningIn, hasError } = useSignIn();
  const location = useLocation();

  if (status === 'pending') {
    return <StatusScreen message="Checking your session..." />;
  }

  if (status === 'authenticated') {
    const from = (location.state as LoginRedirectState | null)?.from;
    return <Navigate to={from ?? paths.catalog} replace />;
  }

  return <AuthScreen onSubmit={signIn} isSubmitting={isSigningIn} hasError={hasError} />;
}
