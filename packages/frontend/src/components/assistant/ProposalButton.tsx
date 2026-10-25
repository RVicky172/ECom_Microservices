/** The "Add to cart" button for an assistant suggestion. */
import { useState } from 'react';
import { useAddCartItemMutation } from '../../api/storeApi';
import type { CartProposal } from '../../types/assistant';
import { formatCurrency } from '../../utils/storePresentation';

interface ProposalButtonProps {
  proposal: CartProposal;
}

/**
 * The confirm step for an assistant cart suggestion.
 *
 * The assistant can only suggest; this button is what actually adds the item,
 * through the same `addCartItem` mutation as the catalog, so the cart panel and
 * sidebar counts refresh automatically.
 */
export function ProposalButton({ proposal }: ProposalButtonProps): React.JSX.Element {
  const [addToCart, { isLoading, isError }] = useAddCartItemMutation();
  const [added, setAdded] = useState(false);
  const { product, quantity } = proposal;

  const confirm = async (): Promise<void> => {
    try {
      await addToCart({
        product: { _id: product.id, name: product.name, price: product.price },
        quantity,
      }).unwrap();
      setAdded(true);
    } catch {
      // `isError` shows the message below.
    }
  };

  return (
    <div className="assistant-proposal">
      <span>
        {quantity > 1 ? `${quantity} × ` : ''}
        <strong>{product.name}</strong> · {formatCurrency(product.price * quantity)}
      </span>
      <button type="button" onClick={() => void confirm()} disabled={isLoading || added}>
        {added ? 'Added ✓' : isLoading ? 'Adding…' : 'Add to cart'}
      </button>
      {isError && <small className="form-error">Couldn't add it. Try again.</small>}
    </div>
  );
}
