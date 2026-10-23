import { NavLink } from 'react-router-dom';
import { useSignOut } from '../hooks/useSession';
import { useStoreCounts } from '../hooks/useStoreCounts';
import { paths } from '../routes/paths';

/**
 * Left navigation with live counts and the sign-out button.
 * `NavLink` adds the `active` class to the link matching the current URL.
 * After a successful sign-out, `RequireAuth` redirects to the login page.
 */
export function StoreSidebar(): React.JSX.Element {
  const { productCount, cartCount, orderCount } = useStoreCounts();
  const { signOut, isSigningOut, hasError } = useSignOut();

  return (
    <aside className="sidebar">
      <div className="brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
      <div className="sidebar-label">Workspace</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavLink className="nav-item" to={paths.catalog}><span>◈</span> Catalog <small>{productCount}</small></NavLink>
        <NavLink className="nav-item" to={paths.orders}><span>↗</span> Orders <small>{orderCount}</small></NavLink>
        <NavLink className="nav-item" to={paths.cart}><span>＋</span> Cart <small>{cartCount}</small></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <div className="support-note"><span className="support-dot" />All systems operational</div>
        {hasError && <p className="form-error">Could not sign out. Please try again.</p>}
        <button className="logout-button" onClick={() => void signOut()} disabled={isSigningOut}>
          <span>↪</span> {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
