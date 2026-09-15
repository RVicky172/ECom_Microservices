import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      const { data } = await axios.post(`${API_URL}/api/v1/auth/login`, credentials);
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      setToken(data.token);
    },
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/products');
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

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/orders');
      return data.orders;
    },
    enabled: !!token,
    refetchInterval: 5000, // Poll for status updates
  });

  const addToCartMutation = useMutation({
    mutationFn: async (product) => {
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
    mutationFn: async (cartItems) => {
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

  const handleLogin = (e) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const handleLogout = () => {
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
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
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
        <button onClick={handleLogout} style={{ background: '#4b5563' }}>Logout</button>
      </nav>

      <div className="container" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <div>
          <h2>Products</h2>
          {productsQuery.isLoading ? <p>Loading...</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {productsQuery.data?.map(product => (
                <div key={product._id} className="card">
                  <h3>{product.name}</h3>
                  <p>${product.price}</p>
                  <p><small>{product.description}</small></p>
                  <button onClick={() => addToCartMutation.mutate(product)}>Add to Cart</button>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: '2rem' }}>My Orders</h2>
          {ordersQuery.isLoading ? <p>Loading...</p> : (
            <div>
              {ordersQuery.data?.map(order => (
                <div key={order.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Order: {order.id.split('-')[0]}</strong>
                    <span style={{ 
                      padding: '0.2rem 0.5rem', 
                      background: order.status === 'CONFIRMED' ? '#10b981' : order.status === 'CANCELLED' ? '#ef4444' : '#f59e0b',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}>
                      {order.status}
                    </span>
                  </div>
                  <p>Total: ${order.total_amount}</p>
                  <ul>
                    {order.items?.map(item => (
                      <li key={item.id}>{item.product_name} (x{item.quantity})</li>
                    ))}
                  </ul>
                </div>
              ))}
              {ordersQuery.data?.length === 0 && <p>No orders yet</p>}
            </div>
          )}
        </div>

        <div>
          <h2>Shopping Cart</h2>
          <div className="card">
            {cartQuery.isLoading ? <p>Loading...</p> : (
              <div>
                {cartQuery.data?.items?.map(item => (
                  <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>{item.name} (x{item.quantity})</span>
                    <span>${item.price * item.quantity}</span>
                  </div>
                ))}
                {(!cartQuery.data?.items || cartQuery.data?.items.length === 0) && <p>Cart is empty</p>}
                
                <hr style={{ margin: '1rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Total:</span>
                  <span>${cartQuery.data?.total || 0}</span>
                </div>

                <button 
                  onClick={() => checkoutMutation.mutate(cartQuery.data.items)}
                  disabled={!cartQuery.data?.items?.length || checkoutMutation.isPending}
                  style={{ width: '100%', marginTop: '1rem', background: '#10b981' }}
                >
                  {checkoutMutation.isPending ? 'Processing...' : 'Checkout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
