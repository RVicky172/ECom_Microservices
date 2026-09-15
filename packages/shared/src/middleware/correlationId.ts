import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      log?: any;
    }
  }
}

/**
 * Correlation ID middleware.
 */
export const correlationId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const id = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.headers['x-correlation-id'] = id;
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
};

export const correlationIdMiddleware: RequestHandler = correlationId;
