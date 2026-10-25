/** The app's URLs and the metadata routes carry. */
/** Every URL the app can navigate to. Use these instead of string literals. */
export const paths = {
  login: '/login',
  catalog: '/catalog',
  cart: '/cart',
  orders: '/orders',
} as const;

/**
 * Static metadata attached to a route via its `handle`.
 * Read with `useMatches()`; `StoreHeader` uses `title` for the breadcrumb.
 */
export interface RouteHandle {
  title: string;
}

/** Shape of `location.state` when `RequireAuth` redirects to the login page. */
export interface LoginRedirectState {
  /** Where the user was going, so they can be sent back after signing in. */
  from?: string;
}
