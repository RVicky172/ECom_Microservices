/** The catalog page's banner and headline counts. */
import { useStoreCounts } from '../hooks/useStoreCounts';

/** Left-pad a count to two digits, e.g. `7` → `"07"`. */
const pad = (count: number): string => count.toString().padStart(2, '0');

/** Seasonal banner plus three headline stats (catalog, cart and order counts). */
export function StoreOverview(): React.JSX.Element {
  const { productCount, cartCount, orderCount } = useStoreCounts();

  return (
    <>
      <section className="welcome-banner">
        <div>
          <p className="eyebrow">SPRING / SUMMER 2025</p>
          <h2>Make your setup<br /><em>feel like yours.</em></h2>
          <p className="banner-copy">Small upgrades. Noticeable difference.</p>
        </div>
        <div className="banner-stamp">M<br /><span>EST. 2025</span></div>
      </section>

      <section className="stats-row" aria-label="Store overview">
        <div className="stat">
          <span className="stat-label">IN CATALOG</span>
          <strong>{pad(productCount)}</strong>
          <span className="stat-trend">available now</span>
        </div>
        <div className="stat">
          <span className="stat-label">IN YOUR CART</span>
          <strong>{pad(cartCount)}</strong>
          <span className="stat-trend">ready to checkout</span>
        </div>
        <div className="stat">
          <span className="stat-label">ORDERS PLACED</span>
          <strong>{pad(orderCount)}</strong>
          <span className="stat-trend">all time</span>
        </div>
      </section>
    </>
  );
}
