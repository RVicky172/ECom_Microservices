import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken, verifyToken, type JwtPayload } from './jwt';

const user: JwtPayload = { id: 'user-1', email: 'ada@example.com', role: 'customer' };

describe('JWT helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies a signed token back to the same identity', () => {
    expect(verifyToken(signToken(user))).toMatchObject(user);
  });

  it('rejects a token once it has expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    const token = signToken(user); // default lifetime: 15 minutes

    vi.setSystemTime(new Date('2026-10-23T12:14:00Z'));
    expect(verifyToken(token)).toMatchObject(user);

    vi.setSystemTime(new Date('2026-10-23T12:16:00Z'));
    expect(() => verifyToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign(user, 'another-secret', { expiresIn: '15m' });
    expect(() => verifyToken(forged)).toThrow(jwt.JsonWebTokenError);
  });

  it('rejects a token whose payload was modified', () => {
    const [header, , signature] = signToken(user).split('.');
    const escalated = Buffer.from(JSON.stringify({ ...user, role: 'admin' })).toString('base64url');
    expect(() => verifyToken(`${header}.${escalated}.${signature}`)).toThrow(jwt.JsonWebTokenError);
  });
});
