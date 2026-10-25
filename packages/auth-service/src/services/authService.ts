/**
 * Accounts and sessions: bcrypt password hashes, short-lived access tokens (JWT) and rotating refresh tokens, stored
 * only as SHA-256 hashes in `refresh_sessions`.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../models/userModel';
import { signToken, ValidationError, NotFoundError, ConflictError, UnauthorizedError } from '@ecommerce/shared';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at?: Date;
}

interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 604800);
const hashRefreshToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const createSession = async (user: UserResponse): Promise<AuthResponse> => {
  const accessToken = signToken(
    { id: user.id, email: user.email, role: user.role },
    ACCESS_TOKEN_TTL_SECONDS,
  );
  const refreshToken = randomBytes(32).toString('base64url');

  await db('refresh_sessions').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(refreshToken),
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return { user, accessToken, refreshToken };
};

/**
 * Creates a user and opens a session.
 *
 * @throws ConflictError when the email is already registered
 */
export const register = async ({
  email,
  password,
  name,
}: RegisterInput): Promise<AuthResponse> => {
  // Check for existing user
  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db('users')
    .insert({ email, password_hash, name })
    .returning(['id', 'email', 'name', 'role', 'created_at']);

  return createSession(user);
};

/**
 * Checks the password and opens a session.
 *
 * @throws ValidationError with the same message for an unknown email and a wrong password
 */
export const login = async ({ email, password }: LoginInput): Promise<AuthResponse> => {
  const user = await db('users').where({ email }).first();
  if (!user) {
    throw new ValidationError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new ValidationError('Invalid email or password');
  }

  return createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
};

/**
 * Exchanges a refresh token for a new access token and a new refresh token, deleting the old session in the same
 * transaction (the row is locked, so two concurrent refreshes can't both succeed). An expired session is deleted.
 *
 * @throws UnauthorizedError for an unknown or expired token
 */
export const rotateRefreshToken = async (refreshToken: string): Promise<AuthResponse> => {
  const tokenHash = hashRefreshToken(refreshToken);

  return db.transaction(async (transaction) => {
    const session = await transaction('refresh_sessions')
      .join('users', 'refresh_sessions.user_id', 'users.id')
      .select(
        'refresh_sessions.id as session_id',
        'refresh_sessions.user_id',
        'refresh_sessions.expires_at',
        'users.id',
        'users.email',
        'users.name',
        'users.role',
      )
      .where('refresh_sessions.token_hash', tokenHash)
      .forUpdate('refresh_sessions');

    const currentSession = session[0];
    if (!currentSession || new Date(currentSession.expires_at).getTime() <= Date.now()) {
      if (currentSession) {
        await transaction('refresh_sessions').where({ id: currentSession.session_id }).delete();
      }
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    await transaction('refresh_sessions').where({ id: currentSession.session_id }).delete();

    const user: UserResponse = {
      id: currentSession.id,
      email: currentSession.email,
      name: currentSession.name,
      role: currentSession.role,
    };
    const accessToken = signToken(
      { id: user.id, email: user.email, role: user.role },
      ACCESS_TOKEN_TTL_SECONDS,
    );
    const nextRefreshToken = randomBytes(32).toString('base64url');

    await transaction('refresh_sessions').insert({
      user_id: user.id,
      token_hash: hashRefreshToken(nextRefreshToken),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return { user, accessToken, refreshToken: nextRefreshToken };
  });
};

/** Deletes the session for this refresh token, if any (sign-out). */
export const revokeRefreshToken = async (refreshToken: string | undefined): Promise<void> => {
  if (refreshToken) {
    await db('refresh_sessions').where({ token_hash: hashRefreshToken(refreshToken) }).delete();
  }
};

/**
 * The public fields of a user.
 *
 * @throws NotFoundError when the user doesn't exist
 */
export const getProfile = async (userId: string): Promise<UserResponse> => {
  const user = await db('users')
    .select('id', 'email', 'name', 'role', 'created_at')
    .where({ id: userId })
    .first();

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
};
