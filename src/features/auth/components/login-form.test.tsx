// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ loginAction: vi.fn() }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

import { LoginForm } from "./login-form";

afterEach(cleanup);

describe("LoginForm", () => {
  it("toggles password visibility with an accessible button", () => {
    render(<LoginForm />);
    const input = screen.getByLabelText("Contraseña") as HTMLInputElement;
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });

    expect(input.type).toBe("password");
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    toggle.focus();
    fireEvent.click(toggle);

    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));

    expect(input.type).toBe("password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeTruthy();
  });
});