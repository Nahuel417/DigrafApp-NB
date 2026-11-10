export class MetricsRequestInvalidatedError extends Error {}

export class MetricsRequestCache<T> {
  private readonly entries = new Map<string, { epoch: number; promise: Promise<T> | null; value?: T }>();
  private epoch = 0;
  private scope: string | null = null;
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  get size() {
    return this.entries.size;
  }

  peek(key: string): T | undefined {
    const entry = this.entries.get(key);
    return entry?.promise === null ? entry.value : undefined;
  }

  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.clear();
  }

  clear() {
    this.epoch += 1;
    this.entries.clear();
  }

  get(key: string, load: () => Promise<T>, options: { refresh?: boolean } = {}): Promise<T> {
    if (!this.scope) return Promise.reject(new MetricsRequestInvalidatedError("The authenticated metrics session is unavailable."));

    const existing = this.entries.get(key);
    if (existing && !options.refresh) {
      this.touch(key, existing);
      return existing.promise ?? Promise.resolve(existing.value as T);
    }
    if (existing) this.entries.delete(key);

    const entry = { epoch: this.epoch, promise: null as Promise<T> | null, value: undefined as T | undefined };
    const promise = Promise.resolve().then(load).then((value) => {
      if (entry.epoch !== this.epoch || this.entries.get(key) !== entry) throw new MetricsRequestInvalidatedError("The metrics response belongs to an outdated session or request.");
      entry.promise = null;
      entry.value = value;
      this.touch(key, entry);
      this.evictOldest();
      return value;
    }, (error: unknown) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    entry.promise = promise;
    this.entries.set(key, entry);
    this.evictOldest();
    return promise;
  }

  private touch(key: string, entry: { epoch: number; promise: Promise<T> | null; value?: T }) {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evictOldest() {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
