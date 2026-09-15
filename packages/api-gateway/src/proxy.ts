import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Express, Request, Response } from 'express';
import { Logger } from 'pino';
import { requireAuth } from './middleware/auth';

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
  cart: process.env.CART_SERVICE_URL || 'http://localhost:4003',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:4004',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4005',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4006',
};

export const setupProxies = (app: Express, logger: Logger) => {
  // Utility to create a proxy with error handling and correlation ID forwarding
  const createProxy = (target: string): ReturnType<typeof createProxyMiddleware> => {
    return createProxyMiddleware({
      target,
      changeOrigin: true,
      onProxyReq: (proxyReq, req, res) => {
        // Forward correlation ID
        if (req.headers['x-correlation-id']) {
          proxyReq.setHeader('x-correlation-id', req.headers['x-correlation-id']);
        }
        
        // Forward user info if authenticated
        const user = (req as any).user;
        if (user) {
          proxyReq.setHeader('x-user-id', user.id);
          proxyReq.setHeader('x-user-role', user.role);
          proxyReq.setHeader('x-user-email', user.email);
        }
      },
      onError: (err: Error, req: Request, res: Response) => {
        logger.error({ err, target }, 'Proxy error');
        res.status(502).json({ error: 'Bad Gateway' });
      },
    });
  };

  // Auth service routes (public)
  app.use('/api/auth', createProxy(SERVICES.auth));

  // Product service routes (public read, authenticated write - ideally handled in product service)
  app.use('/api/products', createProxy(SERVICES.product));

  // Cart service routes (requires authentication)
  app.use('/api/cart', requireAuth, createProxy(SERVICES.cart));

  // Order service routes (requires authentication)
  app.use('/api/orders', requireAuth, createProxy(SERVICES.order));
  
  // Payment service routes (requires authentication)
  app.use('/api/payments', requireAuth, createProxy(SERVICES.payment));
};
