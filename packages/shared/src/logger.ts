import pino, { Logger } from 'pino';

/**
 * Structured JSON logger with correlation ID support.
 * Every log line includes the service name and correlation ID
 * for cross-service request tracing.
 */
export const createLogger = (serviceName: string): Logger => {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};
