import { api, authApi } from './client';
import type { CartItem, CartResponse, LoginResponse, Order, Product } from '../types/store';

export const login = async (credentials: { email: string; password: string }): Promise<LoginResponse> => {
  const { data } = await authApi.post<LoginResponse>('/api/v1/auth/login', credentials);
  return data;
};

export const getProducts = async (): Promise<Product[]> => {
  const { data } = await api.get<{ products: Product[] }>('/api/v1/products');
  return data.products;
};

export const getCart = async (): Promise<CartResponse> => {
  const { data } = await api.get<CartResponse>('/api/v1/cart');
  return data;
};

export const getOrders = async (): Promise<Order[]> => {
  const { data } = await api.get<{ orders: Order[] }>('/api/v1/orders');
  return data.orders;
};

export const addCartItem = async (product: Product): Promise<void> => {
  await api.post('/api/v1/cart/items', {
    productId: product._id,
    name: product.name,
    price: product.price,
    quantity: 1,
  });
};

export const checkout = async (items: CartItem[]): Promise<void> => {
  await api.post('/api/v1/orders', { items });
  await api.delete('/api/v1/cart');
};
