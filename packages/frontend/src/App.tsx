import React, { useState } from 'react';
import axios, { AxiosInstance } from 'axios';
import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  status: string;
  total_amount: number;
  items: CartItem[];
}

interface LoginResponse {
  token: string;
  user: any;
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App(): JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const loginMutation: UseMutationResult<LoginResponse, Error, { email: string; password: string }> = useMutation({
    mutationFn: async (credentials) => {
      const { data } = await axios.post<LoginResponse>(`${API_URL}/api/v1/auth/login`, credentials);
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      setToken(data.token);
    },
  });

  const productsQuery: UseQueryResult<Product[]> = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<{ products: Product[] }>('/api/v1/products');
      return data.products;
    },
  });

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/cart');
      return data;
    },
    enabled: !!token,
  });

  const ordersQuery: UseQueryResult<Order[]> = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get<{ orders: Order[] }>('/api/v1/orders');
      return data.orders;
    },
    enabled: !!token,
    refetchInterval: 5000, // Poll for status updates
  });

  const addToCartMutation = useMutation({
    mutationFn: async (product: Product) => {
      await api.post('/api/v1/cart/items', {
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: 1,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (cartItems: CartItem[]) => {
      await api.post('/api/v1/orders', {
        items: cartItems,
      });
      await api.delete('/api/v1/cart');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const handleLogin = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const handleLogout = (): void => {
    localStorage.removeItem('token');
    setToken(null);
    queryClient.clear();
  };

  if (!token) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
          <h2>Login</h2>
          <p>Hint: Use seed data or register via API</p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Logging in...' : 'Login'}
            </button>
            {loginMutation.isError && <p style={{ color: 'red' }}>Login failed</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <nav>
        <span>E-Commerce Platform</span>
        <div style={{ flex: 1 }}></div>
        <button onClick={handleLogout} style={{ background: '#4b5563' }}>
          Logout
        </button>
      </nav>

      <div className="container" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <div>
          <h2>Products</h2>
          {productsQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {productsQuery.data?.map((product) => (
                <div key={product._id} className="card">
                  <h3>{product.name}</h3>
                  <p>${product.price}</p>
                  <p>
                    <small>{product.description}</small>
                  </p>
                  <button onClick={() => addToCartMutation.mutate(product)}>Add to Cart</button>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: '2rem' }}>My Orders</h2>
          {ordersQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <div>
              {ordersQuery.data?.map((order) => (
                <div key={order.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Order: {order.id.split('-')[0]}</strong>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: '#fff',
                        background:
                          order.status === 'CONFIRMED'
                            ? '#4caf50'
                            : order.status === 'CANCELLED'
                            ? '#f44336'
                            : '#ff9800',
                      }}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p>Total: ${order.total_amount}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2>Cart</h2>
          {cartQuery.data ? (
            <div className="card">
              <p>Items: {cartQuery.data.itemCount}</p>
              <p>Total: ${cartQuery.data.total}</p>
              <button
                onClick={() => checkoutMutation.mutate(cartQuery.data.items)}
                disabled={cartQuery.data.itemCount === 0 || checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? 'Checking out...' : 'Checkout'}
              </button>
            </div>
          ) : (
            <p>Loading cart...</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
