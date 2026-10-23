/**
 * Shapes of the data returned by the API gateway.
 */

/** Money values may arrive as numbers or as numeric strings (Postgres DECIMAL). */
export type NumericValue = number | string;

/** A catalog product (product-service, MongoDB). */
export interface Product {
  _id: string;
  name: string;
  description: string;
  price: NumericValue;
  category?: string;
  imageUrl?: string;
}

/** One line in the cart (cart-service, Redis). */
export interface CartItem {
  productId: string;
  name: string;
  price: NumericValue;
  quantity: number;
}

/** The whole cart with server-computed totals. */
export interface CartResponse {
  items: CartItem[];
  itemCount: number;
  total: NumericValue;
}

/** An order and its items (order-service, Postgres). */
export interface Order {
  id: string;
  status: string;
  total_amount: NumericValue;
  items?: Array<CartItem & { product_name?: string }>;
}

/** The signed-in user's public profile. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Body returned by `POST /api/v1/auth/login`. */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
