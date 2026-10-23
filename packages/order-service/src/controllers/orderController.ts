import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { requireUserId } from '@ecommerce/shared';
import * as orderService from '../services/orderService';

interface CreateOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().required(),
        name: Joi.string().required(),
        price: Joi.number().positive().required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
  shippingAddress: Joi.string().allow('').optional(),
});

export const createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }

    const userId = req.headers['x-user-id'];
    if (!userId) {
      res.status(401).json({ error: { code: 401, message: 'Unauthorized' } });
      return;
    }

    const order = await orderService.createOrder({
      userId: String(userId),
      items: value.items,
      shippingAddress: value.shippingAddress,
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

export const getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { page = 1, limit = 20 } = req.query;
    const orders = await orderService.getOrdersByUserId(
      userId,
      parseInt(String(page), 10),
      parseInt(String(limit), 10)
    );
    res.json({ orders });
  } catch (err) {
    next(err);
  }
};

export const getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const order = await orderService.getOrderForUser(req.params.id, userId);
    res.json(order);
  } catch (err) {
    next(err);
  }
};
