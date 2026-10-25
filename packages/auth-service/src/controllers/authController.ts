/**
 * HTTP handlers for `/api/v1/auth`: validate the request, call the auth service, and set or clear the session
 * cookies.
 */
import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { bodyOf, REFRESH_COOKIE_NAME, UnauthorizedError } from '@ecommerce/shared';
import * as authService from '../services/authService';

const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 604800);
const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};
const refreshCookieOptions = {
  ...baseCookieOptions,
  maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  path: '/api/v1/auth',
};

const readCookie = (request: Request, name: string): string | undefined =>
  request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const setSessionCookies = (response: Response, result: Awaited<ReturnType<typeof authService.login>>): void => {
  response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);
  response.clearCookie('access_token', { ...baseCookieOptions, path: '/' });
};

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(1).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

/**
 * `POST /register` with `{ email, password, name }`: creates the user and signs them in (201 with the user and an
 * access token; the refresh token goes in its cookie). 409 if the email is taken.
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = registerSchema.validate(bodyOf(req));
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }

    const result = await authService.register(value);
    setSessionCookies(res, result);
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /login` with `{ email, password }`: signs in. A wrong password and an unknown email give the same 400, so
 * the answer doesn't reveal which emails exist.
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = loginSchema.validate(bodyOf(req));
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }

    const result = await authService.login(value);
    setSessionCookies(res, result);
    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /refresh`: swaps the refresh cookie for a new access token and a new refresh token (rotation). With no
 * valid cookie it answers `{ accessToken: null }`, not an error, so the storefront can call it on every load.
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      res.json({ accessToken: null });
      return;
    }

    const result = await authService.rotateRefreshToken(refreshToken);
    setSessionCookies(res, result);
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.clearCookie('access_token', { ...baseCookieOptions, path: '/' });
      res.clearCookie(REFRESH_COOKIE_NAME, { ...baseCookieOptions, path: '/api/v1/auth' });
      res.json({ accessToken: null });
      return;
    }
    next(err);
  }
};

/** `POST /logout`: revokes the refresh session and clears both cookies (204). */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await authService.revokeRefreshToken(readCookie(req, REFRESH_COOKIE_NAME));
    res.clearCookie('access_token', { ...baseCookieOptions, path: '/' });
    res.clearCookie(REFRESH_COOKIE_NAME, { ...baseCookieOptions, path: '/api/v1/auth' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

/** `GET /profile`: the signed-in user (the gateway requires a JWT and sets `x-user-id`). */
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      res.status(401).json({ error: { code: 401, message: 'Unauthorized' } });
      return;
    }

    const user = await authService.getProfile(String(userId));
    res.json(user);
  } catch (err) {
    next(err);
  }
};
