import { Request, Response, NextFunction } from 'express';
import { verifyToken, UnauthorizedError, JwtPayload } from '@ecommerce/shared';

declare module 'express' {
  export interface Request {
    user?: JwtPayload;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization token'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};
