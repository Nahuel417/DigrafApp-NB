type PurgeClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  storage: { from(bucket: string): { remove(paths: string[]): Promise<{ error: StorageError | null }> } };
};

type StorageError = { message: string; statusCode?: number | string; error?: string };

type ProcessOrderPurgeDependencies = {
  secret: string | undefined;
  createClient: () => PurgeClient | Promise<PurgeClient>;
};

function isMissingStorageObject(error: StorageError) {
  return String(error.statusCode) === "404" || /not found|does not exist|no such object/i.test(`${error.message} ${error.error ?? ""}`);
}

export async function processOrderPurgeRequest(request: Request, dependencies: ProcessOrderPurgeDependencies) {
  if (!dependencies.secret || request.headers.get("X-M16-Cron-Secret") !== dependencies.secret) return new Response("Unauthorized", { status: 401 });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const client = await dependencies.createClient();
  for (const name of ["prepare_cancelled_order_purge_jobs", "purge_due_cancelled_orders"]) {
    const { error } = await client.rpc(name, { p_limit: 100 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const claimed = await client.rpc("claim_order_purge_storage_jobs", { p_limit: 100 });
  if (claimed.error) return Response.json({ error: claimed.error.message }, { status: 500 });
  const jobs = Array.isArray(claimed.data) ? claimed.data : [];
  for (const job of jobs) {
    const paths = Array.isArray((job as { object_paths?: unknown }).object_paths) ? (job as { object_paths: unknown[] }).object_paths.filter((path): path is string => typeof path === "string") : [];
    const storageResult = paths.length ? await client.storage.from("order-designs").remove(paths) : { error: null };
    const storageError = storageResult.error;
    const succeeded = !storageError || isMissingStorageObject(storageError);
    const finalized = await client.rpc("finalize_order_purge_storage_job", {
      p_job_id: (job as { job_id: string }).job_id,
      p_lease_token: (job as { lease_token: string }).lease_token,
      p_succeeded: succeeded,
      p_error: succeeded ? null : storageError.message,
    });
    if (finalized.error) return Response.json({ error: finalized.error.message }, { status: 500 });
  }
  return Response.json({ processed: jobs.length });
}

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve((request) => processOrderPurgeRequest(request, {
    secret: Deno.env.get("M16_PURGE_CRON_SECRET"),
    createClient: async () => {
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }) as unknown as PurgeClient;
    },
  }));
}
