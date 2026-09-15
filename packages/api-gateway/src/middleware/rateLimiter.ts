import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

// Simple in-memory rate limiter for dummy project
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const ipMap = new Map<string, RateLimitInfo>();

export const rateLimiter = (logger: Logger) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = ipMap.get(ip);
    
    if (!record || now > record.resetTime) {
      ipMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
      return next();
    }

    record.count += 1;

    if (record.count > MAX_REQUESTS) {
      logger.warn({ ip, path: req.path }, 'Rate limit exceeded');
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({ error: 'Too many requests, please try again later.' });
    }

    next();
  };
};
