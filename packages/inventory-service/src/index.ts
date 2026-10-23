import express from 'express';
import { createLogger, correlationId, errorHandler, requireInternalToken } from '@ecommerce/shared';
import inventoryRoutes from './routes/inventoryRoutes';
import { runMigrations } from './models/inventoryModel';
import { startConsumer } from './events/consumer';
import type { SagaConsumerHandle } from '@ecommerce/shared';

const logger = createLogger('inventory-service');
const app = express();
const PORT = process.env.PORT || 4005;
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
  res.json({ status: 'ok', service: 'inventory-service', consumer: consumer?.status() ?? 'starting' });
});

app.use('/api/v1/inventory', inventoryRoutes);

app.use(errorHandler(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  logger.info('Database migrations complete');

  // Start the saga consumer; it keeps retrying until Kafka is ready (D-015)

  consumer = startConsumer(logger);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Inventory Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Inventory Service');
  process.exit(1);
});
