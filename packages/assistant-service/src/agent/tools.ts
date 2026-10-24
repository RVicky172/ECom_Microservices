/**
 * The tools the assistant's model can call. All are read-only except
 * `request_human_handoff`, which sends one support request per conversation.
 *
 * Every tool is created per request by {@link buildTools} so it can close over
 * the verified {@link RequestContext}. No tool accepts a user ID as input.
 * Results are compact JSON with only the fields the model needs.
 */
import { randomUUID } from 'crypto';
import { z } from 'zod';
import * as store from '../clients/storeClients';
import type { RequestContext } from '../context';
import type { EmitEvent, ProductCard } from './events';
import { buildHandoffTool } from './handoffTool';
import { defineTool, instrumented, ToolFailure, type AssistantTool } from './toolTypes';

/** How many product cards to show under one answer. */
const MAX_PRODUCT_CARDS = 6;

const toCard = (product: store.Product): ProductCard => ({
  id: product._id,
  name: product.name,
  price: Number(product.price),
  category: product.category,
  imageUrl: product.imageUrl,
});

const shortRef = (orderId: string): string => orderId.slice(0, 8).toUpperCase();

/** Stock as a customer-facing label; raw warehouse numbers stay internal. */
const availability = (stock: store.StockLevel | null): string => {
  if (!stock) return 'unknown';
  const available = stock.quantity - (stock.reserved ?? 0);
  if (available <= 0) return 'out_of_stock';
  if (available <= 5) return 'low_stock';
  return 'in_stock';
};

/** Lower-case words of 2+ characters, used for simple keyword matching. */
const keywords = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);

/** Creates the tool set for one request. */
export const buildTools = (ctx: RequestContext, emit: EmitEvent): AssistantTool<any>[] => [
  defineTool({
    name: 'search_products',
    description:
      'Search the store catalog. Matches keywords against product name, description and category, ' +
      'optionally filtered by category and maximum price. Call with no arguments to list everything. ' +
      'Matching products are also shown to the customer as cards.',
    inputSchema: z.object({
      query: z.string().max(200).optional().describe('Keywords, e.g. "quiet keyboard". Omit to list all products.'),
      category: z.string().max(100).optional().describe('Exact category name to filter by.'),
      max_price: z.number().positive().optional().describe('Only products at or below this price, in dollars.'),
    }),
    run: instrumented('search_products', emit, async ({ query, category, max_price }) => {
      const words = keywords(query ?? '');
      const scored = (await store.listProducts(ctx))
        .filter((p) => !category || p.category?.toLowerCase() === category.toLowerCase())
        .filter((p) => max_price === undefined || Number(p.price) <= max_price)
        .map((p) => {
          const haystack = `${p.name} ${p.description} ${p.category ?? ''}`.toLowerCase();
          return { product: p, score: words.filter((word) => haystack.includes(word)).length };
        })
        .filter(({ score }) => words.length === 0 || score > 0)
        .sort((a, b) => b.score - a.score);

      const products = scored.map(({ product }) => product);
      if (products.length > 0) {
        emit({ type: 'products', items: products.slice(0, MAX_PRODUCT_CARDS).map(toCard) });
      }
      return {
        count: products.length,
        products: products.slice(0, 20).map((p) => ({
          product_id: p._id,
          name: p.name,
          price: Number(p.price),
          category: p.category,
          description: p.description.slice(0, 300),
        })),
      };
    }),
  }),

  defineTool({
    name: 'get_product',
    description: 'Get the full details of one product by its product_id (from search_products).',
    inputSchema: z.object({ product_id: z.string().min(1).max(64) }),
    run: instrumented('get_product', emit, async ({ product_id }) => {
      const p = await store.getProduct(ctx, product_id).catch(() => null);
      if (!p) throw new ToolFailure(`No product with id ${product_id}.`);
      return { product_id: p._id, name: p.name, price: Number(p.price), category: p.category, description: p.description };
    }),
  }),

  defineTool({
    name: 'check_stock',
    description:
      'Check whether a product can be ordered right now. Returns in_stock, low_stock, out_of_stock, or unknown.',
    inputSchema: z.object({ product_id: z.string().min(1).max(64) }),
    run: instrumented('check_stock', emit, async ({ product_id }) => ({
      product_id,
      availability: availability(await store.getStock(ctx, product_id)),
    })),
  }),

  defineTool({
    name: 'get_cart',
    description: "Get the items in the customer's cart and the subtotal.",
    inputSchema: z.object({}),
    run: instrumented('get_cart', emit, async () => {
      const cart = await store.getCart(ctx);
      return {
        item_count: cart.itemCount,
        subtotal: Number(cart.total),
        items: cart.items.map((item) => ({
          product_id: item.productId,
          name: item.name,
          unit_price: Number(item.price),
          quantity: item.quantity,
        })),
      };
    }),
  }),

  defineTool({
    name: 'list_orders',
    description: "List the customer's 10 most recent orders, newest first, with status and total.",
    inputSchema: z.object({}),
    run: instrumented('list_orders', emit, async () => {
      const orders = await store.listOrders(ctx, 10);
      return {
        orders: orders.map((o) => ({
          reference: shortRef(o.id),
          order_id: o.id,
          status: o.status,
          total: Number(o.total_amount),
          placed_at: o.created_at,
        })),
      };
    }),
  }),

  defineTool({
    name: 'get_order',
    description:
      "Get one of the customer's orders with its items and payment status. Accepts the full order_id " +
      'or the 8-character reference shown to customers (e.g. "3F2A1B2C").',
    inputSchema: z.object({ order: z.string().min(4).max(64).describe('Full order ID or short reference.') }),
    run: instrumented('get_order', emit, async ({ order }) => {
      // Short references are resolved against this user's own orders only.
      let orderId = order;
      if (order.length < 36) {
        const match = (await store.listOrders(ctx, 50)).find((o) => o.id.toLowerCase().startsWith(order.toLowerCase()));
        if (!match) throw new ToolFailure(`The customer has no order with reference ${order.toUpperCase()}.`);
        orderId = match.id;
      }

      const detail = await store.getOwnOrder(ctx, orderId);
      if (!detail) throw new ToolFailure(`The customer has no order with id ${order}.`);
      const payment = await store.getPaymentForOrder(ctx, detail.id);

      return {
        reference: shortRef(detail.id),
        status: detail.status,
        total: Number(detail.total_amount),
        placed_at: detail.created_at,
        last_updated: detail.updated_at,
        items: detail.items.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.price),
        })),
        payment: payment ? { status: payment.status, amount: Number(payment.amount) } : null,
      };
    }),
  }),

  defineTool({
    name: 'propose_add_to_cart',
    description:
      'Offer to add a product to the cart. This does NOT add it: the customer sees an "Add to cart" button ' +
      'and the item is added only if they click it. Use when the customer wants to buy something.',
    inputSchema: z.object({
      product_id: z.string().min(1).max(64),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
    run: instrumented('propose_add_to_cart', emit, async ({ product_id, quantity }) => {
      const product = await store.getProduct(ctx, product_id).catch(() => null);
      if (!product) throw new ToolFailure(`No product with id ${product_id}.`);

      emit({ type: 'proposal', proposal: { id: randomUUID(), action: 'add', product: toCard(product), quantity } });
      return {
        shown_to_customer: true,
        added_to_cart: false,
        note: 'An "Add to cart" button is now visible. The item is added only if the customer clicks it.',
      };
    }),
  }),

  buildHandoffTool(ctx, emit),
];
