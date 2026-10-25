/** Payments: a simulated, idempotent charge per order, and owner-only reads. */
import { db } from '../models/paymentModel';
import { ConflictError, NotFoundError, isUuid } from '@ecommerce/shared';
import { isOrderOwnedBy } from '../clients/orderClient';

interface Payment {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  gateway_transaction_id: string | null;
  idempotency_key: string;
  created_at: Date;
}

/**
 * Idempotent payment processing (Section 11).
 * Success is simulated: a draw below `PAYMENT_SUCCESS_RATE` (default 0.85) succeeds.
 * `draw` is injectable so tests decide the outcome instead of chance.
 */
export const processPayment = async (
  orderId: string,
  amount: number,
  idempotencyKey: string,
  draw: () => number = Math.random,
): Promise<Payment> => {
  let result: Payment | undefined;

  await db.transaction(async (trx: any) => {
    // 1. Claim the idempotency key (atomic INSERT … ON CONFLICT DO NOTHING). A plain insert of an
    //    existing key raises a unique violation, which aborts this PostgreSQL transaction, so the
    //    stored result could never be read back (found in 010 T033).
    const claimed = await trx('idempotency_keys')
      .insert({ key: idempotencyKey, status: 'IN_PROGRESS' })
      .onConflict('key')
      .ignore()
      .returning('key');

    if (claimed.length === 0) {
      const existingKey = await trx('idempotency_keys').where({ key: idempotencyKey }).first();
      if (existingKey.status === 'IN_PROGRESS') {
        throw new ConflictError('Payment is already being processed');
      }
      result = existingKey.response_body;
      return; // Already COMPLETED or FAILED: return the stored result, don't re-process
    }

    // 2. Process payment (simulated with random success rate)
    const successRate = parseFloat(process.env.PAYMENT_SUCCESS_RATE || '0.85');
    const isSuccess = draw() < successRate;
    const status = isSuccess ? 'COMPLETED' : 'FAILED';
    const gatewayTxId = `sim_tx_${Date.now()}`;

    const [payment] = await trx('payments')
      .insert({
        order_id: orderId,
        amount,
        status,
        gateway_transaction_id: isSuccess ? gatewayTxId : null,
        idempotency_key: idempotencyKey,
      })
      .returning('*');

    result = payment;

    // 3. Update idempotency key
    await trx('idempotency_keys')
      .where({ key: idempotencyKey })
      .update({
        status,
        response_code: isSuccess ? 200 : 400,
        response_body: JSON.stringify(payment),
        updated_at: db.fn.now(),
      });
  });

  return result!;
};

/**
 * The payment for an order, only if the order belongs to `userId`. Ownership is
 * checked first (through the order service), so someone else's order gets the same
 * NotFoundError as an order without a payment, whether or not one exists.
 */
export const getPaymentForUser = async (orderId: string, userId: string, correlationId?: string): Promise<Payment> => {
  if (!isUuid(orderId)) throw new NotFoundError('Payment');
  if (!(await isOrderOwnedBy(orderId, userId, correlationId))) throw new NotFoundError('Payment');

  const payment = (await db('payments').where({ order_id: orderId }).first()) as
    | Payment
    | undefined;
  if (!payment) throw new NotFoundError('Payment');
  return payment;
};
