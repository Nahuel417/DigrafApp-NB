import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260822000100_m16_archive_purge.sql", import.meta.url), "utf8");
const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const m16MigrationNames = readdirSync(migrationsDirectory).filter((name) => /^20260822000[1-5]00_m16_/.test(name));

const consolidatedFunctions = [
  "m15_reject_cancelled_order_mutation",
  "m16_purge_cancelled_order_core",
  "prepare_cancelled_order_purge_jobs",
  "claim_order_purge_storage_jobs",
];

describe("M16 migration contracts", () => {
  it("preserves the cancelled-order freeze for service_role mutations", () => {
    const trigger = migration.slice(migration.indexOf("create or replace function public.m15_reject_cancelled_order_mutation()"));
    expect(trigger).not.toContain("auth.role()) = 'service_role'");
    expect(trigger).toContain("El pedido está anulado y se encuentra congelado.");
  });

  it("qualifies the captured Storage paths when updating the purge job", () => {
    expect(migration).toContain("captured_object_paths jsonb");
    expect(migration).toContain("object_paths = captured_object_paths");
    expect(migration).toContain("where job_row.id = purge_job.id");
  });

  it("qualifies scheduler job output against the single queue constraint", () => {
    expect(migration).toContain("insert into public.order_purge_jobs as job_row");
    expect(migration).toContain("on conflict on constraint order_purge_jobs_order_id_key do nothing");
    expect(migration).toContain("returning job_row.id, job_row.order_id, job_row.status");
  });

  it("returns the generated lease separately from the JSON path payload", () => {
    expect(migration).toContain("returning job.id, job.object_paths into job_id, object_paths");
    expect(migration).toContain("lease_token := new_lease");
  });

  it("keeps one consolidated M16 migration without corrective duplicates", () => {
    expect(m16MigrationNames).toEqual(["20260822000100_m16_archive_purge.sql"]);

    for (const functionName of consolidatedFunctions) {
      const declaration = new RegExp(`create or replace function public\\.${functionName}\\b`, "g");
      expect(migration.match(declaration), `${functionName} declaration count`).toHaveLength(1);
    }
    expect(migration).toContain("revoke all on function public.m15_reject_cancelled_order_mutation() from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.prepare_cancelled_order_purge_jobs(integer), public.purge_due_cancelled_orders(integer), public.claim_order_purge_storage_jobs(integer), public.finalize_order_purge_storage_job(uuid, uuid, boolean, text) to service_role;");
  });

  it("contains the final corrected definitions in the base migration", () => {
    expect(migration).toContain(
      "set status = 'storage_pending', object_paths = captured_object_paths, idempotency_fingerprint = request_fingerprint, result = result_snapshot, updated_at = clock_timestamp()\n  where job_row.id = purge_job.id;",
    );
    expect(migration).toContain(
      "insert into public.order_purge_jobs as job_row (order_id, status)\n  select target_order.id, 'prepared'",
    );
    expect(migration).toContain(
      "returning job.id, job.object_paths into job_id, object_paths;\n    lease_token := new_lease;",
    );
    expect(migration).toContain(
      "and (new.lifecycle_state = 'active' or (new.lifecycle_state = 'purged_cancelled' and current_setting('m16.purge_context', true) = 'on'))",
    );
    expect(migration).toContain("raise exception 'El pedido está anulado y se encuentra congelado.';");
  });

  it("preserves timeline actor validation ordering and employee financial redaction", () => {
    const timeline = migration.slice(migration.indexOf("create or replace function public.get_order_timeline(p_order_id uuid)"));
    const actorSelection = timeline.indexOf("select * into actor from public.profiles where id = (select auth.uid());");
    const actorValidation = timeline.indexOf("if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;");
    const targetSelection = timeline.indexOf("select * into target_order from public.orders where id = p_order_id;");

    expect(actorSelection).toBeGreaterThanOrEqual(0);
    expect(actorValidation).toBeGreaterThan(actorSelection);
    expect(actorValidation).toBeLessThan(targetSelection);
    expect(timeline).toContain("then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated'))) else change_event.details end");
    expect(timeline).toContain("then null else change_event.change_note end");
    expect(timeline).toContain("item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')");
  });
});
