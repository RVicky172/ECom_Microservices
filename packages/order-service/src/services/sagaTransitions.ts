/** What each saga event means for an order's status, as a pure function the consumer applies. */
import { KafkaTopics, OrderStatus } from '@ecommerce/shared';
import type { CancelReason } from '@ecommerce/shared';

/** One status change to apply to an order, with the cancel reason when it is a cancellation. */
export interface Step {
  status: OrderStatus;
  reason?: CancelReason;
}

/**
 * The status changes a saga event means for an order in `current` status (plan §4).
 *
 * Topics arrive independently, so `payment.completed` can be handled while the
 * order is still `PENDING` (its `inventory.reserved` not processed yet): a payment
 * implies the stock was reserved, so the order steps through `INVENTORY_RESERVED`
 * to `CONFIRMED`. Late, duplicate and unknown cases return no steps. Every step is
 * still applied through `updateOrderStatus`, so the state machine stays the gate.
 */
export const nextTransitions = (current: string, topic: string): Step[] => {
  switch (topic) {
    case KafkaTopics.INVENTORY_RESERVED:
      return current === OrderStatus.PENDING ? [{ status: OrderStatus.INVENTORY_RESERVED }] : [];

    case KafkaTopics.INVENTORY_REJECTED:
      return current === OrderStatus.PENDING ? [{ status: OrderStatus.CANCELLED, reason: 'OUT_OF_STOCK' }] : [];

    case KafkaTopics.PAYMENT_COMPLETED:
      if (current === OrderStatus.INVENTORY_RESERVED) return [{ status: OrderStatus.CONFIRMED }];
      if (current === OrderStatus.PENDING) {
        return [{ status: OrderStatus.INVENTORY_RESERVED }, { status: OrderStatus.CONFIRMED }];
      }
      return [];

    case KafkaTopics.PAYMENT_FAILED:
      return current === OrderStatus.PENDING || current === OrderStatus.INVENTORY_RESERVED
        ? [{ status: OrderStatus.CANCELLED, reason: 'PAYMENT_DECLINED' }]
        : [];

    default:
      return [];
  }
};
