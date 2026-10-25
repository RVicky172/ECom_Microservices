/** The `/cart` page. */
import { CartPanel } from '../components/CartPanel';

/** `/cart`. The cart and checkout on their own. */
export function CartPage(): React.JSX.Element {
  return (
    <div className="page-narrow">
      <CartPanel />
    </div>
  );
}
