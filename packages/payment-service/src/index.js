const express = require('express');
const cors = require('cors');
const createLogger = require('@ecommerce/shared/src/logger');
const correlationId = require('@ecommerce/shared/src/middleware/correlationId');
const errorHandler = require('@ecommerce/shared/src/middleware/errorHandler');
const paymentRoutes = require('./routes/paymentRoutes');
const { runMigrations } = require('./models/paymentModel');
const { startConsumer } = require('./events/consumer');

const logger = createLogger('payment-service');
const app = express();
const PORT = process.env.PORT || 4006;

app.use(cors());
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

const start = async () => {
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
