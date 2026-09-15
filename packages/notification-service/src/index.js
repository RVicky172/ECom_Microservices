const express = require('express');
const cors = require('cors');
const createLogger = require('@ecommerce/shared/src/logger');
const correlationId = require('@ecommerce/shared/src/middleware/correlationId');
const { startConsumer } = require('./events/consumer');

const logger = createLogger('notification-service');
const app = express();
const PORT = process.env.PORT || 4007;

app.use(cors());
app.use(express.json());
app.use(correlationId);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

const start = async () => {
  await startConsumer(logger);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Notification Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Notification Service');
  process.exit(1);
});
