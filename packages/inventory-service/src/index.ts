import express from 'express';
import cors from 'cors';
import { createLogger } from '@ecommerce/shared/src/logger';
import { correlationIdMiddleware } from '@ecommerce/shared/src/middleware/correlationId';
import { errorHandlerMiddleware } from '@ecommerce/shared/src/middleware/errorHandler';
import inventoryRoutes from './routes/inventoryRoutes';
import { runMigrations } from './models/inventoryModel';
import { startConsumer } from './events/consumer';

const logger = createLogger('inventory-service');
const app = express();
const PORT = process.env.PORT || 4005;

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
  res.json({ status: 'ok', service: 'inventory-service' });
});

app.use('/api/v1/inventory', inventoryRoutes);

app.use(errorHandlerMiddleware(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  logger.info('Database migrations complete');

  // Start Kafka consumer to listen for order.created and payment.failed
  await startConsumer(logger);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Inventory Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Inventory Service');
  process.exit(1);
});
