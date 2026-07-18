import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { changePasswordSchema, passwordSchema } from "./password";

const validPassword = `Password${randomUUID().replaceAll("-", "")}7`;

describe("política de contraseñas", () => {
  it("acepta ocho caracteres con al menos un número", () => {
    expect(passwordSchema.safeParse(validPassword).success).toBe(true);
  });

  it("rechaza contraseñas cortas", () => {
    const result = passwordSchema.safeParse("Digr4f");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rechaza contraseñas sin números", () => {
    const result = passwordSchema.safeParse("SoloLetras");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "La contraseña debe incluir al menos un número.",
    );
  });

  it("exige que la confirmación coincida", () => {
    const result = changePasswordSchema.safeParse({
      password: validPassword,
      passwordConfirmation: `${validPassword}8`,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Las contraseñas no coinciden.");
  });
});
