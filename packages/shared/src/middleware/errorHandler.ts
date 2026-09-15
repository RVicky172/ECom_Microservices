import { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { AppError } from '../errors';

/**
 * Centralized error-handling middleware.
 */
export const errorHandler = (logger: Logger): ErrorRequestHandler => {
  return (err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const correlationId = req.headers['x-correlation-id'] || 'unknown';

    logger.error({
      correlationId,
      err: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      method: req.method,
      url: req.originalUrl,
      statusCode,
    }, `Error: ${err.message}`);

    const response = {
      error: {
        code: statusCode,
        message: statusCode >= 500 ? 'Internal server error' : err.message,
      },
      correlationId,
    };

    res.status(statusCode).json(response);
  };
};

export const errorHandlerMiddleware: (logger: Logger) => ErrorRequestHandler = errorHandler;
