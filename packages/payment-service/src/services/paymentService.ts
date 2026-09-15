import { db } from '../models/paymentModel';
import { ConflictError, NotFoundError } from '@ecommerce/shared';

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
 */
export const processPayment = async (
  orderId: string,
  amount: number,
  idempotencyKey: string
): Promise<Payment> => {
  let result: Payment | undefined;

  await db.transaction(async (trx: any) => {
    // 1. Check idempotency key (Atomic INSERT)
    try {
      await trx('idempotency_keys').insert({
        key: idempotencyKey,
        status: 'IN_PROGRESS',
      });
    } catch (err: any) {
      if (err.code === '23505') {
        // unique_violation
        const existingKey = await trx('idempotency_keys')
          .where({ key: idempotencyKey })
          .first();
        if (existingKey.status === 'IN_PROGRESS') {
          throw new ConflictError('Payment is already being processed');
        }
        if (existingKey.status === 'COMPLETED' || existingKey.status === 'FAILED') {
          result = existingKey.response_body;
          return; // Return early, don't re-process
        }
      }
      throw err;
    }

    // 2. Process payment (simulated with random success rate)
    const successRate = parseFloat(process.env.PAYMENT_SUCCESS_RATE || '0.85');
    const isSuccess = Math.random() < successRate;
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

export const getPayment = async (orderId: string): Promise<Payment> => {
  const payment = (await db('payments').where({ order_id: orderId }).first()) as
    | Payment
    | undefined;
  if (!payment) throw new NotFoundError('Payment');
  return payment;
};
