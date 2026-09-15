const express = require('express');
const cors = require('cors');
const createLogger = require('@ecommerce/shared/src/logger');
const correlationId = require('@ecommerce/shared/src/middleware/correlationId');
const errorHandler = require('@ecommerce/shared/src/middleware/errorHandler');
const inventoryRoutes = require('./routes/inventoryRoutes');
const { runMigrations } = require('./models/inventoryModel');
const { startConsumer } = require('./events/consumer');

const logger = createLogger('inventory-service');
const app = express();
const PORT = process.env.PORT || 4005;

app.use(cors());
app.use(express.json());
app.use(correlationId);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'inventory-service' });
});

app.use('/api/v1/inventory', inventoryRoutes);

app.use(errorHandler(logger));

const start = async () => {
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
