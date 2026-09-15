import bcrypt from 'bcryptjs';
import { db } from '../models/userModel';
import { signToken, ValidationError, NotFoundError, ConflictError } from '@ecommerce/shared';

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
  token: string;
}

const SALT_ROUNDS = 10;

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

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return { user, token };
};

export const login = async ({ email, password }: LoginInput): Promise<AuthResponse> => {
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
