import express from 'express';
import { createLogger, correlationId, errorHandler, requireInternalToken } from '@ecommerce/shared';
import cartRoutes from './routes/cartRoutes';

const logger = createLogger('cart-service');
const app = express();
const PORT = process.env.PORT || 4003;

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
  res.json({ status: 'ok', service: 'cart-service' });
});

app.use('/api/v1/cart', cartRoutes);

app.use(errorHandler(logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Cart Service started');
});
