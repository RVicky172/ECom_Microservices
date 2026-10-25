import { describe, expect, it } from 'vitest';
import { uuidV5 } from './uuid';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const PAYMENT_OUTCOME_NAMESPACE = '6f1c2d9e-5b4a-4c3e-9f8d-7a6b5c4d3e2f';

describe('uuidV5', () => {
  it('matches the RFC 4122 example', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  // Recorded from uuid@9 `v5` before it was removed (005 T006): payment's outcome event IDs must not change,
  // or a replayed event would no longer be recognised as a duplicate.
  it('gives the same IDs as uuid@9 for payment outcome events', () => {
    expect(uuidV5('3f1c2b9e-8d4a-4f6b-9c1e-2a7d5e8f0b13', PAYMENT_OUTCOME_NAMESPACE)).toBe(
      '22fa61a6-6aaf-5396-ab31-f656006e6f5e',
    );
    expect(uuidV5('a9e0c4d2-1b3f-4e5a-8c7d-6f2e1a0b9c84', PAYMENT_OUTCOME_NAMESPACE)).toBe(
      '6acc8a93-6e00-5f82-95b9-64f4def6cf80',
    );
    expect(uuidV5('0e7d6c5b-4a39-4281-b7c6-d5e4f3a2b1c0', PAYMENT_OUTCOME_NAMESPACE)).toBe(
      'f904dd82-2542-55d6-ab2e-684732567150',
    );
  });

  it('sets version 5 and the RFC 4122 variant', () => {
    const id = uuidV5('any name', PAYMENT_OUTCOME_NAMESPACE);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is deterministic and depends on both inputs', () => {
    expect(uuidV5('a', PAYMENT_OUTCOME_NAMESPACE)).toBe(uuidV5('a', PAYMENT_OUTCOME_NAMESPACE));
    expect(uuidV5('a', PAYMENT_OUTCOME_NAMESPACE)).not.toBe(uuidV5('b', PAYMENT_OUTCOME_NAMESPACE));
    expect(uuidV5('a', PAYMENT_OUTCOME_NAMESPACE)).not.toBe(uuidV5('a', DNS_NAMESPACE));
  });

  it('accepts an upper-case namespace', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE.toUpperCase())).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('rejects a namespace that is not a UUID', () => {
    expect(() => uuidV5('a', 'not-a-uuid')).toThrow(TypeError);
    expect(() => uuidV5('a', '6f1c2d9e5b4a4c3e9f8d7a6b5c4d3e2f')).toThrow(TypeError);
  });
});
