import express from 'express';
import cors from 'cors';
import { createLogger } from '@ecommerce/shared/src/logger';
import { correlationIdMiddleware } from '@ecommerce/shared/src/middleware/correlationId';
import { errorHandlerMiddleware } from '@ecommerce/shared/src/middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import { runMigrations } from './models/userModel';

const logger = createLogger('auth-service');
const app = express();
const PORT = process.env.PORT || 4001;

declare global {
  namespace Express {
    interface Request {
      log?: any;
      correlationId?: string;
    }
  }
}

app.use(cors());
app.use(express.json());
app.use(correlationIdMiddleware);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.use('/api/v1/auth', authRoutes);

app.use(errorHandlerMiddleware(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Auth Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Auth Service');
  process.exit(1);
});
