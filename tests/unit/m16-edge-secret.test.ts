import { describe, expect, it, vi } from "vitest";

import { processOrderPurgeRequest } from "../../supabase/functions/process-order-purge/index";

describe("process-order-purge secret gate", () => {
  it("rejects a missing secret before constructing a service-role client", async () => {
    const createClient = vi.fn();
    const response = await processOrderPurgeRequest(new Request("http://localhost", { method: "POST" }), {
      secret: "expected-secret",
      createClient,
    });

    expect(response.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["", "wrong-secret"])("rejects %s before database or Storage use", async (secret) => {
    const createClient = vi.fn();
    const response = await processOrderPurgeRequest(new Request("http://localhost", {
      headers: { "X-M16-Cron-Secret": secret },
      method: "POST",
    }), { secret: "expected-secret", createClient });

    expect(response.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("runs the service-role purge sequence only after a valid secret", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ job_id: "job-1", lease_token: "lease-1", object_paths: ["orders/order-1/image.png"] }], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const response = await processOrderPurgeRequest(new Request("http://localhost", {
      headers: { "X-M16-Cron-Secret": "expected-secret" },
      method: "POST",
    }), { secret: "expected-secret", createClient: () => ({ rpc, storage: { from: () => ({ remove }) } }) });

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(["orders/order-1/image.png"]);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "prepare_cancelled_order_purge_jobs",
      "purge_due_cancelled_orders",
      "claim_order_purge_storage_jobs",
      "finalize_order_purge_storage_job",
    ]);
    expect(rpc).toHaveBeenLastCalledWith("finalize_order_purge_storage_job", {
      p_job_id: "job-1",
      p_lease_token: "lease-1",
      p_succeeded: true,
      p_error: null,
    });
  });

  it("treats a missing Storage object as successful cleanup", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ job_id: "job-1", lease_token: "lease-1", object_paths: ["orders/order-1/image.png"] }], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ error: { message: "Object not found", statusCode: 404 } });

    const response = await processOrderPurgeRequest(new Request("http://localhost", {
      headers: { "X-M16-Cron-Secret": "expected-secret" },
      method: "POST",
    }), { secret: "expected-secret", createClient: () => ({ rpc, storage: { from: () => ({ remove }) } }) });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("finalize_order_purge_storage_job", {
      p_job_id: "job-1",
      p_lease_token: "lease-1",
      p_succeeded: true,
      p_error: null,
    });
  });

  it("records a Storage failure for durable retry", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ job_id: "job-1", lease_token: "lease-1", object_paths: ["orders/order-1/image.png"] }], error: null })
      .mockResolvedValueOnce({ data: { storage_status: "storage_retry", attempts: 1 }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: { message: "Storage unavailable", statusCode: 503 } });

    const response = await processOrderPurgeRequest(new Request("http://localhost", {
      headers: { "X-M16-Cron-Secret": "expected-secret" },
      method: "POST",
    }), { secret: "expected-secret", createClient: () => ({ rpc, storage: { from: () => ({ remove }) } }) });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("finalize_order_purge_storage_job", {
      p_job_id: "job-1",
      p_lease_token: "lease-1",
      p_succeeded: false,
      p_error: "Storage unavailable",
    });
  });

  it("completes a retry without invoking the database purge core again", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ job_id: "job-1", lease_token: "lease-2", object_paths: ["orders/order-1/image.png"] }], error: null })
      .mockResolvedValueOnce({ data: { storage_status: "storage_completed", attempts: 1 }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });

    const response = await processOrderPurgeRequest(new Request("http://localhost", {
      headers: { "X-M16-Cron-Secret": "expected-secret" },
      method: "POST",
    }), { secret: "expected-secret", createClient: () => ({ rpc, storage: { from: () => ({ remove }) } }) });

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("m16_purge_cancelled_order_core");
    expect(rpc).toHaveBeenLastCalledWith("finalize_order_purge_storage_job", {
      p_job_id: "job-1",
      p_lease_token: "lease-2",
      p_succeeded: true,
      p_error: null,
    });
  });
});
