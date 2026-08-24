import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260823000100_early_manual_cancelled_purge.sql", import.meta.url), "utf8");

describe("early manual cancelled purge migration contract", () => {
  it("replaces the old callable purge signatures in dependency-safe order", () => {
    expect(migration).toContain("revoke all on function public.purge_cancelled_order(uuid, text), public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz), public.purge_due_cancelled_orders(integer) from public, anon, authenticated, service_role;");
    expect(migration).toContain("drop function public.purge_cancelled_order(uuid, text);");
    expect(migration).toContain("drop function public.purge_due_cancelled_orders(integer);");
    expect(migration).toContain("drop function public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz);");
    expect(migration.indexOf("drop function public.purge_due_cancelled_orders(integer);")).toBeLessThan(migration.indexOf("drop function public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz);"));
  });

  it("declares the trusted six-argument core and three-argument manual wrapper", () => {
    expect(migration).toContain("create function public.m16_purge_cancelled_order_core(");
    expect(migration).toContain("p_reason text,");
    expect(migration).toContain("p_idempotency_key text,");
    expect(migration).toContain("create function public.purge_cancelled_order(");
    expect(migration).toContain("p_order_id uuid,\n  p_idempotency_key text,\n  p_reason text");
    expect(migration).toContain("grant execute on function public.purge_cancelled_order(uuid, text, text) to authenticated;");
    expect(migration).toContain("grant execute on function public.purge_due_cancelled_orders(integer) to service_role;");
    expect(migration).toContain("revoke all on function public.m16_purge_cancelled_order_core(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;");
  });

  it("keeps the manual reason, source, replay snapshot, retention, and scheduler contracts", () => {
    expect(migration).toContain("char_length(normalized_reason) not between 2 and 500");
    expect(migration).toContain("m16-purge-cancelled:v2");
    expect(migration).toContain("return existing_event.result_snapshot;");
    expect(migration).toContain("result_snapshot := jsonb_build_object(");
    expect(migration).toContain("'updated_at', p_now");
    expect(migration).toContain("'source', normalized_source");
    expect(migration).toContain("and target_order.cancelled_at <= clock_timestamp() - interval '30 days'");
    expect(migration).toContain("normalized_source = 'manual'");
    expect(migration).toContain("normalized_source = 'scheduler'");
    expect(migration).toContain("p_reason is null");
    expect(migration).toContain("delete from public.order_comments");
    expect(migration).toContain("delete from public.order_catalog_items");
    expect(migration).toContain("delete from public.order_lines");
    expect(migration).toContain("order_purge_jobs");
  });

  it("includes the operation time in the first successful result snapshot", () => {
    const snapshotStart = migration.indexOf("result_snapshot := jsonb_build_object(");
    const snapshotEnd = migration.indexOf(");", snapshotStart);
    const snapshot = migration.slice(snapshotStart, snapshotEnd);

    expect(snapshot).toContain("'updated_at', p_now");
  });
});
