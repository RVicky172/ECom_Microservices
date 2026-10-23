# Auth Service: accounts and sessions

The Auth Service owns user credentials and refresh sessions. It listens on port `4001` by default and uses PostgreSQL (the `auth_db` database by default). It is the service the frontend contacts to register, sign in, restore a session, sign out, or retrieve a profile through the API gateway.

Run it from the repository root with:

```sh
npm run dev:auth
```

PostgreSQL must be available. Connection settings are read from `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB_AUTH`. At startup, the service creates the `users` and `refresh_sessions` tables if they do not exist.

## Endpoints

All routes are mounted below `/api/v1/auth`:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/register` | Validate registration details, create a user and session |
| `POST` | `/login` | Validate credentials and create a session |
| `POST` | `/refresh` | Rotate a refresh session and issue a new access token |
| `POST` | `/logout` | Revoke the refresh session and clear its cookie |
| `GET` | `/profile` | Return the profile identified by the gateway |

## What happens at sign-in?

1. The controller validates the request shape with Joi.
2. The service looks up the email and compares the submitted password against the stored bcrypt hash.
3. On success, it signs a short-lived JWT access token and creates a random refresh token.
4. Only a SHA-256 hash of the refresh token is stored in PostgreSQL. The raw token is returned to the controller, which sets it as an `HttpOnly` `refresh_token` cookie.
5. The access token and public user profile are returned in the JSON response. The password hash is not included in the profile response.

By default, access tokens last 15 minutes and refresh sessions last 7 days. Use `ACCESS_TOKEN_TTL_SECONDS` and `REFRESH_TOKEN_TTL_SECONDS` to configure these durations. The cookie is `Secure` in production, uses `SameSite=Lax`, and is restricted to `/api/v1/auth`.

## Refreshing and signing out

When the frontend calls `/refresh`, the service hashes the cookie value and looks up the matching unexpired session. A database transaction deletes the old session and stores a newly generated refresh token hash before returning a new access token. This rotation makes a refresh token single-use.

On `/logout`, the service deletes the session associated with the cookie and clears the cookie. If a refresh token is missing or invalid, refresh returns `{ "accessToken": null }`, allowing the frontend to treat the visitor as signed out.

## Authentication versus authorization

This service checks credentials and provides identity information. The API gateway verifies access JWTs on protected requests and forwards identity headers to this service for `/profile`. Roles are included in the JWT and profile, but the current gateway does not enforce role-based permissions. Authentication proves who the caller is; individual routes still need authorization rules to decide what that user may do.

## Where to read next

- `src/routes/authRoutes.ts` lists the HTTP endpoints.
- `src/controllers/authController.ts` validates requests and manages cookies.
- `src/services/authService.ts` contains password checking and session logic.
- `src/models/userModel.ts` configures PostgreSQL and creates the tables.

See the [frontend guide](../frontend/README.md) for how the browser restores, uses, and ends a session.
