import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const integration = readFileSync(new URL("../../tests/integration/m16-archive-purge.test.ts", import.meta.url), "utf8");

describe("M16 integration test structure", () => {
  it("keeps all scenarios while centralizing cancellation fixture setup", () => {
    expect(integration.match(/\bit\("/g)).toHaveLength(16);
    expect(integration.match(/async function cancelOrder/g)).toHaveLength(1);
    expect(integration.match(/invoke\(admin, "cancel_order"/g)).toHaveLength(1);
  });
});
