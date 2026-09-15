import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export const JWT_SECRET: Secret = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';

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
export const signToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, JWT_SECRET, options);
};
