/**
 * `@ecommerce/shared`: the code every service uses (logging, saga events, Kafka, errors, JWT, identity, Express
 * middleware, request and UUID helpers). Import from here, not from the individual files.
 */
export * from './logger';
export * from './events';
export * from './kafka';
export * from './errors';
export * from './jwt';
export * from './identity';
export * from './middleware/errorHandler';
export * from './middleware/correlationId';
export * from './middleware/internalAuth';
export * from './uuid';
export * from './request';
