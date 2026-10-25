import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import * as inventoryService from '../services/inventoryService';
import { setStock } from './inventoryController';

vi.mock('../services/inventoryService', () => ({ setStock: vi.fn() }));

describe('inventory controller without a request body', () => {
  it('PUT /inventory/:productId answers 400 and sets no stock', async () => {
    // Express 5 leaves req.body undefined when there is no body (Express 4 gave {}).
    const req = { headers: {}, params: { productId: 'product-1' }, query: {}, body: undefined };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await setStock(req as unknown as Request<{ productId: string }>, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 400, message: '"quantity" is required' } });
    expect(inventoryService.setStock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
