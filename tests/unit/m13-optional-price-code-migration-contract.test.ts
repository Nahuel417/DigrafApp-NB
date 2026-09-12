import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260910000100_m13_optional_price_product_code.sql", import.meta.url), "utf8");

describe("M13 optional price code migration contract", () => {
  it("allows products without a visible code", () => {
    expect(migration).toContain("alter column code drop not null");
    expect(migration).toContain("normalized_code text := nullif(btrim(p_code), '')");
    expect(migration).toContain("values(normalized_code");
  });

  it("updates coded rows and creates uncoded rows during import", () => {
    expect(migration).toContain("where code_key = lower(code);");
    expect(migration).toContain("where nullif(btrim(value->>'code'), '') is not null");
    expect(migration).toContain("perform public.upsert_price_product(null, code");
  });
});
