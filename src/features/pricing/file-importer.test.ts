import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("pdf-parse", () => {
  throw new Error("pdf-parse must not load until a PDF is parsed");
});

describe("price file importer", () => {
  it("does not load the PDF runtime during module evaluation", async () => {
    await expect(import("./file-importer")).resolves.toBeDefined();
  });
});
