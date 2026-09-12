import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260911000100_m13_import_match_without_code.sql", import.meta.url), "utf8");

describe("M13 import matching without a code migration contract", () => {
  it("matches uncoded products by normalized name before inserting", () => {
    expect(migration).toContain("if normalized_code is null then");
    expect(migration).toContain("lower(btrim(name)) = lower(btrim(p_name))");
    expect(migration).toContain("order by updated_at desc, id");
  });

  it("validates optional codes and preserves existing active state during import", () => {
    expect(migration).toContain("code is not null and code !~");
    expect(migration).toContain("where lower(btrim(name)) = lower(btrim(row->>'name'))");
    expect(migration).toContain("coalesce((row->>'active')::boolean, active, true)");
  });
});
