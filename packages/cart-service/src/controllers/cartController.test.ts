import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cartService from '../services/cartService';
import { addItem, updateItemQuantity } from './cartController';

vi.mock('../services/cartService', () => ({ addItem: vi.fn(), updateItemQuantity: vi.fn() }));

const USER = '16be8435-63db-4cd3-9c33-e8de62839df2';

// A request with no body: Express 5 leaves req.body undefined (Express 4 gave {}).
const callWithoutBody = async (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  const req = { headers: { 'x-user-id': USER }, params: { id: 'product-1' }, query: {}, body: undefined };
  await handler(req as unknown as Request, res as unknown as Response, next);
  return { res, next };
};

describe('cart controller without a request body', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['POST /cart/items', addItem, cartService.addItem, '"productId" is required'],
    ['PUT /cart/items/:id', updateItemQuantity, cartService.updateItemQuantity, '"quantity" is required'],
  ])('%s answers 400 and calls no service', async (_route, handler, service, message) => {
    const { res, next } = await callWithoutBody(handler);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 400, message } });
    expect(service).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
