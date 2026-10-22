import { createProxyMiddleware } from 'http-proxy-middleware';
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
  const createProxy = (target: string, routePrefix: string): ReturnType<typeof createProxyMiddleware> => {
    return createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (path) => `${routePrefix}${path}`,
      on: {
        proxyReq: (proxyReq, req) => {
          const expressRequest = req as Request;

          // Forward correlation ID
          if (expressRequest.headers['x-correlation-id']) {
            proxyReq.setHeader('x-correlation-id', expressRequest.headers['x-correlation-id']);
          }

          // Forward user info if authenticated
          const user = expressRequest.user;
          if (user) {
            proxyReq.setHeader('x-user-id', user.id);
            proxyReq.setHeader('x-user-role', user.role);
            proxyReq.setHeader('x-user-email', user.email);
          }
        },
        error: (err, req, res) => {
          logger.error({ err, target }, 'Proxy error');
          (res as Response).status(502).json({ error: 'Bad Gateway' });
        },
      },
    });
  };

  // Auth service routes (public)
  app.use('/api/v1/auth/profile', requireAuth);
  app.use('/api/v1/auth', createProxy(SERVICES.auth, '/api/v1/auth'));

  // Product service routes (public read, authenticated write - ideally handled in product service)
  app.use('/api/v1/products', createProxy(SERVICES.product, '/api/v1/products'));

  // Cart service routes (requires authentication)
  app.use('/api/v1/cart', requireAuth, createProxy(SERVICES.cart, '/api/v1/cart'));

  // Order service routes (requires authentication)
  app.use('/api/v1/orders', requireAuth, createProxy(SERVICES.order, '/api/v1/orders'));
  
  // Payment service routes (requires authentication)
  app.use('/api/v1/payments', requireAuth, createProxy(SERVICES.payment, '/api/v1/payments'));
};
