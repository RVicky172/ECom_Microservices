import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as productService from '../services/productService';
import { createProduct, updateProduct } from './productController';

vi.mock('../services/productService', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(async (id: string) => ({ id, name: 'Mouse' })),
}));

const PRODUCT_ID = '6aa90ece96384c76af92529b';

// A request with no body: Express 5 leaves req.body undefined (Express 4 gave {}).
const callWithoutBody = async (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  const req = { headers: {}, params: { id: PRODUCT_ID }, query: {}, body: undefined };
  await handler(req as unknown as Request, res as unknown as Response, next);
  return { res, next };
};

describe('product controller without a request body', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /products answers 400 and creates nothing', async () => {
    const { res, next } = await callWithoutBody(createProduct);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 400, message: '"name" is required' } });
    expect(productService.createProduct).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('PUT /products/:id passes an empty update, as with Express 4', async () => {
    const { res, next } = await callWithoutBody(updateProduct);

    expect(productService.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, {});
    expect(res.json).toHaveBeenCalledWith({ id: PRODUCT_ID, name: 'Mouse' });
    expect(next).not.toHaveBeenCalled();
  });
});
