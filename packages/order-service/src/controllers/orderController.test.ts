import { UnauthorizedError } from '@ecommerce/shared';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as orderService from '../services/orderService';
import { createOrder, getOrderById, getOrders } from './orderController';

vi.mock('../services/orderService', () => ({
  createOrder: vi.fn(),
  getOrderForUser: vi.fn(async (id: string, userId: string) => ({ id, user_id: userId, items: [] })),
  getOrdersByUserId: vi.fn(async () => []),
}));

const USER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';

const call = async (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  },
) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await handler({ headers: {}, params: {}, query: {}, ...req } as unknown as Request, res as unknown as Response, next);
  return { res, next };
};

describe('order controller identity guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['GET /orders/:id', getOrderById],
    ['GET /orders', getOrders],
  ])('%s without x-user-id passes a 401 to next and reads nothing', async (_route, handler) => {
    const { res, next } = await call(handler, { params: { id: ORDER_ID } });

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(res.json).not.toHaveBeenCalled();
    expect(orderService.getOrderForUser).not.toHaveBeenCalled();
    expect(orderService.getOrdersByUserId).not.toHaveBeenCalled();
  });

  it("GET /orders/:id looks the order up for the caller's user ID", async () => {
    const { res, next } = await call(getOrderById, { headers: { 'x-user-id': USER }, params: { id: ORDER_ID } });

    expect(orderService.getOrderForUser).toHaveBeenCalledWith(ORDER_ID, USER);
    expect(res.json).toHaveBeenCalledWith({ id: ORDER_ID, user_id: USER, items: [] });
    expect(next).not.toHaveBeenCalled();
  });

  it("GET /orders lists the caller's orders", async () => {
    await call(getOrders, { headers: { 'x-user-id': USER }, query: { page: '2', limit: '5' } });
    expect(orderService.getOrdersByUserId).toHaveBeenCalledWith(USER, 2, 5);
  });
});

describe('order controller without a request body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /orders answers 400 and creates no order', async () => {
    // Express 5 leaves req.body undefined when there is no body (Express 4 gave {}).
    const { res, next } = await call(createOrder, { headers: { 'x-user-id': USER }, body: undefined });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 400, message: '"items" is required' } });
    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
