/** Per-IP rate limiting for the gateway, kept in memory (one gateway instance). */
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

/**
 * Allows `RATE_LIMIT_MAX_REQUESTS` (100) requests per IP in each `RATE_LIMIT_WINDOW_MS` (15 minutes) window,
 * then answers 429 with `Retry-After` until the window ends. Counts reset when the gateway restarts.
 */
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
