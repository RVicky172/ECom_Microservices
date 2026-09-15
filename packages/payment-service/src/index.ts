import express from 'express';
import cors from 'cors';
import { createLogger } from '@ecommerce/shared/src/logger';
import { correlationIdMiddleware } from '@ecommerce/shared/src/middleware/correlationId';
import { errorHandlerMiddleware } from '@ecommerce/shared/src/middleware/errorHandler';
import paymentRoutes from './routes/paymentRoutes';
import { runMigrations } from './models/paymentModel';
import { startConsumer } from './events/consumer';

const logger = createLogger('payment-service');
const app = express();
const PORT = process.env.PORT || 4006;

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
  res.json({ status: 'ok', service: 'payment-service' });
});

app.use('/api/v1/payments', paymentRoutes);

app.use(errorHandlerMiddleware(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  logger.info('Database migrations complete');

  await startConsumer(logger);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Payment Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Payment Service');
  process.exit(1);
});
