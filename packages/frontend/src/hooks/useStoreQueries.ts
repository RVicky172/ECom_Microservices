import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addCartItem, checkout, getCart, getOrders, getProducts } from '../api/storeApi';
import type { CartItem, Product } from '../types/store';

const queryOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
};

export const useStoreQueries = (isAuthenticated: boolean) => {
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
    ...queryOptions,
  });

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: getCart,
    enabled: isAuthenticated,
    ...queryOptions,
  });

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: getOrders,
    enabled: isAuthenticated,
    ...queryOptions,
  });

  const addToCartMutation = useMutation({
    mutationFn: (product: Product) => addCartItem(product),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const checkoutMutation = useMutation({
    mutationFn: (items: CartItem[]) => checkout(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return { productsQuery, cartQuery, ordersQuery, addToCartMutation, checkoutMutation };
};
