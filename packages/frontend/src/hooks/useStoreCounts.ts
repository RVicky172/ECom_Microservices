import { useGetCartQuery, useGetOrdersQuery, useGetProductsQuery } from '../api/storeApi';

/**
 * Item counts for the sidebar badges and overview stats.
 *
 * Reuses the same cached queries as the catalog, cart and orders sections, so
 * it adds no extra requests. `selectFromResult` narrows each subscription to a
 * single number, so callers re-render only when a count actually changes.
 */
export const useStoreCounts = (): { productCount: number; cartCount: number; orderCount: number } => {
  const { productCount } = useGetProductsQuery(undefined, {
    selectFromResult: ({ data }) => ({ productCount: data?.length ?? 0 }),
  });
  const { cartCount } = useGetCartQuery(undefined, {
    selectFromResult: ({ data }) => ({ cartCount: data?.itemCount ?? 0 }),
  });
  const { orderCount } = useGetOrdersQuery(undefined, {
    selectFromResult: ({ data }) => ({ orderCount: data?.length ?? 0 }),
  });

  return { productCount, cartCount, orderCount };
};
