import express from 'express';
import { createLogger, correlationId, errorHandler } from '@ecommerce/shared';
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

app.use(express.json());
app.use(correlationId);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

app.use('/api/v1/payments', paymentRoutes);

app.use(errorHandler(logger));

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
