const { db } = require('../models/inventoryModel');
const { NotFoundError, ValidationError } = require('@ecommerce/shared/src/errors');

const getStock = async (productId) => {
  const stock = await db('stock_levels').where({ product_id: productId }).first();
  if (!stock) throw new NotFoundError('Stock');
  return stock;
};

const setStock = async (productId, quantity) => {
  if (quantity < 0) throw new ValidationError('Quantity cannot be negative');

  const result = await db('stock_levels')
    .insert({ product_id: productId, quantity })
    .onConflict('product_id')
    .merge({ quantity, updated_at: db.fn.now() })
    .returning('*');

  return result[0];
};

/**
 * Atomic stock reservation (Section 3.4).
 * Ensures we don't reserve more than available.
 */
const reserveStock = async (trx, productId, quantity) => {
  const result = await trx('stock_levels')
    .where({ product_id: productId })
    .andWhere('quantity', '>=', quantity)
    .update({
      quantity: db.raw('quantity - ?', [quantity]),
      reserved: db.raw('reserved + ?', [quantity]),
      updated_at: db.fn.now(),
    });

  return result > 0;
};

const releaseStock = async (trx, productId, quantity) => {
  await trx('stock_levels')
    .where({ product_id: productId })
    .andWhere('reserved', '>=', quantity)
    .update({
      quantity: db.raw('quantity + ?', [quantity]),
      reserved: db.raw('reserved - ?', [quantity]),
      updated_at: db.fn.now(),
    });
};

const finalizeStock = async (trx, productId, quantity) => {
  await trx('stock_levels')
    .where({ product_id: productId })
    .andWhere('reserved', '>=', quantity)
    .update({
      reserved: db.raw('reserved - ?', [quantity]),
      updated_at: db.fn.now(),
    });
};

module.exports = { getStock, setStock, reserveStock, releaseStock, finalizeStock };
