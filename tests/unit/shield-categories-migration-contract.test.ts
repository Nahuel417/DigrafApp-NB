import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260824000100_remove_shield_categories.sql", import.meta.url), "utf8");

describe("shield categories migration contract", () => {
  it("converts categories into shield products without duplicate names", () => {
    expect(migration).toContain("insert into public.catalog_products (");
    expect(migration).toContain("'shield'::public.catalog_product_kind");
    expect(migration).toContain("where product.section_id = category.section_id");
    expect(migration).toContain("and product.name_key = category.name_key");
    expect(migration).toContain("category.is_active");
  });

  it("keeps the existing shield product and historical snapshots independent of categories", () => {
    expect(migration).toContain("update public.catalog_products set category_id = null");
    expect(migration).toContain("alter table public.catalog_products drop column category_id");
    expect(migration).toContain("drop table public.catalog_categories");
    expect(migration).toContain("drop function public.create_catalog_category(uuid, text)");
    expect(migration).toContain("drop function public.rename_catalog_category(uuid, text)");
    expect(migration).toContain("drop function public.set_catalog_category_active(uuid, boolean)");
  });

  it("leaves only category-free product creation available", () => {
    expect(migration).toContain("create or replace function public.create_catalog_product_without_category(");
    expect(migration).toContain("drop function public.create_catalog_product(uuid, public.catalog_product_kind, uuid, text)");
    expect(migration).not.toContain("target_category_id");
  });
});
