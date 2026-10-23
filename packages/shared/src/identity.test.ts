import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from './errors';
import { isUuid, requireUserId } from './identity';

const requestWith = (headers: Record<string, string | string[]>) => ({ headers }) as unknown as Request;

describe('requireUserId', () => {
  it('returns the user ID the gateway set', () => {
    expect(requireUserId(requestWith({ 'x-user-id': 'user-1' }))).toBe('user-1');
  });

  it.each([
    ['missing', {}],
    ['empty', { 'x-user-id': '' }],
    ['blank', { 'x-user-id': '   ' }],
    ['repeated', { 'x-user-id': ['user-1', 'user-2'] }],
  ])('throws a 401 when the header is %s', (_case, headers) => {
    expect(() => requireUserId(requestWith(headers))).toThrow(UnauthorizedError);
    try {
      requireUserId(requestWith(headers));
    } catch (error) {
      expect((error as UnauthorizedError).statusCode).toBe(401);
    }
  });
});

describe('isUuid', () => {
  it.each([
    '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16',
    '00000000-0000-4000-8000-000000000000',
    '4EB595BD-36DE-4EB6-9EF7-F8DA2B9CFE16', // PostgreSQL accepts upper case too
  ])('accepts %s', (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    'abc',
    '',
    '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16x',
    ' 4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16',
    '4eb595bd36de4eb69ef7f8da2b9cfe16', // no hyphens
    '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe1g', // not hex
    "4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16' OR '1'='1",
  ])('rejects %j', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
