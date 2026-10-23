import { KafkaTopics, NotFoundError, OrderStatus } from '@ecommerce/shared';
import type { SagaEnvelope } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as orderService from '../services/orderService';
import { handleSagaEvent } from './consumer';

vi.mock('../services/orderService', () => ({
  getOrderById: vi.fn(),
  updateOrderStatus: vi.fn(async () => ({})),
}));

const getOrderById = vi.mocked(orderService.getOrderById);
const updateOrderStatus = vi.mocked(orderService.updateOrderStatus);

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const items = [{ productId: '6aa90ece96384c76af92529b', quantity: 1 }];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const envelope = (data: unknown): SagaEnvelope => ({ eventId: 'e-1', eventType: 'X', aggregateId: ORDER_ID, data, timestamp: 't' });
const orderIn = (status: OrderStatus) => getOrderById.mockResolvedValue({ id: ORDER_ID, status });

describe('order saga event handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms a reserved order when payment completes', async () => {
    orderIn(OrderStatus.INVENTORY_RESERVED);
    await handleSagaEvent(KafkaTopics.PAYMENT_COMPLETED, envelope({ orderId: ORDER_ID, items, amount: 25 }), 'c', logger);
    expect(updateOrderStatus.mock.calls).toEqual([[ORDER_ID, OrderStatus.CONFIRMED, undefined]]);
  });

  it('applies both steps, in order, when payment completes before inventory.reserved was handled', async () => {
    orderIn(OrderStatus.PENDING);
    await handleSagaEvent(KafkaTopics.PAYMENT_COMPLETED, envelope({ orderId: ORDER_ID, items, amount: 25 }), 'c', logger);
    expect(updateOrderStatus.mock.calls).toEqual([
      [ORDER_ID, OrderStatus.INVENTORY_RESERVED, undefined],
      [ORDER_ID, OrderStatus.CONFIRMED, undefined],
    ]);
  });

  it.each([
    [KafkaTopics.INVENTORY_REJECTED, { orderId: ORDER_ID, reason: 'OUT_OF_STOCK' }, OrderStatus.PENDING, 'OUT_OF_STOCK'],
    [KafkaTopics.PAYMENT_FAILED, { orderId: ORDER_ID, items, amount: 25, reason: 'PAYMENT_DECLINED' }, OrderStatus.INVENTORY_RESERVED, 'PAYMENT_DECLINED'],
  ])('cancels on %s and records the reason', async (topic, data, status, reason) => {
    orderIn(status);
    await handleSagaEvent(topic, envelope(data), 'c', logger);
    expect(updateOrderStatus).toHaveBeenCalledWith(ORDER_ID, OrderStatus.CANCELLED, reason);
  });

  it('changes nothing for a duplicate, and says so at info level', async () => {
    orderIn(OrderStatus.CONFIRMED);
    await handleSagaEvent(KafkaTopics.PAYMENT_COMPLETED, envelope({ orderId: ORDER_ID, items, amount: 25 }), 'c', logger);
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a payload it cannot read instead of throwing, and touches no order', async () => {
    await expect(
      handleSagaEvent(KafkaTopics.INVENTORY_RESERVED, envelope({ orderId: ORDER_ID }), 'c', logger),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'inventory.reserved: userId missing or invalid' }),
      expect.any(String),
    );
    expect(getOrderById).not.toHaveBeenCalled();
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it('logs an event for an order it does not have instead of throwing', async () => {
    getOrderById.mockRejectedValue(new NotFoundError('Order'));
    await expect(
      handleSagaEvent(KafkaTopics.INVENTORY_REJECTED, envelope({ orderId: ORDER_ID, reason: 'OUT_OF_STOCK' }), 'c', logger),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });
});
