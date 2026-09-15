import express from 'express';
import cors from 'cors';
import { createLogger, correlationId, errorHandler } from '@ecommerce/shared';
import orderRoutes from './routes/orderRoutes';
import { runMigrations } from './models/orderModel';
import { startConsumer } from './events/consumer';
import { startOutboxRelay } from './events/producer';

const logger = createLogger('order-service');
const app = express();
const PORT = process.env.PORT || 4004;

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
app.use(correlationId);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

app.use('/api/v1/orders', orderRoutes);

app.use(errorHandler(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  logger.info('Database migrations complete');

  // Start Kafka consumers for saga events
  await startConsumer(logger);

  // Start outbox relay (polls outbox_events and publishes to Kafka)
  startOutboxRelay(logger);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Order Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Order Service');
  process.exit(1);
});
