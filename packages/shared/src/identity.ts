import type { Request } from 'express';
import { UnauthorizedError } from './errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The caller's user ID, as set by the API gateway from the verified access token
 * (or forwarded by the assistant). Throws UnauthorizedError (401) when it is
 * missing, so a handler never runs a query for an anonymous or `"undefined"` user.
 */
export const requireUserId = (req: Request): string => {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new UnauthorizedError();
  }
  return userId;
};

/**
 * True for a UUID string (8-4-4-4-12 hex digits, either case). Lets services
 * answer malformed IDs with 404 instead of letting PostgreSQL fail with a 500.
 */
export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
