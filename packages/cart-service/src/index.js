const express = require('express');
const cors = require('cors');
const createLogger = require('@ecommerce/shared/src/logger');
const correlationId = require('@ecommerce/shared/src/middleware/correlationId');
const errorHandler = require('@ecommerce/shared/src/middleware/errorHandler');
const cartRoutes = require('./routes/cartRoutes');

const logger = createLogger('cart-service');
const app = express();
const PORT = process.env.PORT || 4003;

app.use(cors());
app.use(express.json());
app.use(correlationId);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cart-service' });
});

app.use('/api/v1/cart', cartRoutes);

app.use(errorHandler(logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Cart Service started');
});
