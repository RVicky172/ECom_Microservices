import { Link } from 'react-router-dom';
import { useCheckoutMutation, useGetCartQuery } from '../api/storeApi';
import { paths } from '../routes/paths';
import { formatCurrency } from '../utils/storePresentation';

/**
 * The cart with subtotal and checkout.
 *
 * Data: reads the cart from `getCart`; "Checkout" calls `checkout`, which
 * places the order, empties the cart and invalidates `Cart` and `Orders`.
 */
export function CartPanel(): React.JSX.Element {
  const { data: cart, isLoading } = useGetCartQuery();
  const [checkout, checkoutState] = useCheckoutMutation();
  const items = cart?.items ?? [];

  return (
    <aside id="cart" className="cart-panel">
      <div className="section-heading cart-heading">
        <div><p className="eyebrow">YOUR SELECTION</p><h2>Cart <span>{cart?.itemCount ?? 0}</span></h2></div>
        <span className="cart-symbol">◌</span>
      </div>
      {isLoading && <div className="cart-empty"><span className="loader" />Loading cart...</div>}
      {!isLoading && items.length === 0 && (
        <div className="cart-empty">
          <div className="empty-cart-mark">＋</div>
          <strong>Your cart is quiet.</strong>
          <span>Add something considered.</span>
        </div>
      )}
      {items.length > 0 && (
        <div className="cart-items">
          {items.map((item) => (
            <div className="cart-item" key={item.productId}>
              <div className="cart-item-thumb">{item.name.charAt(0)}</div>
              <div className="cart-item-info">
                <strong>{item.name}</strong>
                <span>{item.quantity} × {formatCurrency(item.price)}</span>
              </div>
              <strong>{formatCurrency(Number(item.price) * item.quantity)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="cart-total"><span>Subtotal</span><strong>{formatCurrency(cart?.total ?? 0)}</strong></div>
      <button
        className="checkout-button"
        onClick={() => void checkout(items)}
        disabled={items.length === 0 || checkoutState.isLoading}
      >
        {checkoutState.isLoading ? 'Processing order...' : 'Checkout'}<span>↗</span>
      </button>
      {checkoutState.isError && <p className="form-error">Checkout failed. Please try again.</p>}
      {checkoutState.isSuccess && (
        <p className="form-success">Order placed. <Link to={paths.orders}>Track its status</Link>.</p>
      )}
    </aside>
  );
}
