/** HTTP handlers for `/api/v1/cart`, always for the signed-in user (`x-user-id` from the gateway). */
import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { bodyOf } from '@ecommerce/shared';
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

/** `GET /`: the user's cart, empty if they have none. */
export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.getCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /items` with `{ productId, name, price, quantity }`: adds the item, or adds to its quantity if it is
 * already in the cart (201).
 */
export const addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = addItemSchema.validate(bodyOf(req));
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

/** `PUT /items/:id` with `{ quantity }`: sets the item's quantity; 0 removes it. */
export const updateItemQuantity = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = updateSchema.validate(bodyOf(req));
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

/** `DELETE /items/:id`: removes the item; 404 if it isn't in the cart. */
export const removeItem = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.removeItem(getUserId(req), req.params.id);
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

/** `DELETE /`: empties the cart. */
export const clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.clearCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};
