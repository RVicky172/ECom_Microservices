import type { Request, Response, NextFunction } from 'express';
import * as paymentService from '../services/paymentService';

export const getPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payment = await paymentService.getPayment(req.params.orderId);
    res.json(payment);
  } catch (err) {
    next(err);
  }
};
