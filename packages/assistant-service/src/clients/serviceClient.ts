import { INTERNAL_TOKEN_HEADER } from '@ecommerce/shared';
import { config } from '../config';
import type { RequestContext } from '../context';

/** A non-2xx response (or network failure) from an internal service. */
export class ServiceError extends Error {
  constructor(
    readonly service: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * GET JSON from an internal service on behalf of the current user.
 *
 * Forwards the same identity headers the gateway would (`x-user-id`,
 * `x-correlation-id`) plus the internal service token, so services apply their
 * normal per-user scoping.
 */
export const getJson = async <T>(
  service: keyof typeof config.services,
  path: string,
  ctx: RequestContext,
  query?: Record<string, string | number>,
): Promise<T> => {
  const url = new URL(path, config.services[service]);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-user-id': ctx.userId,
    'x-correlation-id': ctx.correlationId,
  };
  if (process.env.INTERNAL_SERVICE_TOKEN) {
    headers[INTERNAL_TOKEN_HEADER] = process.env.INTERNAL_SERVICE_TOKEN;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(config.serviceTimeoutMs) });
  } catch (error) {
    throw new ServiceError(service, null, `${service} service unreachable: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new ServiceError(service, response.status, `${service} service returned ${response.status}`);
  }
  return (await response.json()) as T;
};
