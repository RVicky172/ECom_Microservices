/** Payment's PostgreSQL connection and schema (`payments`, `idempotency_keys`). */
import knex from 'knex';

/** The knex connection to `payment_db`, configured from the `POSTGRES_*` variables. */
export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'ecommerce',
    password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
    database: process.env.POSTGRES_DB_PAYMENT || 'payment_db',
  },
  pool: { min: 2, max: 10 },
});

/** Creates the tables if they are missing. Run once at startup. */
export const runMigrations = async (): Promise<void> => {
  if (!(await db.schema.hasTable('payments'))) {
    await db.schema.createTable('payments', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.string('order_id').notNullable();
      table.decimal('amount', 12, 2).notNullable();
      table.string('status').notNullable();
      table.string('gateway_transaction_id');
      table.string('idempotency_key').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Created payments table');
  }

  // Idempotency keys (Section 11)
  if (!(await db.schema.hasTable('idempotency_keys'))) {
    await db.schema.createTable('idempotency_keys', (table) => {
      table.string('key').primary();
      table.string('status').notNullable(); // IN_PROGRESS, COMPLETED, FAILED
      table.integer('response_code');
      table.jsonb('response_body');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Created idempotency_keys table');
  }
};
