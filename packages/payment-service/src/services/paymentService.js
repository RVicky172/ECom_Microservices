const { db } = require('../models/paymentModel');
const { ConflictError, NotFoundError } = require('@ecommerce/shared/src/errors');

/**
 * Idempotent payment processing (Section 11).
 */
const processPayment = async (orderId, amount, idempotencyKey) => {
  let result;
  
  await db.transaction(async (trx) => {
    // 1. Check idempotency key (Atomic INSERT)
    try {
      await trx('idempotency_keys').insert({
        key: idempotencyKey,
        status: 'IN_PROGRESS',
      });
    } catch (err) {
      if (err.code === '23505') { // unique_violation
        const existingKey = await trx('idempotency_keys').where({ key: idempotencyKey }).first();
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

    const [payment] = await trx('payments').insert({
      order_id: orderId,
      amount,
      status,
      gateway_transaction_id: isSuccess ? gatewayTxId : null,
      idempotency_key: idempotencyKey,
    }).returning('*');

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

  return result;
};

const getPayment = async (orderId) => {
  const payment = await db('payments').where({ order_id: orderId }).first();
  if (!payment) throw new NotFoundError('Payment');
  return payment;
};

module.exports = { processPayment, getPayment };
