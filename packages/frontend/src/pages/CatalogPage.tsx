import { CartPanel } from '../components/CartPanel';
import { ProductCatalog } from '../components/ProductCatalog';
import { StoreOverview } from '../components/StoreOverview';

/** `/catalog`. Store overview, the product grid and the cart side by side. */
export function CatalogPage(): React.JSX.Element {
  return (
    <>
      <StoreOverview />
      <div className="content-grid">
        <ProductCatalog />
        <CartPanel />
      </div>
    </>
  );
}
