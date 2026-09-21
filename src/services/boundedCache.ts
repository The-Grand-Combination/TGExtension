/**
 * How much room a cache has. Counting entries is right when they are all
 * roughly the same size; weighing them is right when one entry can be a
 * thousand times another, which is the case for anything holding file contents.
 */
export type CacheLimit<V> =
  | { readonly entries: number }
  | { readonly weight: number; readonly weigh: (value: V) => number };

/**
 * Fixed-size cache with least-recently-used eviction. A value may legitimately
 * be `undefined` (a cached "not found"), so presence is tested with `has`.
 *
 * A weighed cache keeps at least one entry whatever it weighs: dropping the
 * value that was just stored would mean never serving it at all.
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { readonly value: V; readonly weight: number }>();
  private totalWeight = 0;

  constructor(private readonly limit: CacheLimit<V>) {}

  get size(): number {
    return this.entries.size;
  }

  /** What the entries weigh together; the entry count when the limit counts entries. */
  get weight(): number {
    return this.totalWeight;
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
    this.delete(key);
    const weight = 'weigh' in this.limit ? this.limit.weigh(value) : 1;
    this.entries.set(key, { value, weight });
    this.totalWeight += weight;
    this.evict();
  }

  delete(key: K): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.totalWeight -= entry.weight;
      this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalWeight = 0;
  }

  private evict(): void {
    const room = 'weigh' in this.limit ? this.limit.weight : this.limit.entries;
    while (this.entries.size > 1 && this.totalWeight > room) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        return;
      }
      this.delete(oldest.value);
    }
  }
}
