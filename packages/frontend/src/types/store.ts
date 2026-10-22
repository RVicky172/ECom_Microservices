export type NumericValue = number | string;

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: NumericValue;
  category?: string;
  imageUrl?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: NumericValue;
  quantity: number;
}

export interface CartResponse {
  items: CartItem[];
  itemCount: number;
  total: NumericValue;
}

export interface Order {
  id: string;
  status: string;
  total_amount: NumericValue;
  items?: Array<CartItem & { product_name?: string }>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
