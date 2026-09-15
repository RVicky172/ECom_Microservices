import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import * as cartService from '../services/cartService';

const addItemSchema = Joi.object({
  productId: Joi.string().required(),
  name: Joi.string().required(),
  price: Joi.number().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
});

const updateSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;

export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.getCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

export const addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = addItemSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }
    const cart = await cartService.addItem(getUserId(req), value);
    res.status(201).json(cart);
  } catch (err) {
    next(err);
  }
};

export const updateItemQuantity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }
    const cart = await cartService.updateItemQuantity(getUserId(req), req.params.id, value.quantity);
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

export const removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.removeItem(getUserId(req), req.params.id);
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

export const clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.clearCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};
