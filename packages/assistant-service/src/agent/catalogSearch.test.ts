/**
 * Unit tests for the catalog match behind `search_products` (012 T036): keywords, plurals and the filters.
 */
import { describe, expect, it } from 'vitest';
import { searchCatalog } from './catalogSearch';

const product = (name: string, price: number, description = '', category = 'Electronics') => ({ _id: name, name, price, description, category });
const CATALOG = [
  product('Mouse', 25, 'Wireless mouse with a quiet click'),
  product('Keyboard', 75, 'Mechanical keyboard, tenkeyless'),
  product('Monitor', 300, '27-inch IPS monitor'),
  product('Laptop', 1200, 'Lightweight 14-inch laptop'),
  product('Desk Lamp', 40, 'LED lamp with three brightness levels', 'Lighting'),
];
const names = (query?: string, filters: { category?: string; max_price?: number } = {}) =>
  searchCatalog(CATALOG, { query, ...filters }).map((p) => p.name);

describe('searchCatalog', () => {
  it('finds a product by a word in its name, description or category', () => {
    expect(names('keyboard')).toEqual(['Keyboard']);
    expect(names('wireless')).toEqual(['Mouse']);
    expect(names('lighting')).toEqual(['Desk Lamp']);
  });

  it('matches a plural query to a singular product, and the other way round', () => {
    expect(names('keyboards')).toEqual(['Keyboard']);
    expect(names('Do you have laptops?')).toEqual(['Laptop']);
    expect(names('monitors and lamps')).toEqual(['Monitor', 'Desk Lamp']);
    expect(names('levels')).toEqual(['Desk Lamp']);
    expect(names('level')).toEqual(['Desk Lamp']);
  });

  it('still matches part of a word, as before', () => {
    expect(names('board')).toEqual(['Keyboard']);
    expect(names('mech')).toEqual(['Keyboard']);
  });

  it('does not strip the s from short words or words ending in ss', () => {
    expect(names('glass')).toEqual([]);
    expect(names('ips')).toEqual(['Monitor']);
  });

  it('lists everything for an empty query, and nothing for an unknown word', () => {
    expect(names()).toHaveLength(CATALOG.length);
    expect(names('webcams')).toEqual([]);
  });

  it('ranks products by how many query words they match', () => {
    expect(names('quiet wireless keyboard')[0]).toBe('Mouse');
  });

  it('applies the category and maximum-price filters', () => {
    expect(names(undefined, { category: 'lighting' })).toEqual(['Desk Lamp']);
    expect(names(undefined, { max_price: 50 })).toEqual(['Mouse', 'Desk Lamp']);
    expect(names('keyboards', { max_price: 50 })).toEqual([]);
  });
});
