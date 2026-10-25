/** The order history list. */
import { useGetOrdersQuery } from '../api/storeApi';
import { cancelReasonLabel, formatCurrency, getStatusClass } from '../utils/storePresentation';

/**
 * The signed-in user's orders, newest data from `getOrders`.
 * Refetches automatically after checkout (the `Orders` tag is invalidated).
 */
export function OrdersSection(): React.JSX.Element {
  const { data: orders = [], isLoading, isError } = useGetOrdersQuery();

  return (
    <section id="orders" className="orders-section">
      <div className="section-heading">
        <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your orders</h2></div>
        <span className="section-count">{orders.length} orders</span>
      </div>
      {isLoading && <div className="empty-state"><span className="loader" />Checking order history...</div>}
      {isError && <div className="empty-state error-state">We couldn't load your orders. Refresh to try again.</div>}
      {!isLoading && !isError && orders.length === 0 && (
        <div className="empty-state">Your first order will appear here.</div>
      )}
      <div className="orders-list">
        {orders.map((order) => (
          <article className="order-row" key={order.id}>
            <div className="order-id">
              <span className="order-mark">M</span>
              <div>
                <strong>Order {order.id.split('-')[0].toUpperCase()}</strong>
                <span>
                  {order.items?.length ?? 0} items
                  {order.status === 'CANCELLED' && ` · ${cancelReasonLabel(order.cancel_reason)}`}
                </span>
              </div>
            </div>
            <span className={getStatusClass(order.status)}>{order.status}</span>
            <strong className="order-total">{formatCurrency(order.total_amount)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
