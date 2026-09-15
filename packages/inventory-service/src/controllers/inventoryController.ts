import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import * as inventoryService from '../services/inventoryService';

const setStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

export const getStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stock = await inventoryService.getStock(req.params.productId);
    res.json(stock);
  } catch (err) {
    next(err);
  }
};

export const setStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = setStockSchema.validate(req.body);
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
