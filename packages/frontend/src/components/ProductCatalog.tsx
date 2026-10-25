/** The product grid with add-to-cart. */
import { useAddCartItemMutation, useGetProductsQuery } from '../api/storeApi';
import type { Product } from '../types/store';
import { formatCurrency, getProductImage } from '../utils/storePresentation';

/**
 * The product grid.
 *
 * Data: reads products from `getProducts`; "Add to cart" calls `addCartItem`,
 * which invalidates the `Cart` tag so the cart panel and counts refresh.
 */
export function ProductCatalog(): React.JSX.Element {
  const { data: products = [], isLoading, isError } = useGetProductsQuery();
  const [addToCart, addState] = useAddCartItemMutation();
  // Only the product currently being added shows a busy button.
  const addingProductId = addState.isLoading ? addState.originalArgs?.product._id : undefined;

  return (
    <section id="catalog" className="catalog-section">
      <div className="section-heading">
        <div><p className="eyebrow">THE COLLECTION</p><h2>Featured objects</h2></div>
        <span className="section-count">{products.length} items <span>↘</span></span>
      </div>
      {isLoading && <div className="empty-state"><span className="loader" />Loading the collection...</div>}
      {isError && <div className="empty-state error-state">The catalog is taking a moment. Refresh to try again.</div>}
      {!isLoading && !isError && products.length === 0 && (
        <div className="empty-state">No products are available yet.</div>
      )}
      <div className="product-grid">
        {products.map((product, index) => (
          <ProductCard
            key={product._id}
            product={product}
            index={index}
            isAdding={addingProductId === product._id}
            onAdd={() => void addToCart({ product })}
          />
        ))}
      </div>
    </section>
  );
}

interface ProductCardProps {
  product: Product;
  /** Position in the grid; drives the image tint and the "01" label. */
  index: number;
  /** True while this product's add-to-cart request is in flight. */
  isAdding: boolean;
  onAdd: () => void;
}

/** A single product tile. Purely presentational. */
function ProductCard({ product, index, isAdding, onAdd }: ProductCardProps): React.JSX.Element {
  return (
    <article className="product-card">
      <div className={`product-image image-tone-${index % 4}`}>
        <img src={getProductImage(product)} alt="" loading="lazy" />
        <span className="product-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="quick-add">NEW</span>
      </div>
      <div className="product-details">
        <div>
          <p className="product-category">{product.category || 'ESSENTIALS'}</p>
          <h3>{product.name}</h3>
        </div>
        <strong>{formatCurrency(product.price)}</strong>
      </div>
      <p className="product-description">{product.description}</p>
      <button className="add-button" onClick={onAdd} disabled={isAdding}>
        <span>{isAdding ? 'Adding...' : 'Add to cart'}</span>
        <span aria-hidden="true">＋</span>
      </button>
    </article>
  );
}
