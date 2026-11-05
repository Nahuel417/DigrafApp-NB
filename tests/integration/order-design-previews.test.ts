import { describe, expect, it } from "vitest";

import { expandOrderDesignPurgePaths, processOrderPurgeRequest } from "../../supabase/functions/process-order-purge/index";

const orderId = "11111111-1111-4111-8111-111111111111";
const originalPath = `orders/${orderId}/22222222-2222-4222-8222-222222222222.png`;

describe("private order design preview lifecycle", () => {
  it("includes deterministic sidecars in purge paths without duplicates", () => {
    expect(expandOrderDesignPurgePaths([originalPath, originalPath, "", `${originalPath.slice(0, -4)}.preview.webp`])).toEqual([
      originalPath,
      `${originalPath.slice(0, -4)}.preview.webp`,
    ]);
    expect(expandOrderDesignPurgePaths(["../outside.png"])).toBeNull();
  });

  it("blocks unsafe purge paths before any storage deletion or job finalization", async () => {
    const removedPaths: string[][] = [];
    const rpcCalls: string[] = [];
    const response = await processOrderPurgeRequest(new Request("https://edge.example/purge", {
      method: "POST",
      headers: { "X-M16-Cron-Secret": "test-secret" },
    }), {
      secret: "test-secret",
      createClient: () => ({
        rpc: async (name: string) => {
          rpcCalls.push(name);
          return name === "claim_order_purge_storage_jobs"
            ? { data: [{ job_id: "job", lease_token: "lease", object_paths: ["../outside.png"] }], error: null }
            : { data: null, error: null };
        },
        storage: { from: () => ({ remove: async (paths: string[]) => { removedPaths.push(paths); return { error: null }; } }) },
      }),
    });

    expect(response.status).toBe(500);
    expect(removedPaths).toEqual([]);
    expect(rpcCalls).not.toContain("finalize_order_purge_storage_job");
  });

  it("deletes a valid original and its preview together and finalizes the storage job", async () => {
    const removedPaths: string[][] = [];
    const finalized: Record<string, unknown>[] = [];
    const response = await processOrderPurgeRequest(new Request("https://edge.example/purge", {
      method: "POST",
      headers: { "X-M16-Cron-Secret": "test-secret" },
    }), {
      secret: "test-secret",
      createClient: () => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          if (name === "claim_order_purge_storage_jobs") {
            return { data: [{ job_id: "job", lease_token: "lease", object_paths: [originalPath] }], error: null };
          }
          if (name === "finalize_order_purge_storage_job") finalized.push(args);
          return { data: null, error: null };
        },
        storage: { from: () => ({ remove: async (paths: string[]) => { removedPaths.push(paths); return { error: null }; } }) },
      }),
    });

    expect(response.status).toBe(200);
    expect(removedPaths).toEqual([[originalPath, `${originalPath.slice(0, -4)}.preview.webp`]]);
    expect(finalized).toEqual([{ p_job_id: "job", p_lease_token: "lease", p_succeeded: true, p_error: null }]);
  });
});
