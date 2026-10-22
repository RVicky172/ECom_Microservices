import express from 'express';
import mongoose from 'mongoose';
import { createLogger, correlationId, errorHandler } from '@ecommerce/shared';
import productRoutes from './routes/productRoutes';

const logger = createLogger('product-service');
const app = express();
const PORT = process.env.PORT || 4002;

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
  res.json({ status: 'ok', service: 'product-service' });
});

app.use('/api/v1/products', productRoutes);

app.use(errorHandler(logger));

const start = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/product_db';
  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Product Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Product Service');
  process.exit(1);
});
