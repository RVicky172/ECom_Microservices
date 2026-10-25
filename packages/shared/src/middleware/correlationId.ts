/**
 * Correlation IDs: one ID per request, carried across services in `x-correlation-id` so the log lines of one
 * request can be found together.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      log?: any;
    }
  }
}

/**
 * Reuses the caller's `x-correlation-id` or makes a new one, and puts it on the request (header and
 * `req.correlationId`) and on the response.
 */
export const correlationId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const id = (req.headers['x-correlation-id'] as string) || randomUUID();
  req.headers['x-correlation-id'] = id;
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
};

/** The same middleware under its older name. */
export const correlationIdMiddleware: RequestHandler = correlationId;
