/** JWT authentication for the gateway's protected routes. */
import { Request, Response, NextFunction } from 'express';
import { verifyToken, UnauthorizedError, JwtPayload } from '@ecommerce/shared';

declare module 'express' {
  export interface Request {
    user?: JwtPayload;
  }
}

/**
 * Requires a valid `Authorization: Bearer <access token>` and puts its payload on `req.user`, which the proxy
 * turns into the `x-user-*` headers. Anything else is a 401.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    return next(new UnauthorizedError('Missing or invalid authorization token'));
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};
