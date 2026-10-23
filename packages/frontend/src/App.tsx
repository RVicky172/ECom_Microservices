import { RouterProvider } from 'react-router-dom';
import { useSessionBootstrap } from './hooks/useSession';
import { router } from './routes/router';
import './styles.css';

/**
 * Application root.
 *
 * Starts the one-time session restore, then hands rendering to the router.
 * Screens decide what to show from `useSession()` and fetch their own data
 * with RTK Query hooks, so nothing is passed down from here.
 */
function App(): React.JSX.Element {
  useSessionBootstrap();
  return <RouterProvider router={router} />;
}

export default App;
