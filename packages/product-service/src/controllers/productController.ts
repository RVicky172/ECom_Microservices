/** HTTP handlers for `/api/v1/products`. */
import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { bodyOf } from '@ecommerce/shared';
import type { IProduct } from '../models/productModel';
import * as productService from '../services/productService';

const productSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(1).required(),
  price: Joi.number().positive().required(),
  category: Joi.string().required(),
  imageUrl: Joi.string().uri().allow('').optional(),
  stockHint: Joi.number().integer().min(0).optional(),
});

/**
 * `GET /?category&search&page&limit`: active products, newest first, with pagination. `search` matches the name,
 * ignoring case.
 */
export const getAllProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.getAllProducts(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/** `GET /:id`: one product, or 404. */
export const getProductById = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /` with `{ name, description, price, category, imageUrl?, stockHint? }`: creates a product (201). An
 * invalid or missing body is a 400.
 */
export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = productSchema.validate(bodyOf(req));
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

/** `PUT /:id`: updates the fields sent; 404 for an unknown product. */
export const updateProduct = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.updateProduct(req.params.id, bodyOf(req) as Partial<IProduct>);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

/** `DELETE /:id`: deactivates the product (soft delete), so past orders keep their reference to it. */
export const deleteProduct = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.deleteProduct(req.params.id);
    res.json({ message: 'Product deleted', product });
  } catch (err) {
    next(err);
  }
};
