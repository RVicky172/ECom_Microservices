import { Request, Response, NextFunction } from 'express';
import { verifyToken, UnauthorizedError, JwtPayload } from '@ecommerce/shared';

declare module 'express' {
  export interface Request {
    user?: JwtPayload;
  }
}

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
