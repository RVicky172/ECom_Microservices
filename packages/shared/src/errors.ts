/**
 * Custom error classes for consistent error handling across services.
 */

/**
 * Base class for errors a handler throws on purpose. The error handler answers with `statusCode` and the message;
 * anything that isn't an `AppError` becomes a 500 with a generic message.
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 404: "<resource> not found". */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

/** 400: the request (or an event payload) is invalid; the message says which field. */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

/** 409: the request clashes with the current state, e.g. an email already registered. */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

/** 401: no verified caller, a bad token, or wrong credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}
