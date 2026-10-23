# Frontend guide: how the app works

This guide walks through the React frontend from startup to sign-in and explains
how it talks to the backend. It is intended to help you understand the design,
not just memorize which file to open.

## 1. The app at a glance

The frontend is a React application built with Vite and TypeScript. Its main
responsibilities are:

- Route between the sign-in page and the signed-in store pages
  (`/catalog`, `/cart`, `/orders`) with React Router.
- Send requests to the API gateway.
- Keep track of whether a session is active.
- Show products, and load the signed-in user's cart and orders.

The browser does not connect directly to each microservice. It sends requests
to the API gateway, which routes them to the appropriate service.

To run the frontend from the repository root:

```sh
npm run dev:frontend
```

The Vite development server uses port `3000`. API requests use
`VITE_API_URL`, or `http://localhost:4000` when that variable is not set. The
gateway's default local frontend origin is `http://localhost:3000`.

## 2. Where to follow the code

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Starts React and makes the Redux store available to components. |
| `src/App.tsx` | Starts the one-time session restore and renders the router. |
| `src/routes/router.tsx` | The route table: which URL renders which page and layout. |
| `src/routes/paths.ts` | URL constants and route metadata types. |
| `src/routes/RequireAuth.tsx` | Guard: shows a status screen while the session is restored, redirects to `/login` when signed out. |
| `src/layouts/StoreLayout.tsx` | Sidebar, header and footer shared by all signed-in pages. |
| `src/pages/*.tsx` | One component per route (`LoginPage`, `CatalogPage`, `CartPage`, `OrdersPage`). |
| `src/hooks/useSession.ts` | `useSessionBootstrap`, `useSession`, `useSignIn`, `useSignOut`. |
| `src/hooks/useStoreCounts.ts` | Product, cart and order counts for the sidebar and overview. |
| `src/app/sessionSlice.ts` | Stores the small amount of session status used by the UI. |
| `src/api/client.ts` | Configures Axios, adds access tokens, and retries after token expiry. |
| `src/api/storeApi.ts` | Defines API operations and their Redux Toolkit Query cache behavior. |
| `src/hooks/useAssistantChat.ts` | Chat state for the shopping assistant: send, stop, new chat, restore after reload. |
| `src/api/assistantApi.ts` | Streams assistant replies (`fetch` + Server-Sent Events) and loads/deletes conversations. |
| `src/components/assistant/*.tsx` | The "Ask mercato" launcher, chat panel, messages and confirm-to-add buttons. |
| `src/components/*.tsx` | UI sections. Data sections (`ProductCatalog`, `CartPanel`, `OrdersSection`) read their own data from `storeApi` hooks. |

### Routing and data flow

```
App ─ useSessionBootstrap()          (runs once: restore session, listen for expiry)
 └─ RouterProvider
     ├─ /login        LoginPage ─ useSession + useSignIn ─► AuthScreen
     └─ RequireAuth   (pending → status screen, anonymous → /login)
         └─ StoreLayout ─ StoreSidebar (counts, sign-out) + StoreHeader + <Outlet/>
             ├─ /catalog  StoreOverview, ProductCatalog, CartPanel
             ├─ /cart     CartPanel
             └─ /orders   OrdersSection
```

No data is passed down from `App`. Each section calls the RTK Query hook it
needs (for example `useGetCartQuery()`); RTK Query shares one cached request
between every component that asks for the same data. Mutations invalidate
cache tags, so, for example, adding to cart refetches the cart and every
component showing it updates. Signed-in pages never need `skip` conditions,
because `RequireAuth` only renders them once a session exists.

### Shopping assistant

`AssistantLauncher` is mounted once in `StoreLayout`, so the "Ask mercato"
button is on every signed-in page and the conversation survives navigation and
closing the panel.

```
AssistantPanel ─ send(text) ─► useAssistantChat ─► streamAssistantChat (POST /api/v1/assistant/chat)
                                      ▲                         │ SSE: start, text, tool_status,
                                      └──── applyEvent ◄────────┘      products, proposal, done, error
ProposalButton ─ click ─► useAddCartItemMutation ─► Cart tag invalidated ─► cart panel + counts refresh
```

- The reply streams from a POST, which `EventSource` and Axios can't read in
  the browser, so `assistantApi.ts` uses `fetch` and parses the stream. It reuses
  the in-memory token and the shared `refreshAccessToken()` from `client.ts`,
  retrying once after a 401 like the Axios client.
- The assistant never changes the cart itself. A suggestion arrives as a
  `proposal` event; only the user's click on `ProposalButton` calls the normal
  cart mutation.
- The conversation ID is kept in `sessionStorage` per user, so a reload restores
  the chat from `GET /api/v1/assistant/conversations/:id`. "New chat" deletes the
  old conversation on the server.
- Replies are rendered as plain text, never HTML.

To add a page: create it in `src/pages/`, add its path to `paths.ts`, add a
route (with a `handle.title` for the breadcrumb) in `router.tsx`, and link to
it from `StoreSidebar` with `NavLink`.

The authentication endpoints and token handling live in the backend too:
`packages/auth-service` handles credentials and sessions, while
`packages/api-gateway` checks access tokens before forwarding protected
requests.

## 3. What happens when the app starts?

1. `main.tsx` creates the Redux store and renders `App`.
2. `App` calls `useSessionBootstrap`. The session slice starts with
   `initialized: false` and `active: false`; it does not save a token or a
   signed-in user to browser storage.
3. `useSessionBootstrap` calls the refresh endpoint. The browser automatically includes
   the refresh cookie because both Axios clients use `withCredentials: true`.
   After an explicit sign-out, a `localStorage` marker skips this restoration
   call on subsequent page loads and tabs until the user signs in again.
4. If the backend recognizes the cookie, it rotates the refresh token and
   returns a new access token. The frontend keeps that access token in
   JavaScript memory and marks the session active.
5. If there is no valid refresh session, the frontend clears its in-memory
   token and marks the session inactive.
6. `RequireAuth` (and `LoginPage`) show a status screen until this check
   finishes. If signed in, the user's profile is loaded; signed-in pages, and
   therefore their product, cart, and order queries, mount only after the
   session and profile are ready. Signed-out visitors are redirected to
   `/login`, which returns them to the page they asked for after sign-in.

This startup check is why refreshing the page can keep you signed in without
putting the short-lived access token in `localStorage`.
The sign-in screen does not request catalog data; product queries start after
the app confirms an active session.

## 4. Signing in, step by step

1. `AuthScreen` collects the email and password and calls its `onSubmit`
   callback, supplied by `LoginPage`.
2. `useSignIn().signIn` calls the `login` mutation in `storeApi.ts`.
3. That request uses `authApi` to send `POST /api/v1/auth/login` to the
   gateway. Axios sends credentials, allowing the backend to set a cookie.
4. The auth service validates the request and checks the password against its
   stored password hash. Passwords are hashed with bcrypt; the original
   password is not what the service stores.
5. On success, the service returns a user profile and a short-lived access
   token, and sets a refresh token in an `HttpOnly` cookie.
6. The frontend keeps the access token in memory, marks the session active,
   and places the returned profile into the profile-query cache so the
   dashboard can appear immediately.

The access token is a signed JWT. By default, it expires after 15 minutes.
The refresh session lasts 7 days by default; both durations can be changed
with the auth service's `ACCESS_TOKEN_TTL_SECONDS` and
`REFRESH_TOKEN_TTL_SECONDS` settings.

## 5. Why use two kinds of tokens?

The app uses a short-lived access token and a longer-lived refresh token for
different jobs:

- **Access token:** sent with normal API requests in the HTTP authorization
  header. The frontend keeps it only in memory, so a page reload discards it.
- **Refresh token:** kept by the browser in an `HttpOnly` cookie, so frontend
  JavaScript cannot read it. The auth service stores a hash of the refresh
  token, not the raw token, and rotates it when refreshing a session.

This design limits how long a stolen access token can be used and avoids
persisting that token in JavaScript-readable browser storage. The cookie's
`HttpOnly` flag is not a substitute for protection against cross-site
requests; the gateway also checks request origins for state-changing methods.

## 6. What happens when an access token expires?

Normal API calls use the `api` Axios client. Its request interceptor adds the
in-memory access token. If a request receives `401 Unauthorized`, the response
interceptor:

1. Avoids retrying if this request has already been retried, or if it is a
   refresh request.
2. Calls the refresh endpoint using `authApi`.
3. Shares one in-progress refresh request among simultaneous failed requests.
4. Saves the new access token and retries the original request once.
5. If refresh fails, clears the in-memory token and emits
   `auth:session-expired`.

`useSessionBootstrap` listens for that event, marks the session inactive, and
clears cached API data. `RequireAuth` then redirects to `/login`.

## 7. Signing out

`useSignOut().signOut` (the sidebar button) calls `POST /api/v1/auth/logout`. The auth service revokes
the refresh session and clears the refresh cookie. After a successful response,
the frontend clears its in-memory access token, marks the session inactive,
and resets the API cache so the next user does not see stale cart or order
data. It also records the explicit sign-out in `localStorage`, so reloading
the sign-in page or opening another tab does not make another refresh request
for a session that was just revoked. A successful sign-in removes this marker.

## 8. Authentication and authorization are different

- **Authentication** answers: “Who is making this request?” The gateway's
  `requireAuth` middleware reads the bearer token and verifies its signature
  and expiry.
- **Authorization** answers: “Is this authenticated user allowed to do this?”
  A valid login alone does not decide whether a user may perform every
  operation.

The frontend's `active` session state and its choice to show the dashboard are
for user experience. They are not security controls: a user can make HTTP
requests without using the UI, so access must be enforced by the backend.

### Current backend enforcement

The gateway currently requires a valid access token for:

- `GET /api/v1/auth/profile`
- Requests under `/api/v1/cart`
- Requests under `/api/v1/orders`
- Requests under `/api/v1/payments`

After verifying the token, the gateway forwards the user's ID, email, and role
to downstream services in `x-user-id`, `x-user-email`, and `x-user-role`
headers. Cart and order handlers use the user ID to scope data to that user.

There are important limits to the current authorization behavior:

- The role is included in the JWT and forwarded, but the inspected gateway and
  service routes do not enforce role-based permissions. There is no current
  admin-only authorization check in this flow.
- The gateway proxies product routes without `requireAuth`. The product
  service's routes also define create, update, and delete handlers without
  route-level authentication middleware. Do not assume product write
  operations are protected just because the UI only presents a catalog.

These are backend authorization gaps to address before relying on roles or
publicly exposing product mutations. Hiding a button or screen in React would
not fix them.

## 9. Other request protections and data loading

- The gateway's CORS configuration allows configured frontend origins and
  credentials. Its CSRF middleware rejects state-changing requests if their
  `Origin` is missing or not on the allowlist; `GET`, `HEAD`, and `OPTIONS`
  are treated as safe methods.
- `storeApi.ts` uses Redux Toolkit Query for requests and caching. Its tags
  let the frontend invalidate cart or order data after operations such as
  adding an item or checking out.
- Checkout sends an order request, then clears the cart. If either request
  fails, the mutation returns an error rather than reporting success.
- The auth service also has register and profile endpoints, but this frontend
  currently wires sign-in, sign-out, refresh, and profile loading; it does not
  provide a registration flow.

## 10. A useful debugging path

When sign-in or a protected screen does not work, trace the request in this
order:

1. Check `useSession.ts` (session) or the component's `storeApi` hook to see
   which mutation or query is being called.
2. Check `storeApi.ts` for the endpoint URL and whether it uses `authApi`.
3. Check `client.ts` for credentials, bearer headers, and refresh behavior.
4. Check the gateway route in `packages/api-gateway/src/proxy.ts` to see
   whether it requires authentication and where it forwards the request.
5. Check `packages/api-gateway/src/middleware/auth.ts` to see how the access
   token is verified.
6. Check the matching controller in `packages/auth-service` or the relevant
   service to see how the request is processed and which user data it uses.
