import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260917000100_optimize_order_board.sql", import.meta.url), "utf8");
const searchMigration = readFileSync(new URL("../../supabase/migrations/20261002000100_order_board_public_number_search.sql", import.meta.url), "utf8");

describe("order board migration contract", () => {
  it("returns only active orders with a primary image and aggregated products", () => {
    expect(migration).toContain("and image.is_primary = true");
    expect(migration).toContain("string_agg(");
    expect(migration).toContain("target_order.lifecycle_state = 'active'");
  });

  it("qualifies the profile id and hardens the security boundary", () => {
    expect(migration).toContain("where public.profiles.id = (select auth.uid())");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.get_order_board(text) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.get_order_board_snapshot(uuid) to authenticated;");
  });

  it("matches plain and formatted public order numbers without unsafe casts", () => {
    expect(searchMigration).toContain("search_text ~* '^ped[- ]?[0-9]+$'");
    expect(searchMigration).toContain("search_public_number := search_digits::bigint;");
    expect(searchMigration).toContain("target_order.public_number = search_public_number");
  });
});
