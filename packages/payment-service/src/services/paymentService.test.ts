import { NotFoundError } from '@ecommerce/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOrderOwnedBy } from '../clients/orderClient';
import { getPaymentForUser, processPayment } from './paymentService';

/** In-memory stand-in for `db('payments').where(match).first()` (hoisted: `vi.mock` runs first). */
const state = vi.hoisted(() => ({
  payments: [] as Record<string, unknown>[],
  queries: [] as string[],
  inserted: [] as Array<{ table: string; row: Record<string, unknown> }>,
  keys: new Map<string, Record<string, unknown>>(), // idempotency_keys rows
}));
const { queries } = state;

/** `db(table).where(match).first()` for reads; `db.transaction(cb)` with a recording `trx` for processPayment. */
vi.mock('../models/paymentModel', () => {
  // Like PostgreSQL: a plain duplicate insert into idempotency_keys fails and aborts the transaction, so every
  // later query in it fails too; `onConflict().ignore()` instead returns no rows and leaves the transaction usable.
  const makeTrx = () => {
  let aborted = false;
  const guard = <T>(work: () => T): T => {
    if (aborted) throw new Error('current transaction is aborted, commands ignored until end of transaction block');
    return work();
  };
  const trx = (table: string) => ({
    insert: (row: Record<string, unknown>) => {
      if (aborted) return Object.assign(Promise.reject(new Error('current transaction is aborted')), { returning: async () => guard(() => []), onConflict: () => ({ ignore: () => ({ returning: async () => guard(() => []) }) }) });
      const duplicate = table === 'idempotency_keys' && state.keys.has(row.key as string);
      if (!duplicate) {
        state.inserted.push({ table, row });
        if (table === 'idempotency_keys') state.keys.set(row.key as string, { ...row });
      }
      // A plain insert (awaited directly) of a duplicate fails and aborts the transaction.
      const plain = {
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (duplicate) {
            aborted = true;
            return Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' })).then(resolve, reject);
          }
          return Promise.resolve().then(resolve, reject);
        },
      };
      const returning = async () => (duplicate ? [] : [{ id: 'pay-new', ...row }]);
      return Object.assign(plain, { returning, onConflict: () => ({ ignore: () => ({ returning }) }) });
    },
    where: (match: { key?: string }) => ({
      first: async () => guard(() => (match.key ? state.keys.get(match.key) : undefined)),
      update: async (fields: Record<string, unknown>) =>
        guard(() => {
          if (match.key && state.keys.has(match.key)) Object.assign(state.keys.get(match.key)!, fields);
          return 1;
        }),
    }),
  });
  return trx;
  };
  const db = Object.assign(
    (table: string) => ({
      where: (match: Record<string, unknown>) => {
        queries.push(table);
        const rows = state.payments.filter((row) => Object.entries(match).every(([key, value]) => row[key] === value));
        return { first: async () => rows[0] };
      },
    }),
    { transaction: async (work: (t: ReturnType<typeof makeTrx>) => Promise<void>) => work(makeTrx()), fn: { now: () => 'now' } },
  );
  return { db };
});

vi.mock('../clients/orderClient', () => ({ isOrderOwnedBy: vi.fn() }));

const ownedBy = vi.mocked(isOrderOwnedBy);

const OWNER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const OTHER = '9acba204-ccee-45f1-ba25-8b873ac9bc79';
const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';

const rejectionOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as NotFoundError;
  }
  throw new Error('expected a rejection');
};

describe('getPaymentForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.length = 0;
    state.payments = [{ id: 'pay-1', order_id: ORDER_ID, amount: '25.00', status: 'COMPLETED' }];
    ownedBy.mockImplementation(async (_orderId, userId) => userId === OWNER);
  });

  it('gives the owner the payment for their order', async () => {
    await expect(getPaymentForUser(ORDER_ID, OWNER, 'corr-1')).resolves.toMatchObject({ id: 'pay-1' });
    expect(ownedBy).toHaveBeenCalledWith(ORDER_ID, OWNER, 'corr-1');
  });

  it('answers the owner with not found when the order has no payment', async () => {
    state.payments = [];
    const error = await rejectionOf(getPaymentForUser(ORDER_ID, OWNER));
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Payment not found');
  });

  it.each([
    ['has a payment', true],
    ['has no payment', false],
  ])("answers someone else's order that %s exactly like an order without a payment", async (_case, hasPayment) => {
    state.payments = [];
    const noPayment = await rejectionOf(getPaymentForUser(ORDER_ID, OWNER));

    state.payments = hasPayment ? [{ id: 'pay-1', order_id: ORDER_ID, amount: '25.00', status: 'COMPLETED' }] : [];
    queries.length = 0;
    const notYours = await rejectionOf(getPaymentForUser(ORDER_ID, OTHER));

    expect(notYours).toBeInstanceOf(NotFoundError);
    expect([notYours.statusCode, notYours.message]).toEqual([noPayment.statusCode, noPayment.message]);
    expect(queries).toEqual([]); // the payments table is never read for a non-owner
  });

  it('answers a malformed ID with not found, without asking the order service', async () => {
    const error = await rejectionOf(getPaymentForUser('abc', OWNER));
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Payment not found');
    expect(ownedBy).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });

  it('lets an order-service failure through instead of answering not found', async () => {
    const outage = Object.assign(new Error('Order service unavailable'), { statusCode: 502 });
    ownedBy.mockRejectedValueOnce(outage);
    await expect(getPaymentForUser(ORDER_ID, OWNER)).rejects.toBe(outage);
  });
});

describe('processPayment', () => {
  beforeEach(() => {
    state.inserted.length = 0;
    state.keys.clear();
    vi.stubEnv('PAYMENT_SUCCESS_RATE', '0.85');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const paymentRow = () => state.inserted.find(({ table }) => table === 'payments')?.row;

  it('completes when the draw is below the success rate, storing the order total', async () => {
    const payment = await processPayment(ORDER_ID, 125, 'evt_1', () => 0.5);
    expect(payment.status).toBe('COMPLETED');
    expect(paymentRow()).toMatchObject({ order_id: ORDER_ID, amount: 125, status: 'COMPLETED', idempotency_key: 'evt_1' });
    expect(paymentRow()?.gateway_transaction_id).toMatch(/^sim_tx_/);
  });

  it('fails when the draw is at or above the success rate, still storing the amount', async () => {
    const payment = await processPayment(ORDER_ID, 125, 'evt_2', () => 0.85);
    expect(payment.status).toBe('FAILED');
    expect(paymentRow()).toMatchObject({ amount: 125, status: 'FAILED', gateway_transaction_id: null });
  });

  it.each([
    ['COMPLETED', () => 0.1],
    ['FAILED', () => 0.99],
  ])('returns the stored %s result for a repeated idempotency key, without paying again (AC-7)', async (status, draw) => {
    const first = await processPayment(ORDER_ID, 125, 'evt_repeat', draw);
    state.keys.get('evt_repeat')!.response_body = first; // as stored by the first call's update
    const paymentsBefore = state.inserted.filter(({ table }) => table === 'payments').length;

    const repeat = await processPayment(ORDER_ID, 125, 'evt_repeat', () => 0.5);

    expect(repeat).toEqual(first);
    expect(repeat.status).toBe(status);
    expect(state.inserted.filter(({ table }) => table === 'payments')).toHaveLength(paymentsBefore);
  });

  it('refuses a key that is still being processed', async () => {
    state.keys.set('evt_busy', { key: 'evt_busy', status: 'IN_PROGRESS' });
    await expect(processPayment(ORDER_ID, 125, 'evt_busy', () => 0.1)).rejects.toThrow('Payment is already being processed');
  });

  it.each([
    ['1', 0.999, 'COMPLETED'],
    ['0', 0, 'FAILED'],
  ])('PAYMENT_SUCCESS_RATE=%s forces the outcome (draw %s → %s)', async (rate, draw, status) => {
    vi.stubEnv('PAYMENT_SUCCESS_RATE', rate);
    expect((await processPayment(ORDER_ID, 125, `evt_rate_${rate}`, () => draw)).status).toBe(status);
  });
});
