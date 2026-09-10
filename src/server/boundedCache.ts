/**
 * Fixed-size cache with least-recently-used eviction. A value may legitimately
 * be `undefined` (a cached "not found"), so presence is tested with `has`.
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { readonly value: V }>();

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.entries.size;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    // Re-insert so insertion order tracks recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value });
    const oldest = this.entries.keys().next();
    if (this.entries.size > this.limit && !oldest.done) {
      this.entries.delete(oldest.value);
    }
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
