import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import * as productService from '../services/productService';

const productSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(1).required(),
  price: Joi.number().positive().required(),
  category: Joi.string().required(),
  imageUrl: Joi.string().uri().allow('').optional(),
  stockHint: Joi.number().integer().min(0).optional(),
});

export const getAllProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.getAllProducts(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }
    const product = await productService.createProduct(value);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.deleteProduct(req.params.id);
    res.json({ message: 'Product deleted', product });
  } catch (err) {
    next(err);
  }
};
