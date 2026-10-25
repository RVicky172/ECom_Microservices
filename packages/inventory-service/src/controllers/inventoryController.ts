/** HTTP handlers for stock levels: validate the request, call the inventory service, answer JSON. */
import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { bodyOf } from '@ecommerce/shared';
import * as inventoryService from '../services/inventoryService';

const setStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

/** `GET /api/v1/inventory/:productId`: the product's stock level, or 404. */
export const getStock = async (req: Request<{ productId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stock = await inventoryService.getStock(req.params.productId);
    res.json(stock);
  } catch (err) {
    next(err);
  }
};

/**
 * `PUT /api/v1/inventory/:productId` with `{ quantity }`: sets the available quantity (creates the row if
 * needed). An invalid or missing body is a 400.
 */
export const setStock = async (req: Request<{ productId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = setStockSchema.validate(bodyOf(req));
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }
    const stock = await inventoryService.setStock(req.params.productId, value.quantity);
    res.json(stock);
  } catch (err) {
    next(err);
  }
};
