/** Inventory's PostgreSQL connection and schema (`stock_levels`, `processed_events`). */
import knex from 'knex';

/** The knex connection to `inventory_db`, configured from the `POSTGRES_*` variables. */
export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'ecommerce',
    password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
    database: process.env.POSTGRES_DB_INVENTORY || 'inventory_db',
  },
  pool: { min: 2, max: 10 },
});

/** Creates the tables if they are missing. Run once at startup, before serving or consuming. */
export const runMigrations = async (): Promise<void> => {
  if (!(await db.schema.hasTable('stock_levels'))) {
    await db.schema.createTable('stock_levels', (table) => {
      table.string('product_id').primary();
      table.integer('quantity').notNullable().defaultTo(0);
      table.integer('reserved').notNullable().defaultTo(0);
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Created stock_levels table');
  }

  // Idempotency tracking for processed orders
  if (!(await db.schema.hasTable('processed_events'))) {
    await db.schema.createTable('processed_events', (table) => {
      table.string('event_id').primary();
      table.timestamp('processed_at').defaultTo(db.fn.now());
    });
    console.log('Created processed_events table');
  }
};
