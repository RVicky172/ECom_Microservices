/**
 * Access tokens: signing (auth service) and verifying (gateway) with one shared secret.
 */
import jwt, { Secret, SignOptions } from 'jsonwebtoken';

/** The HMAC secret for access tokens. The fallback is for local development only; set `JWT_SECRET` elsewhere. */
export const JWT_SECRET: Secret = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';
/** Name of the httpOnly cookie holding the refresh token. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** What an access token carries about its user. */
export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

/**
 * Verifies a JWT and returns the decoded payload.
 */
export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};

/**
 * Signs a JWT with the given payload.
 */
export const signToken = (
  payload: JwtPayload,
  expiresIn: SignOptions['expiresIn'] = '15m',
): string => {
  const options: SignOptions = {
    expiresIn,
  };

  return jwt.sign(payload, JWT_SECRET, options);
};
