import { Outlet } from 'react-router-dom';
import { AssistantLauncher } from '../components/assistant/AssistantLauncher';
import { StoreHeader } from '../components/StoreHeader';
import { StoreSidebar } from '../components/StoreSidebar';

/**
 * Shell shared by every signed-in page: sidebar, header and footer, with the
 * current page rendered in the middle through `<Outlet />`, plus the
 * floating shopping assistant.
 */
export function StoreLayout(): React.JSX.Element {
  return (
    <div className="app-shell">
      <StoreSidebar />
      <main className="main-content">
        <StoreHeader />
        <Outlet />
        <footer className="app-footer">
          <span>mercato / A considered commerce platform</span>
          <span>© {new Date().getFullYear()}</span>
        </footer>
      </main>
      <AssistantLauncher />
    </div>
  );
}
