import express from 'express';
import { createLogger, correlationId, errorHandler, requireInternalToken } from '@ecommerce/shared';
import authRoutes from './routes/authRoutes';
import { runMigrations } from './models/userModel';

const logger = createLogger('auth-service');
const app = express();
const PORT = process.env.PORT || 4001;

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
  res.json({ status: 'ok', service: 'auth-service' });
});

app.use('/api/v1/auth', authRoutes);

app.use(errorHandler(logger));

const start = async (): Promise<void> => {
  await runMigrations();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Auth Service started');
  });
};

start().catch((err) => {
  logger.fatal(err, 'Failed to start Auth Service');
  process.exit(1);
});
