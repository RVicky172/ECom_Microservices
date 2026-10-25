/** CSRF protection for cookie-authenticated requests. */
import { Request, Response, NextFunction } from 'express';

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Answers 403 to any state-changing request (not GET, HEAD or OPTIONS) whose `Origin` is not one of
 * `FRONTEND_ORIGINS`. The refresh cookie is sent automatically by the browser, so another site must not be able
 * to trigger a request that uses it.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    res.status(403).json({ error: { code: 403, message: 'Invalid request origin' } });
    return;
  }

  next();
};
