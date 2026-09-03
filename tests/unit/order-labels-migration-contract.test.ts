import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(new URL("../../supabase/migrations/20260831000100_order_labels.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260902000100_order_labels_without_audit.sql", import.meta.url), "utf8");

describe("order labels migration contract", () => {
  it("stores only the approved optional label values", () => {
    expect(baseMigration).toContain("create type public.order_label as enum");
    expect(baseMigration).toContain("'urgent'");
    expect(baseMigration).toContain("'returned'");
    expect(baseMigration).toContain("'review'");
    expect(baseMigration).toContain("add column label public.order_label");
  });

  it("protects label mutations with actor, row, and version checks without audit coupling", () => {
    expect(migration).toContain("public.pr1a_assert_actor(array['super_admin', 'admin', 'attention', 'employee']::public.app_role[])");
    expect(migration).toContain("where id = p_order_id\n  for update;");
    expect(migration).toContain("target_order.updated_at <> p_expected_updated_at");
    expect(migration).not.toContain("order_change_events");
    expect(migration).not.toContain("idempotency");
    expect(migration).not.toContain("order_label_changed");
  });

  it("returns the label in the board DTO and grants only authenticated RPC access", () => {
    expect(baseMigration).toContain("label public.order_label,");
    expect(baseMigration).toContain("target_order.label,");
    expect(migration).toContain("drop function public.set_order_label(uuid, public.order_label, timestamptz, text);");
    expect(migration).toContain("revoke all on function public.set_order_label(uuid, public.order_label, timestamptz) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.set_order_label(uuid, public.order_label, timestamptz) to authenticated;");
  });
});
