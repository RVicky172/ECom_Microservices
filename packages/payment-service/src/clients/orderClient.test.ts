import { AppError } from '@ecommerce/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOrderOwnedBy } from './orderClient';

const USER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';

const fetchMock = vi.fn();
const respond = (status: number) => fetchMock.mockResolvedValueOnce(new Response('{}', { status }));

describe('isOrderOwnedBy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ORDER_SERVICE_URL', 'http://order-service:4004');
    vi.stubEnv('INTERNAL_SERVICE_TOKEN', 'internal-test-token');
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks the order service for the order as the caller, with the internal token", async () => {
    respond(200);
    await isOrderOwnedBy(ORDER_ID, USER, 'corr-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://order-service:4004/api/v1/orders/${ORDER_ID}`);
    expect(init.headers).toMatchObject({
      'x-user-id': USER,
      'x-correlation-id': 'corr-1',
      'x-internal-token': 'internal-test-token',
    });
  });

  it('leaves out the internal token when none is configured', async () => {
    vi.stubEnv('INTERNAL_SERVICE_TOKEN', '');
    respond(200);
    await isOrderOwnedBy(ORDER_ID, USER);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-internal-token');
  });

  it('is true when the order service returns the order (200)', async () => {
    respond(200);
    await expect(isOrderOwnedBy(ORDER_ID, USER)).resolves.toBe(true);
  });

  it('is false when the order service says not found (404: missing or not yours)', async () => {
    respond(404);
    await expect(isOrderOwnedBy(ORDER_ID, USER)).resolves.toBe(false);
  });

  it.each([
    ['a 500', () => respond(500)],
    ['a 401', () => respond(401)],
    ['a network failure', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))],
  ])('throws a 502 on %s, never answering "not found"', async (_case, arrange) => {
    arrange();
    const error = await isOrderOwnedBy(ORDER_ID, USER).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
  });
});
