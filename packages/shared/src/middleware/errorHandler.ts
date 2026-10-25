/**
 * The services' last Express middleware: turns any thrown error into the platform's JSON error response.
 */
import { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { AppError } from '../errors';

/**
 * Logs the error with its correlation ID, then answers `{ error: { code, message }, correlationId }`. An
 * `AppError` keeps its status and message; anything else is a 500 whose message is hidden from the client.
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

/** The same middleware under its older name. */
export const errorHandlerMiddleware: (logger: Logger) => ErrorRequestHandler = errorHandler;
