/**
 * RTK Query API definition: every backend call the UI makes, with its cache rules.
 *
 * Components never call Axios directly. They use the generated hooks
 * (`useGetCartQuery`, `useCheckoutMutation`, ...) and RTK Query takes care of
 * deduplicating requests, caching and refetching:
 *
 *   component ──hook──► storeApi cache ──axiosBaseQuery──► api/authApi ──► gateway
 *
 * Cache tags: queries `provide` a tag and mutations `invalidate` it, which
 * makes every component showing that data refetch automatically
 * (e.g. adding to cart invalidates `Cart`, so the sidebar count and cart panel update).
 */
import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { api, authApi } from './client';
import type { AuthUser, CartItem, CartResponse, LoginResponse, Order, Product } from '../types/store';

/** Arguments for `addCartItem`: the product's id, name and price, plus a quantity. */
export interface AddCartItemArgs {
  product: Pick<Product, '_id' | 'name' | 'price'>;
  /** Defaults to 1. */
  quantity?: number;
}

/** Request description passed from an endpoint's `query` to {@link axiosBaseQuery}. */
interface AxiosBaseQueryArgs {
  url: string;
  method?: Method;
  data?: unknown;
  /** Send through `authApi` (no bearer token / refresh retry) instead of `api`. */
  useAuthApi?: boolean;
}

/** Error shape returned to hooks as `error`. `status` is the HTTP status or a string code. */
interface AxiosBaseQueryError {
  status: number | string;
  data: unknown;
}

/** Adapts our Axios clients to RTK Query's base query contract. Never throws. */
const axiosBaseQuery: BaseQueryFn<AxiosBaseQueryArgs, unknown, AxiosBaseQueryError> = async (
  { url, method = 'GET', data, useAuthApi },
  { signal },
) => {
  try {
    const client = useAuthApi ? authApi : api;
    const config: AxiosRequestConfig = { url, method, data, signal };
    const response = await client.request(config);
    return { data: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        error: {
          status: error.response?.status ?? 'FETCH_ERROR',
          data: error.response?.data ?? error.message,
        },
      };
    }

    return { error: { status: 'CUSTOM_ERROR', data: String(error) } };
  }
};

/** The RTK Query API: its endpoints generate the `use…Query` / `use…Mutation` hooks the components use. */
export const storeApi = createApi({
  reducerPath: 'storeApi',
  baseQuery: axiosBaseQuery,
  tagTypes: ['Profile', 'Products', 'Cart', 'Orders'],
  keepUnusedDataFor: 60,
  endpoints: (builder) => ({
    /** POST credentials; the auth service also sets the refresh cookie. */
    login: builder.mutation<LoginResponse, { email: string; password: string }>({
      query: (credentials) => ({
        url: '/api/v1/auth/login',
        method: 'POST',
        data: credentials,
        useAuthApi: true,
      }),
    }),
    /** Revoke the refresh session and clear its cookie. */
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/api/v1/auth/logout', method: 'POST', useAuthApi: true }),
    }),
    /** Exchange the refresh cookie for a new access token (`null` when there is no session). */
    refreshSession: builder.mutation<{ accessToken: string | null }, void>({
      query: () => ({ url: '/api/v1/auth/refresh', method: 'POST', useAuthApi: true }),
    }),
    /** The signed-in user. Also seeded directly by `useSignIn` after login. */
    getProfile: builder.query<AuthUser, void>({
      query: () => ({ url: '/api/v1/auth/profile' }),
      providesTags: ['Profile'],
    }),
    /** Public product catalog. */
    getProducts: builder.query<Product[], void>({
      query: () => ({ url: '/api/v1/products' }),
      transformResponse: (response: { products: Product[] }) => response.products,
      providesTags: ['Products'],
    }),
    /** The signed-in user's cart. */
    getCart: builder.query<CartResponse, void>({
      query: () => ({ url: '/api/v1/cart' }),
      providesTags: ['Cart'],
    }),
    /** The signed-in user's orders. */
    getOrders: builder.query<Order[], void>({
      query: () => ({ url: '/api/v1/orders' }),
      transformResponse: (response: { orders: Order[] }) => response.orders,
      providesTags: ['Orders'],
    }),
    /** Add a product to the cart (one unit unless `quantity` is given). */
    addCartItem: builder.mutation<void, AddCartItemArgs>({
      query: ({ product, quantity = 1 }) => ({
        url: '/api/v1/cart/items',
        method: 'POST',
        data: {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity,
        },
      }),
      invalidatesTags: ['Cart'],
    }),
    /**
     * Place an order for the given items, then empty the cart.
     * Fails (without clearing the cart) if the order cannot be created.
     */
    checkout: builder.mutation<void, CartItem[]>({
      async queryFn(items, _api, _extraOptions, baseQuery) {
        const orderResult = await baseQuery({
          url: '/api/v1/orders',
          method: 'POST',
          data: { items },
        });
        if ('error' in orderResult) {
          return { error: orderResult.error };
        }

        const clearCartResult = await baseQuery({
          url: '/api/v1/cart',
          method: 'DELETE',
        });
        if ('error' in clearCartResult) {
          return { error: clearCartResult.error };
        }

        return { data: undefined };
      },
      invalidatesTags: ['Cart', 'Orders'],
    }),
  }),
});

/** Generated hooks; see each endpoint above for its behaviour. */
export const {
  useLoginMutation,
  useLogoutMutation,
  useRefreshSessionMutation,
  useGetProfileQuery,
  useGetProductsQuery,
  useGetCartQuery,
  useGetOrdersQuery,
  useAddCartItemMutation,
  useCheckoutMutation,
} = storeApi;
