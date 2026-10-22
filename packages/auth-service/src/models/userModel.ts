import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'ecommerce',
    password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
    database: process.env.POSTGRES_DB_AUTH || 'auth_db',
  },
  pool: { min: 2, max: 10 },
});

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export const runMigrations = async (): Promise<void> => {
  const hasTable = await db.schema.hasTable('users');
  if (!hasTable) {
    await db.schema.createTable('users', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.string('email').unique().notNullable();
      table.string('password_hash').notNullable();
      table.string('name').notNullable();
      table.string('role').defaultTo('user');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Created users table');
  }

  const hasRefreshSessions = await db.schema.hasTable('refresh_sessions');
  if (!hasRefreshSessions) {
    await db.schema.createTable('refresh_sessions', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token_hash', 64).unique().notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['user_id']);
    });
    console.log('Created refresh_sessions table');
  }
};
