/**
 * The route table.
 *
 *   /login            LoginPage (redirects away if already signed in)
 *   /                 RequireAuth ─► StoreLayout (sidebar + header)
 *     /catalog        CatalogPage  – overview, products and cart
 *     /cart           CartPage     – cart on its own
 *     /orders         OrdersPage   – order history
 *   anything else     redirect to /catalog
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { StoreLayout } from '../layouts/StoreLayout';
import { CartPage } from '../pages/CartPage';
import { CatalogPage } from '../pages/CatalogPage';
import { LoginPage } from '../pages/LoginPage';
import { OrdersPage } from '../pages/OrdersPage';
import { paths, type RouteHandle } from './paths';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter([
  { path: paths.login, element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <StoreLayout />,
        children: [
          { index: true, element: <Navigate to={paths.catalog} replace /> },
          { path: paths.catalog, element: <CatalogPage />, handle: { title: 'Catalog' } satisfies RouteHandle },
          { path: paths.cart, element: <CartPage />, handle: { title: 'Cart' } satisfies RouteHandle },
          { path: paths.orders, element: <OrdersPage />, handle: { title: 'Orders' } satisfies RouteHandle },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={paths.catalog} replace /> },
]);
