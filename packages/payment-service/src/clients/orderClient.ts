import { AppError, INTERNAL_TOKEN_HEADER } from '@ecommerce/shared';

const TIMEOUT_MS = 3000;

/**
 * Whether `orderId` belongs to `userId`, decided by the order service, which owns
 * order data (Constitution V: no reads of order_db from here).
 *
 * Calls `GET /api/v1/orders/:id` as the user, forwarding the same identity and
 * internal-token headers the gateway sends; the order service answers 200 only to
 * the owner and 404 to everyone else. Any other outcome is an outage, reported as a
 * 502 rather than "not found".
 */
export const isOrderOwnedBy = async (orderId: string, userId: string, correlationId?: string): Promise<boolean> => {
  const baseUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:4004';
  const headers: Record<string, string> = { accept: 'application/json', 'x-user-id': userId };
  if (correlationId) headers['x-correlation-id'] = correlationId;
  if (process.env.INTERNAL_SERVICE_TOKEN) headers[INTERNAL_TOKEN_HEADER] = process.env.INTERNAL_SERVICE_TOKEN;

  let response: Response;
  try {
    response = await fetch(new URL(`/api/v1/orders/${encodeURIComponent(orderId)}`, baseUrl), {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError('Order service unavailable', 502);
  }

  if (response.status === 200) return true;
  if (response.status === 404) return false;
  throw new AppError(`Order service returned ${response.status}`, 502);
};
