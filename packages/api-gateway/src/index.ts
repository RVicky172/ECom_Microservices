import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createLogger, errorHandler, correlationId } from '@ecommerce/shared';
import { setupProxies } from './proxy';
import { rateLimiter } from './middleware/rateLimiter';
import { csrfProtection } from './middleware/csrfProtection';

const app = express();
const logger = createLogger('api-gateway');
const PORT = process.env.PORT || 4000;
const frontendOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: frontendOrigins, credentials: true }));
app.use(correlationId);
app.use(csrfProtection);

// Global rate limiting
app.use(rateLimiter(logger));

// Setup all service reverse proxies
setupProxies(app, logger);

// Parse bodies only after proxy routes have forwarded them.
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

// Centralized error handling
app.use(errorHandler(logger));

app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
});
