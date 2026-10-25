/** Stock rules. `quantity` is what can still be sold; `reserved` is held for orders whose payment is pending. */
import { db } from '../models/inventoryModel';
import { NotFoundError, ValidationError } from '@ecommerce/shared';

interface StockLevel {
  product_id: string;
  quantity: number;
  reserved: number;
  updated_at: Date;
}

/**
 * The stock row for a product.
 *
 * @throws NotFoundError when the product has no stock row
 */
export const getStock = async (productId: string): Promise<StockLevel> => {
  const stock = await db('stock_levels').where({ product_id: productId }).first();
  if (!stock) throw new NotFoundError('Stock');
  return stock;
};

/**
 * Sets the available quantity, creating the row if needed.
 *
 * @throws ValidationError for a negative quantity
 */
export const setStock = async (productId: string, quantity: number): Promise<StockLevel> => {
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
export const reserveStock = async (trx: any, productId: string, quantity: number): Promise<boolean> => {
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

/** Gives reserved units back to `quantity` (the payment failed). Does nothing if fewer are reserved. */
export const releaseStock = async (trx: any, productId: string, quantity: number): Promise<void> => {
  await trx('stock_levels')
    .where({ product_id: productId })
    .andWhere('reserved', '>=', quantity)
    .update({
      quantity: db.raw('quantity + ?', [quantity]),
      reserved: db.raw('reserved - ?', [quantity]),
      updated_at: db.fn.now(),
    });
};

/** Drops sold units from `reserved` (the payment succeeded). Does nothing if fewer are reserved. */
export const finalizeStock = async (trx: any, productId: string, quantity: number): Promise<void> => {
  await trx('stock_levels')
    .where({ product_id: productId })
    .andWhere('reserved', '>=', quantity)
    .update({
      reserved: db.raw('reserved - ?', [quantity]),
      updated_at: db.fn.now(),
    });
};
