import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../services/authService';
import { login, register } from './authController';

vi.mock('../services/authService', () => ({ register: vi.fn(), login: vi.fn() }));

// A POST with no body: Express 5 leaves req.body undefined (Express 4 gave {}).
const callWithoutBody = async (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn() };
  const next = vi.fn();
  await handler({ headers: {}, params: {}, query: {}, body: undefined } as unknown as Request, res as unknown as Response, next);
  return { res, next };
};

describe('auth controller without a request body', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['POST /register', register, authService.register],
    ['POST /login', login, authService.login],
  ])('%s answers 400 "email" is required and calls no service', async (_route, handler, service) => {
    const { res, next } = await callWithoutBody(handler);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 400, message: '"email" is required' } });
    expect(service).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
