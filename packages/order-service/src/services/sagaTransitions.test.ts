import { canTransitionOrder, KafkaTopics, OrderStatus } from '@ecommerce/shared';
import { describe, expect, it } from 'vitest';
import { nextTransitions } from './sagaTransitions';

const { PENDING, INVENTORY_RESERVED, CONFIRMED, CANCELLED, SHIPPED, DELIVERED } = OrderStatus;
const { INVENTORY_RESERVED: RESERVED, INVENTORY_REJECTED: REJECTED, PAYMENT_COMPLETED: PAID, PAYMENT_FAILED: DECLINED } =
  KafkaTopics;

describe('nextTransitions (plan §4)', () => {
  // Written out row by row so dropping a case fails a test.
  it.each([
    [RESERVED, PENDING, [{ status: INVENTORY_RESERVED }]],
    [REJECTED, PENDING, [{ status: CANCELLED, reason: 'OUT_OF_STOCK' }]],
    [PAID, INVENTORY_RESERVED, [{ status: CONFIRMED }]],
    [PAID, PENDING, [{ status: INVENTORY_RESERVED }, { status: CONFIRMED }]], // payment overtook inventory.reserved
    [DECLINED, INVENTORY_RESERVED, [{ status: CANCELLED, reason: 'PAYMENT_DECLINED' }]],
    [DECLINED, PENDING, [{ status: CANCELLED, reason: 'PAYMENT_DECLINED' }]],
  ])('%s on a %s order → %j', (topic, current, steps) => {
    expect(nextTransitions(current, topic)).toEqual(steps);
  });

  it.each([
    [RESERVED, INVENTORY_RESERVED, 'duplicate'],
    [RESERVED, CONFIRMED, 'late, payment already handled'],
    [RESERVED, CANCELLED, 'late, already cancelled'],
    [REJECTED, CANCELLED, 'duplicate'],
    [PAID, CONFIRMED, 'duplicate'],
    [PAID, CANCELLED, 'already cancelled'],
    [DECLINED, CANCELLED, 'duplicate'],
    [DECLINED, CONFIRMED, 'already confirmed'],
    [PAID, SHIPPED, 'past checkout'],
    [DECLINED, DELIVERED, 'past checkout'],
  ])('%s on a %s order changes nothing (%s)', (topic, current) => {
    expect(nextTransitions(current, topic)).toEqual([]);
  });

  it('changes nothing for a topic it does not handle or a status it does not know', () => {
    expect(nextTransitions(PENDING, KafkaTopics.ORDER_CREATED)).toEqual([]);
    expect(nextTransitions('SHIPPING', PAID)).toEqual([]);
  });

  it('only ever proposes steps the order state machine allows', () => {
    for (const topic of [RESERVED, REJECTED, PAID, DECLINED]) {
      for (const status of Object.values(OrderStatus) as string[]) {
        let current: string = status;
        for (const step of nextTransitions(status, topic)) {
          expect(canTransitionOrder(current, step.status)).toBe(true);
          current = step.status;
        }
      }
    }
  });
});
