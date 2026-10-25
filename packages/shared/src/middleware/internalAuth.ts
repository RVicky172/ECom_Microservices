/**
 * Service-to-service trust: the shared internal token that proves a request came through the gateway or the
 * assistant.
 */
import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { UnauthorizedError } from '../errors';

/** Header carrying the shared secret between the gateway/assistant and internal services. */
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

const tokensMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Rejects requests that did not come through a trusted caller (the API gateway
 * or the assistant service).
 *
 * Services trust `x-user-id` and friends as set by the gateway. Without this
 * check, anyone who can reach a service port directly could impersonate any
 * user by sending those headers themselves.
 *
 * Opt-in: enforced only when `INTERNAL_SERVICE_TOKEN` is set, so local
 * development without the variable keeps working. `/health` is always open
 * for Docker health checks.
 */
export const requireInternalToken: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected || req.path === '/health') {
    return next();
  }

  const provided = req.headers[INTERNAL_TOKEN_HEADER];
  if (typeof provided === 'string' && tokensMatch(provided, expected)) {
    return next();
  }

  next(new UnauthorizedError('Internal service token required'));
};
