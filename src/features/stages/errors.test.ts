import { describe, expect, it } from "vitest";

import { workflowStageErrorMessage } from "./errors";

describe("workflow stage RPC errors", () => {
  it("maps known domain errors to recoverable messages", () => {
    expect(workflowStageErrorMessage("ERROR: No se puede retirar una etapa que tiene pedidos. CONTEXT: test")).toBe("No se puede retirar una etapa que tiene pedidos.");
    expect(workflowStageErrorMessage("Las etapas cambiaron en otra sesión. Actualizá e intentá nuevamente.")).toBe("Las etapas cambiaron en otra sesión. Actualizá e intentá nuevamente.");
  });

  it("hides unknown database details", () => {
    expect(workflowStageErrorMessage("duplicate key value violates secret constraint")).toBe("No se pudo actualizar las etapas. Intentá nuevamente.");
  });
});
