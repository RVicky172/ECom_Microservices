import { UnauthorizedError } from '@ecommerce/shared';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as paymentService from '../services/paymentService';
import { getPayment } from './paymentController';

vi.mock('../services/paymentService', () => ({
  getPaymentForUser: vi.fn(async (orderId: string) => ({ id: 'pay-1', order_id: orderId })),
}));

const USER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';

const call = async (headers: Record<string, string>) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await getPayment({ headers, params: { orderId: ORDER_ID } } as unknown as Request, res as unknown as Response, next);
  return { res, next };
};

describe('payment controller identity guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /payments/:orderId without x-user-id passes a 401 to next and reads nothing', async () => {
    const { res, next } = await call({});

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(res.json).not.toHaveBeenCalled();
    expect(paymentService.getPaymentForUser).not.toHaveBeenCalled();
  });

  it("looks the payment up for the caller's user ID and correlation ID", async () => {
    const { res, next } = await call({ 'x-user-id': USER, 'x-correlation-id': 'corr-1' });

    expect(paymentService.getPaymentForUser).toHaveBeenCalledWith(ORDER_ID, USER, 'corr-1');
    expect(res.json).toHaveBeenCalledWith({ id: 'pay-1', order_id: ORDER_ID });
    expect(next).not.toHaveBeenCalled();
  });
});
