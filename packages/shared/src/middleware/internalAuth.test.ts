import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../errors';
import { INTERNAL_TOKEN_HEADER, requireInternalToken } from './internalAuth';

const TOKEN = 'internal-test-token';

/** Calls the middleware with a minimal request and returns what it passed to `next`. */
const callWith = (path: string, headers: Record<string, string> = {}) => {
  const next = vi.fn();
  requireInternalToken({ path, headers } as unknown as Request, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0];
};

describe('requireInternalToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('with INTERNAL_SERVICE_TOKEN set', () => {
    it('lets a request with the right token through', () => {
      vi.stubEnv('INTERNAL_SERVICE_TOKEN', TOKEN);
      expect(callWith('/orders', { [INTERNAL_TOKEN_HEADER]: TOKEN })).toEqual([]);
    });

    it.each([
      ['missing', {}],
      ['wrong', { [INTERNAL_TOKEN_HEADER]: 'not-the-token' }],
      ['wrong length', { [INTERNAL_TOKEN_HEADER]: `${TOKEN}x` }],
    ])('rejects a request with a %s token with 401', (_case, headers) => {
      vi.stubEnv('INTERNAL_SERVICE_TOKEN', TOKEN);
      const [error] = callWith('/orders', headers);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.statusCode).toBe(401);
    });

    it('keeps /health open for Docker health checks', () => {
      vi.stubEnv('INTERNAL_SERVICE_TOKEN', TOKEN);
      expect(callWith('/health')).toEqual([]);
    });
  });

  it('lets every request through when no token is configured (opt-in, 000 G11)', () => {
    vi.stubEnv('INTERNAL_SERVICE_TOKEN', '');
    expect(callWith('/orders')).toEqual([]);
  });
});
