import { NotFoundError } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrderForUser } from './orderService';

/**
 * In-memory stand-in for the knex calls the read path makes:
 * `db(table).where(match).first()` and `await db(table).where(match)`.
 * `vi.hoisted` because `vi.mock` runs before the module body.
 */
const { tables, queries, matches } = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as string[],
  matches: (row: Record<string, unknown>, match: Record<string, unknown>) =>
    Object.entries(match).every(([key, value]) => row[key] === value),
}));

vi.mock('../models/orderModel', () => ({
  db: (table: string) => ({
    where: (match: Record<string, unknown>) => {
      queries.push(table);
      const rows = (tables[table] ?? []).filter((row) => matches(row, match));
      return { first: async () => rows[0], then: (resolve: (value: unknown) => unknown) => resolve(rows) };
    },
  }),
}));

const OWNER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const OTHER = '9acba204-ccee-45f1-ba25-8b873ac9bc79';
const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

/** The rejection a caller gets, so two cases can be compared field by field. */
const rejectionOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as NotFoundError;
  }
  throw new Error('expected a rejection');
};

describe('getOrderForUser', () => {
  beforeEach(() => {
    queries.length = 0;
    tables.orders = [{ id: ORDER_ID, user_id: OWNER, status: 'PENDING', total_amount: 25 }];
    tables.order_items = [{ id: 'item-1', order_id: ORDER_ID, product_id: 'p-1', quantity: 1, price: 25 }];
  });

  it('gives the owner their order with its items', async () => {
    const order = await getOrderForUser(ORDER_ID, OWNER);
    expect(order).toMatchObject({ id: ORDER_ID, user_id: OWNER, status: 'PENDING' });
    expect(order.items).toEqual([expect.objectContaining({ id: 'item-1' })]);
  });

  it("answers someone else's order exactly like a missing one", async () => {
    const notYours = await rejectionOf(getOrderForUser(ORDER_ID, OTHER));
    const missing = await rejectionOf(getOrderForUser(MISSING_ID, OTHER));

    expect(notYours).toBeInstanceOf(NotFoundError);
    expect([notYours.statusCode, notYours.message]).toEqual([missing.statusCode, missing.message]);
    expect(notYours.message).toBe('Order not found');
  });

  it("never loads the items of someone else's order", async () => {
    await rejectionOf(getOrderForUser(ORDER_ID, OTHER));
    expect(queries).not.toContain('order_items');
  });

  it('answers a malformed ID with not found, without querying the database', async () => {
    const error = await rejectionOf(getOrderForUser('abc', OWNER));
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Order not found');
    expect(queries).toEqual([]);
  });
});
