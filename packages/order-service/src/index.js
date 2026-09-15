const express = require('express');
const cors = require('cors');
const createLogger = require('@ecommerce/shared/src/logger');
const correlationId = require('@ecommerce/shared/src/middleware/correlationId');
const errorHandler = require('@ecommerce/shared/src/middleware/errorHandler');
const orderRoutes = require('./routes/orderRoutes');
const { runMigrations } = require('./models/orderModel');
const { startConsumer } = require('./events/consumer');
const { startOutboxRelay } = require('./events/producer');

const logger = createLogger('order-service');
const app = express();
const PORT = process.env.PORT || 4004;

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

const start = async () => {
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
