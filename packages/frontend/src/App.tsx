import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { login } from './api/storeApi';
import { useStoreQueries } from './hooks/useStoreQueries';
import type { LoginResponse, Product } from './types/store';
import './styles.css';

const productImages: Record<string, string> = {
  laptop: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85',
  mouse: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=85',
  keyboard: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85',
  monitor: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=85',
};

const formatCurrency = (amount: number | string): string => {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) ? `$${numericAmount.toFixed(2)}` : '$0.00';
};

const getProductImage = (product: Product): string =>
  product.imageUrl || productImages[product.name.toLowerCase()] || productImages.laptop;

const getStatusClass = (status: string): string => {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes('confirm')) return 'status status-success';
  if (normalizedStatus.includes('cancel') || normalizedStatus.includes('fail')) return 'status status-danger';
  return 'status status-pending';
};

function App(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const loginMutation = useMutation<LoginResponse, Error, { email: string; password: string }>({
    mutationFn: login,
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      setToken(data.token);
    },
  });

  const { productsQuery, cartQuery, ordersQuery, addToCartMutation, checkoutMutation } = useStoreQueries(!!token);

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
        <main className="auth-screen">
          <section className="auth-showcase">
            <div className="brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
            <div className="showcase-copy">
              <p className="eyebrow">THE MODERN TECH EDIT</p>
              <h1>Good tools make room for better ideas.</h1>
              <p>Curated hardware for focused work, clear thinking, and the everyday rituals in between.</p>
            </div>
            <div className="showcase-object" aria-hidden="true">
              <div className="object-glow" />
              <div className="object-device"><span>mercato</span><strong>01</strong></div>
            </div>
            <p className="showcase-footer">Independent goods. Thoughtfully shipped.</p>
          </section>
          <section className="auth-panel">
            <div className="auth-panel-inner">
              <div className="mobile-brand brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
              <p className="eyebrow">WELCOME BACK</p>
              <h2>Sign in to your desk.</h2>
              <p className="auth-subtitle">Your saved cart and order history are waiting.</p>
              <form className="auth-form" onSubmit={handleLogin}>
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <div className="field-row"><label htmlFor="password">Password</label><button type="button" className="text-button">Forgot?</button></div>
                <input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                {loginMutation.isError && <p className="form-error">We couldn't sign you in. Check your details and try again.</p>}
                <button className="primary-button" type="submit" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? 'Signing in...' : 'Continue'}<span aria-hidden="true">→</span>
                </button>
              </form>
              <p className="auth-note">Development account: <strong>admin@example.com</strong> / <strong>admin</strong></p>
            </div>
            <span className="auth-corner">LOCAL / 001</span>
          </section>
        </main>
      );
    }

    const products = productsQuery.data ?? [];
    const cart = cartQuery.data;
    const orders = ordersQuery.data ?? [];

    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
          <div className="sidebar-label">Workspace</div>
          <nav className="side-nav" aria-label="Main navigation">
            <a className="nav-item active" href="#catalog"><span>◈</span> Catalog <small>{products.length}</small></a>
            <a className="nav-item" href="#orders"><span>↗</span> Orders <small>{orders.length}</small></a>
            <a className="nav-item" href="#cart"><span>＋</span> Cart <small>{cart?.itemCount ?? 0}</small></a>
          </nav>
          <div className="sidebar-bottom">
            <div className="support-note"><span className="support-dot" />All systems operational</div>
            <button className="logout-button" onClick={handleLogout}><span>↪</span> Sign out</button>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div><p className="breadcrumb">WORKSPACE / CATALOG</p><h1>Good afternoon, admin.</h1></div>
            <div className="topbar-actions"><span className="live-indicator"><i /> Live store</span><div className="avatar">A</div></div>
          </header>

          <section className="welcome-banner">
            <div><p className="eyebrow">SPRING / SUMMER 2025</p><h2>Make your setup<br /><em>feel like yours.</em></h2><p className="banner-copy">Small upgrades. Noticeable difference.</p></div>
            <div className="banner-stamp">M<br /><span>EST. 2025</span></div>
          </section>

          <section className="stats-row" aria-label="Store overview">
            <div className="stat"><span className="stat-label">IN CATALOG</span><strong>{products.length.toString().padStart(2, '0')}</strong><span className="stat-trend">available now</span></div>
            <div className="stat"><span className="stat-label">IN YOUR CART</span><strong>{(cart?.itemCount ?? 0).toString().padStart(2, '0')}</strong><span className="stat-trend">ready to checkout</span></div>
            <div className="stat"><span className="stat-label">ORDERS PLACED</span><strong>{orders.length.toString().padStart(2, '0')}</strong><span className="stat-trend">all time</span></div>
          </section>

          <div className="content-grid">
            <section id="catalog" className="catalog-section">
              <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Featured objects</h2></div><span className="section-count">{products.length} items <span>↘</span></span></div>
              {productsQuery.isLoading && <div className="empty-state"><span className="loader" />Loading the collection...</div>}
              {productsQuery.isError && <div className="empty-state error-state">The catalog is taking a moment. Refresh to try again.</div>}
              {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 && <div className="empty-state">No products are available yet.</div>}
              <div className="product-grid">
                {products.map((product, index) => (
                  <article className="product-card" key={product._id}>
                    <div className={`product-image image-tone-${index % 4}`}><img src={getProductImage(product)} alt="" loading="lazy" /><span className="product-index">0{index + 1}</span><span className="quick-add">NEW</span></div>
                    <div className="product-details"><div><p className="product-category">{product.category || 'ESSENTIALS'}</p><h3>{product.name}</h3></div><strong>{formatCurrency(product.price)}</strong></div>
                    <p className="product-description">{product.description}</p>
                    <button className="add-button" onClick={() => addToCartMutation.mutate(product)} disabled={addToCartMutation.isPending}><span>{addToCartMutation.isPending ? 'Adding...' : 'Add to cart'}</span><span aria-hidden="true">＋</span></button>
                  </article>
                ))}
              </div>
            </section>

            <aside id="cart" className="cart-panel">
              <div className="section-heading cart-heading"><div><p className="eyebrow">YOUR SELECTION</p><h2>Cart <span>{cart?.itemCount ?? 0}</span></h2></div><span className="cart-symbol">◌</span></div>
              {cartQuery.isLoading && <div className="cart-empty"><span className="loader" />Loading cart...</div>}
              {!cartQuery.isLoading && (cart?.items?.length ?? 0) === 0 && <div className="cart-empty"><div className="empty-cart-mark">＋</div><strong>Your cart is quiet.</strong><span>Add something considered.</span></div>}
              {cart?.items && cart.items.length > 0 && <div className="cart-items">{cart.items.map((item) => <div className="cart-item" key={item.productId}><div className="cart-item-thumb">{item.name.charAt(0)}</div><div className="cart-item-info"><strong>{item.name}</strong><span>{item.quantity} × {formatCurrency(item.price)}</span></div><strong>{formatCurrency(Number(item.price) * item.quantity)}</strong></div>)}</div>}
              <div className="cart-total"><span>Subtotal</span><strong>{formatCurrency(cart?.total ?? 0)}</strong></div>
              <button className="checkout-button" onClick={() => cart && checkoutMutation.mutate(cart.items)} disabled={!cart?.items?.length || checkoutMutation.isPending}>{checkoutMutation.isPending ? 'Processing order...' : 'Checkout'}<span>↗</span></button>
              {checkoutMutation.isError && <p className="form-error">Checkout failed. Please try again.</p>}
              {checkoutMutation.isSuccess && <p className="form-success">Order placed. Watch its status below.</p>}
            </aside>
          </div>

          <section id="orders" className="orders-section"><div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your orders</h2></div><span className="section-count">Updates every 5 sec <span>◷</span></span></div>
            {ordersQuery.isLoading && <div className="empty-state"><span className="loader" />Checking order history...</div>}
            {!ordersQuery.isLoading && orders.length === 0 && <div className="empty-state">Your first order will appear here.</div>}
            <div className="orders-list">{orders.map((order) => <article className="order-row" key={order.id}><div className="order-id"><span className="order-mark">M</span><div><strong>Order {order.id.split('-')[0].toUpperCase()}</strong><span>{order.items?.length ?? 0} items</span></div></div><span className={getStatusClass(order.status)}>{order.status}</span><strong className="order-total">{formatCurrency(order.total_amount)}</strong></article>)}</div>
          </section>
          <footer className="app-footer"><span>mercato / A considered commerce platform</span><span>© 2025</span></footer>
        </main>
      </div>
    );
  }

export default App;
