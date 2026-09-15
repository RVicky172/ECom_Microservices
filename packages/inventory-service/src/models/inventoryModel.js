const knex = require('knex');

const db = knex({
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

const runMigrations = async () => {
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

module.exports = { db, runMigrations };
