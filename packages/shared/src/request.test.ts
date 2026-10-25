import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { bodyOf } from './request';

const withBody = (body: unknown) => ({ body }) as Request;

describe('bodyOf', () => {
  it('gives {} when the request had no body (Express 5 leaves req.body undefined)', () => {
    expect(bodyOf(withBody(undefined))).toEqual({});
  });

  it('returns a parsed body unchanged', () => {
    const body = { email: 'ada@example.com' };
    expect(bodyOf(withBody(body))).toBe(body);
  });

  it('keeps other values for the validator to reject', () => {
    expect(bodyOf(withBody([]))).toEqual([]);
    expect(bodyOf(withBody('text'))).toBe('text');
    expect(bodyOf(withBody(null))).toBeNull();
  });
});
