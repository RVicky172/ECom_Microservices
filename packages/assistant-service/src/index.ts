import express from 'express';
import { createLogger, correlationId, errorHandler, requireInternalToken } from '@ecommerce/shared';
import { isConfigured, provider } from './agent/runAgent';
import { ensureAnalyticsTopics } from './clients/analyticsTopics';
import { config } from './config';
import chatRoutes from './routes/chatRoutes';

const logger = createLogger('assistant-service');
const app = express();

declare global {
  namespace Express {
    interface Request {
      log?: any;
      correlationId?: string;
    }
  }
}

app.use(express.json({ limit: '16kb' }));
app.use(correlationId);
app.use(requireInternalToken);

app.use((req, res, next) => {
  req.log = logger.child({ correlationId: req.correlationId });
  next();
});

app.get('/health', (req, res) => {
  // `configured: false` means the provider lacks credentials (e.g. no ANTHROPIC_API_KEY); the store still works.
  res.json({
    status: 'ok',
    service: 'assistant-service',
    provider: provider.id,
    model: provider.describeModel(),
    configured: isConfigured(),
  });
});

app.use('/api/v1/assistant', chatRoutes);

app.use(errorHandler(logger));

app.listen(config.port, () => {
  logger.info(
    { port: config.port, provider: provider.id, model: provider.describeModel(), configured: isConfigured() },
    'Assistant Service started',
  );
  void ensureAnalyticsTopics({ logger }); // background; chat works without Kafka (012, D-027)
});
