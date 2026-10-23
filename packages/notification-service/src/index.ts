import express from 'express';
import { createLogger, correlationId } from '@ecommerce/shared';
import { startConsumer } from './events/consumer';
import type { SagaConsumerHandle } from '@ecommerce/shared';

const logger = createLogger('notification-service');
const app = express();
const PORT = process.env.PORT || 4007;
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

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', consumer: consumer?.status() ?? 'starting' });
});

const start = async (): Promise<void> => {
  consumer = startConsumer(logger); // retries until Kafka is ready (D-015)

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Notification Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Notification Service');
  process.exit(1);
});
