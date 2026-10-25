/** The page header of the signed-in store. */
import { useMatches } from 'react-router';
import { useSession } from '../hooks/useSession';
import type { RouteHandle } from '../routes/paths';
import { getGreeting } from '../utils/storePresentation';

/**
 * Page header: breadcrumb for the current route and a greeting for the user.
 * The breadcrumb comes from the deepest matched route's `handle.title`
 * (see `routes/router.tsx`).
 */
export function StoreHeader(): React.JSX.Element {
  const { user } = useSession();
  const matches = useMatches();
  const title = matches
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .filter(Boolean)
    .pop();
  const name = user?.name ?? '';

  return (
    <header className="topbar">
      <div>
        <p className="breadcrumb">WORKSPACE / {title?.toUpperCase()}</p>
        <h1>{getGreeting()}, {name}.</h1>
      </div>
      <div className="topbar-actions">
        <span className="live-indicator"><i /> Live store</span>
        <div className="avatar">{name.charAt(0).toUpperCase()}</div>
      </div>
    </header>
  );
}
