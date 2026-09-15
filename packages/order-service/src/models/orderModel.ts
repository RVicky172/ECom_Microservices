import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'ecommerce',
    password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
    database: process.env.POSTGRES_DB_ORDER || 'order_db',
  },
  pool: { min: 2, max: 10 },
});

/**
 * Auto-create tables on startup (Section 9.2, Figure 4).
 * orders + order_items + outbox_events in one schema.
 */
export const runMigrations = async (): Promise<void> => {
  // Orders table
  if (!(await db.schema.hasTable('orders'))) {
    await db.schema.createTable('orders', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable();
      table.string('status').notNullable().defaultTo('PENDING');
      table.decimal('total_amount', 12, 2).notNullable();
      table.string('shipping_address').defaultTo('');
      table.integer('version').defaultTo(1); // Optimistic concurrency (Section 3.4)
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());

      // Composite index for "user's order history" — Section 9.4
      table.index(['user_id', 'created_at']);
    });
    console.log('Created orders table');
  }

  // Order items — denormalized product name/price at order time (Section 9.4)
  if (!(await db.schema.hasTable('order_items'))) {
    await db.schema.createTable('order_items', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table
        .uuid('order_id')
        .notNullable()
        .references('id')
        .inTable('orders')
        .onDelete('CASCADE');
      table.string('product_id').notNullable();
      table.string('product_name').notNullable();
      table.decimal('price', 12, 2).notNullable();
      table.integer('quantity').notNullable();
    });
    console.log('Created order_items table');
  }

  // Outbox events — Section 9.3: transactional outbox pattern
  if (!(await db.schema.hasTable('outbox_events'))) {
    await db.schema.createTable('outbox_events', (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.string('aggregate_type').notNullable();
      table.string('aggregate_id').notNullable();
      table.string('event_type').notNullable();
      table.jsonb('payload').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('published_at').nullable();

      table.index(['published_at']); // For outbox relay polling
    });
    console.log('Created outbox_events table');
  }
};
