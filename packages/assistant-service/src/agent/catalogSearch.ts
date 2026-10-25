/**
 * The catalog match behind `search_products`: keyword scoring with plural-insensitive words, plus the category and
 * price filters. Pure, so it is tested without the product service (012 T036).
 */

/** The product fields the search reads. */
export interface Searchable {
  name: string;
  description: string;
  category?: string;
  price: number | string;
}

/** What the model may filter by. */
export interface CatalogQuery {
  query?: string;
  category?: string;
  max_price?: number;
}

/**
 * Drops a plural "s" so "keyboards" and "keyboard" compare equal. Short words and words ending in "ss" ("ips",
 * "glass") keep theirs.
 */
const stem = (word: string): string => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1)
    .map(stem);

/**
 * The products matching the query, best match first: each query word found in the name, description or category
 * (as before 012 T036, anywhere in the text, now with plurals stemmed on both sides) scores 1. No query lists every
 * product that passes the filters.
 */
export function searchCatalog<T extends Searchable>(products: T[], { query, category, max_price }: CatalogQuery): T[] {
  const queryWords = words(query ?? '');
  return products
    .filter((product) => !category || product.category?.toLowerCase() === category.toLowerCase())
    .filter((product) => max_price === undefined || Number(product.price) <= max_price)
    .map((product) => {
      const text = words(`${product.name} ${product.description} ${product.category ?? ''}`).join(' ');
      const score = queryWords.filter((word) => text.includes(word)).length;
      return { product, score };
    })
    .filter(({ score }) => queryWords.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}
