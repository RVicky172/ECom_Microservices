import { Request, Response, NextFunction } from 'express';

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

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
