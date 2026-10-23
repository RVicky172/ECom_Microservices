import express from 'express';
import { createLogger, correlationId, errorHandler, requireInternalToken } from '@ecommerce/shared';
import orderRoutes from './routes/orderRoutes';
import { runMigrations } from './models/orderModel';
import { startConsumer } from './events/consumer';
import type { SagaConsumerHandle } from '@ecommerce/shared';
import { startOutboxRelay } from './events/producer';

const logger = createLogger('order-service');
const app = express();
const PORT = process.env.PORT || 4004;
let consumer: SagaConsumerHandle | undefined;

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
app.use(requireInternalToken);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service', consumer: consumer?.status() ?? 'starting' });
});

app.use('/api/v1/orders', orderRoutes);

app.use(errorHandler(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  logger.info('Database migrations complete');

  // Start the saga consumer; it keeps retrying until Kafka is ready (D-015)
  consumer = startConsumer(logger);

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
