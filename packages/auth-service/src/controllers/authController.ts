import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import * as authService from '../services/authService';

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(1).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }

    const result = await authService.register(value);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: { code: 400, message: error.details[0].message } });
      return;
    }

    const result = await authService.login(value);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

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
