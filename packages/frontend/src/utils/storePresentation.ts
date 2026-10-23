import type { Product } from '../types/store';

/** Fallback photos for seeded products that have no `imageUrl`, keyed by lowercase name. */
const productImages: Record<string, string> = {
  laptop: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85',
  mouse: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=85',
  keyboard: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85',
  monitor: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=85',
};

/** Format a price (number or numeric string from the API) as USD, e.g. `$12.50`. */
export const formatCurrency = (amount: number | string): string => {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) ? `$${numericAmount.toFixed(2)}` : '$0.00';
};

/** Image URL for a product: its own `imageUrl`, a known fallback, or a generic photo. */
export const getProductImage = (product: Product): string =>
  product.imageUrl || productImages[product.name.toLowerCase()] || productImages.laptop;

/** CSS classes for an order status badge (success / danger / pending colours). */
export const getStatusClass = (status: string): string => {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes('confirm')) return 'status status-success';
  if (normalizedStatus.includes('cancel') || normalizedStatus.includes('fail')) return 'status status-danger';
  return 'status status-pending';
};

/** Shopper-facing text for why an order was cancelled (order-service `cancel_reason`). */
export const cancelReasonLabel = (reason: string | null | undefined): string => {
  if (reason === 'OUT_OF_STOCK') return 'Out of stock';
  if (reason === 'PAYMENT_DECLINED') return 'Payment declined';
  return 'Cancelled';
};

/** Time-of-day greeting for the header, e.g. "Good morning". */
export const getGreeting = (date: Date = new Date()): string => {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};
