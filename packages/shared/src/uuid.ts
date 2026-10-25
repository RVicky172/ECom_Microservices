/**
 * Name-based (version 5) UUIDs on Node's built-in crypto, replacing the `uuid` package (feature 005, Q4).
 * Random IDs use `crypto.randomUUID()` directly.
 */
import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RFC 4122 version-5 UUID: the SHA-1 of the namespace's 16 bytes followed by the UTF-8 name, with the version and
 * variant bits set. Gives the same output as `uuid`'s `v5(name, namespace)`, so IDs derived before the switch
 * stay the same (payment's outcome event IDs depend on it).
 *
 * @throws TypeError when `namespace` is not a UUID string.
 */
export function uuidV5(name: string, namespace: string): string {
  if (!UUID_PATTERN.test(namespace)) throw new TypeError(`Invalid UUID namespace: ${namespace}`);

  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name, 'utf8')
    .digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
