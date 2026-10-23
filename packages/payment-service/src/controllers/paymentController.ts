import type { Request, Response, NextFunction } from 'express';
import { requireUserId } from '@ecommerce/shared';
import * as paymentService from '../services/paymentService';

export const getPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const correlationId = req.headers['x-correlation-id'] as string | undefined;
    const payment = await paymentService.getPaymentForUser(req.params.orderId, userId, correlationId);
    res.json(payment);
  } catch (err) {
    next(err);
  }
};
