const Joi = require('joi');
const authService = require('../services/authService');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(1).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const register = async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }

    const result = await authService.register(value);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }

    const result = await authService.login(value);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: { code: 401, message: 'Unauthorized' } });
    }

    const user = await authService.getProfile(userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getProfile };
