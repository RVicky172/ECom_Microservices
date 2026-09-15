const bcrypt = require('bcryptjs');
const { db } = require('../models/userModel');
const { signToken } = require('@ecommerce/shared/src/jwt');
const { ValidationError, NotFoundError, ConflictError } = require('@ecommerce/shared/src/errors');

const SALT_ROUNDS = 10;

const register = async ({ email, password, name }) => {
  // Check for existing user
  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db('users')
    .insert({ email, password_hash, name })
    .returning(['id', 'email', 'name', 'role', 'created_at']);

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return { user, token };
};

const login = async ({ email, password }) => {
  const user = await db('users').where({ email }).first();
  if (!user) {
    throw new ValidationError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new ValidationError('Invalid email or password');
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    token,
  };
};

const getProfile = async (userId) => {
  const user = await db('users')
    .select('id', 'email', 'name', 'role', 'created_at')
    .where({ id: userId })
    .first();

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
};

module.exports = { register, login, getProfile };
