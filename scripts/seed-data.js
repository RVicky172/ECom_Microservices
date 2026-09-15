const knex = require('knex');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin';

const seedData = async () => {
  console.log('Seeding data...');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/product_db';
  await mongoose.connect(mongoUri);

  const productSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    category: String,
    imageUrl: String,
    stockHint: Number,
    isActive: Boolean,
  }, { timestamps: true });
  
  const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

  await Product.deleteMany({});
  const products = await Product.insertMany([
    { name: 'Laptop', description: 'High performance laptop', price: 1200, category: 'Electronics', stockHint: 10, isActive: true },
    { name: 'Mouse', description: 'Wireless mouse', price: 25, category: 'Electronics', stockHint: 50, isActive: true },
    { name: 'Keyboard', description: 'Mechanical keyboard', price: 75, category: 'Electronics', stockHint: 30, isActive: true },
    { name: 'Monitor', description: '4K monitor', price: 300, category: 'Electronics', stockHint: 15, isActive: true },
  ]);

  console.log('Products seeded in MongoDB');

  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: process.env.POSTGRES_USER || 'ecommerce',
      password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
      database: process.env.POSTGRES_DB_INVENTORY || 'inventory_db',
    },
  });

  await db('stock_levels').del();

  for (const product of products) {
    await db('stock_levels').insert({
      product_id: product._id.toString(),
      quantity: product.stockHint,
      reserved: 0,
    });
  }

  console.log('Inventory seeded in Postgres');

  const authDb = knex({
    client: 'pg',
    connection: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: process.env.POSTGRES_USER || 'ecommerce',
      password: process.env.POSTGRES_PASSWORD || 'ecommerce_pass',
      database: process.env.POSTGRES_DB_AUTH || 'auth_db',
    },
  });

  const existingAdmin = await authDb('users').where({ email: ADMIN_EMAIL }).first();
  if (!existingAdmin) {
    await authDb('users').insert({
      email: ADMIN_EMAIL,
      password_hash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      name: 'Administrator',
      role: 'admin',
    });
    console.log(`Admin user created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`Admin user already exists: ${ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
  await db.destroy();
  await authDb.destroy();
  console.log('Seeding complete');
};

seedData().catch(err => {
  console.error('Seeding failed', err);
  process.exit(1);
});
