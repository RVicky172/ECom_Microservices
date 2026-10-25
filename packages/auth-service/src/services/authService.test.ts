import { ValidationError, verifyToken } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login, register } from './authService';

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({ users: [] as Row[], sessions: [] as Row[] }));

// Minimal fake of the knex calls authService makes: where(match).first(), insert(row)[.returning(cols)].
vi.mock('../models/userModel', () => {
  const tables: Record<string, () => Row[]> = { users: () => store.users, refresh_sessions: () => store.sessions };
  const db = (table: string) => {
    const rows = tables[table]();
    return {
      where: (match: Row) => ({
        first: async () => rows.find((row) => Object.entries(match).every(([key, value]) => row[key] === value)),
      }),
      insert: (row: Row) => {
        const saved = { id: `id-${rows.length + 1}`, role: 'user', ...row };
        rows.push(saved);
        const done = Promise.resolve([saved]);
        return Object.assign(done, { returning: async () => [saved] });
      },
    };
  };
  return { db };
});

// Written by bcryptjs 2.4.3 before the 005 upgrade (T003): users registered then must still sign in.
const LEGACY_PASSWORD = 'Baseline-pass-1';
const LEGACY_HASH = '$2a$10$hAnQLqW3EUiSRQL5UJd/KuFw/N6lM6nxNSDYFyXEozXj/riaJOp3u';

describe('login', () => {
  beforeEach(() => {
    store.users.length = 0;
    store.sessions.length = 0;
    store.users.push({ id: 'user-1', email: 'legacy@example.com', name: 'Legacy', role: 'user', password_hash: LEGACY_HASH });
  });

  it('accepts a password hash written by bcryptjs 2.4.3', async () => {
    const result = await login({ email: 'legacy@example.com', password: LEGACY_PASSWORD });

    expect(result.user).toEqual({ id: 'user-1', email: 'legacy@example.com', name: 'Legacy', role: 'user' });
    expect(verifyToken(result.accessToken)).toMatchObject({ id: 'user-1', role: 'user' });
    expect(store.sessions).toHaveLength(1);
  });

  it('rejects a wrong password with the same error as an unknown email', async () => {
    await expect(login({ email: 'legacy@example.com', password: 'wrong' })).rejects.toThrow(ValidationError);
    await expect(login({ email: 'nobody@example.com', password: LEGACY_PASSWORD })).rejects.toThrow(
      'Invalid email or password',
    );
    expect(store.sessions).toHaveLength(0);
  });

  it('signs in a user registered with the current bcryptjs', async () => {
    await register({ email: 'new@example.com', password: 'new-pass-1', name: 'New' });
    const saved = store.users.find((user) => user.email === 'new@example.com');

    expect(saved?.password_hash).toMatch(/^\$2[ab]\$10\$/);
    await expect(login({ email: 'new@example.com', password: 'new-pass-1' })).resolves.toMatchObject({
      user: { email: 'new@example.com' },
    });
  });
});
