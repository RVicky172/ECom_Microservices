const knex = require('knex');

const db = knex({
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

const runMigrations = async () => {
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
};

module.exports = { db, runMigrations };
