import { describe, expect, it, vi } from "vitest";

import { MetricsRequestCache, MetricsRequestInvalidatedError } from "./request-cache";

describe("MetricsRequestCache", () => {
  it("coalesces identical in-flight requests and reuses their result until refreshed", async () => {
    const cache = new MetricsRequestCache<string>(2);
    cache.setScope("account-a:session-1");
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((done) => { resolve = done; }));

    const first = cache.get("same-filters", load);
    const second = cache.get("same-filters", load);
    await Promise.resolve();
    resolve("cached");
    await expect(Promise.all([first, second])).resolves.toEqual(["cached", "cached"]);
    await expect(cache.get("same-filters", load)).resolves.toBe("cached");
    expect(cache.peek("same-filters")).toBe("cached");
    expect(load).toHaveBeenCalledOnce();

    await expect(cache.get("same-filters", async () => "updated", { refresh: true })).resolves.toBe("updated");
  });

  it("rejects late responses after the authenticated session is invalidated", async () => {
    const cache = new MetricsRequestCache<string>(2);
    cache.setScope("account-a:session-1");
    let resolve!: (value: string) => void;
    const pending = cache.get("filters", () => new Promise<string>((done) => { resolve = done; }));

    await Promise.resolve();
    cache.setScope(null);
    expect(cache.peek("filters")).toBeUndefined();
    resolve("private response");
    await expect(pending).rejects.toBeInstanceOf(MetricsRequestInvalidatedError);
  });

  it("does not share entries across accounts or sign-in sessions", async () => {
    const cache = new MetricsRequestCache<string>(2);
    const loadA = vi.fn(async () => "account a");
    const loadB = vi.fn(async () => "account b");
    cache.setScope("account-a:session-1");
    await cache.get("filters", loadA);
    cache.setScope("account-b:session-2");
    await expect(cache.get("filters", loadB)).resolves.toBe("account b");
    cache.setScope("account-a:session-3");
    await expect(cache.get("filters", loadA)).resolves.toBe("account a");
    expect(loadA).toHaveBeenCalledTimes(2);
  });

  it("bounds retained filter entries with least-recently-used eviction", async () => {
    const cache = new MetricsRequestCache<string>(2);
    cache.setScope("account-a:session-1");
    const load = (value: string) => async () => value;
    await cache.get("a", load("a"));
    await cache.get("b", load("b"));
    await cache.get("a", load("not used"));
    await cache.get("c", load("c"));
    await expect(cache.get("b", load("b reloaded"))).resolves.toBe("b reloaded");
    expect(cache.size).toBe(2);
  });

  it("does not let an invalidated in-flight response replace a newer refresh", async () => {
    const cache = new MetricsRequestCache<string>(2);
    cache.setScope("account-a:session-1");
    let resolveOld!: (value: string) => void;
    const old = cache.get("filters", () => new Promise<string>((done) => { resolveOld = done; }));
    await expect(cache.get("filters", async () => "fresh", { refresh: true })).resolves.toBe("fresh");
    resolveOld("stale");
    await expect(old).rejects.toBeInstanceOf(MetricsRequestInvalidatedError);
    await expect(cache.get("filters", async () => "unused")).resolves.toBe("fresh");
  });
});
