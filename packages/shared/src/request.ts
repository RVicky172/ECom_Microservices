/**
 * Request helpers that smooth over Express 5 differences.
 */
import type { Request } from 'express';

/**
 * The parsed request body, or `{}` when the request had none. Express 5 leaves `req.body` undefined without a
 * body (Express 4 gave `{}`), and Joi accepts `undefined`, so validating `req.body` directly would let an empty
 * POST through to the service (feature 005).
 */
export const bodyOf = (req: Request): unknown => (req.body === undefined ? {} : req.body);
