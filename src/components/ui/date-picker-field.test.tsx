// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatePickerField } from "./date-picker-field";

afterEach(() => cleanup());

describe("DatePickerField", () => {
  it("disables dates outside the input bounds while keeping the boundary dates selectable", () => {
    render(
      <DatePickerField
        defaultValue="2026-08-15"
        id="delivery-date"
        label="Fecha de entrega"
        max="2026-08-20"
        min="2026-08-10"
        name="deliveryDate"
        required
        triggerLabel="Abrir calendario de entrega"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de entrega" }));
    const before = document.querySelector<HTMLButtonElement>('button[data-day="2026-08-09"]');
    const firstDay = document.querySelector<HTMLButtonElement>('button[data-day="2026-08-10"]');
    const lastDay = document.querySelector<HTMLButtonElement>('button[data-day="2026-08-20"]');
    const after = document.querySelector<HTMLButtonElement>('button[data-day="2026-08-21"]');

    expect(before?.disabled).toBe(true);
    expect(firstDay?.disabled).toBe(false);
    expect(lastDay?.disabled).toBe(false);
    expect(after?.disabled).toBe(true);
  });

  it("keeps unbounded dates selectable and updates the associated input on selection", () => {
    const onChange = vi.fn();
    const view = render(
      <>
        <label htmlFor="delivery-date">Fecha de entrega</label>
        <DatePickerField
          defaultValue="2026-08-15"
          id="delivery-date"
          label="Fecha de entrega"
          name="deliveryDate"
          onChange={onChange}
          triggerLabel="Abrir calendario de entrega"
        />
      </>,
    );

    const input = screen.getByLabelText("Fecha de entrega") as HTMLInputElement;
    expect(input.value).toBe("2026-08-15");
    expect(input.required).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de entrega" }));
    const unboundedDay = view.container.querySelector<HTMLButtonElement>('button[data-day="2026-08-09"]');
    const selectedDay = view.container.querySelector<HTMLButtonElement>('button[data-day="2026-08-16"]');
    expect(unboundedDay?.disabled).toBe(false);
    expect(selectedDay?.disabled).toBe(false);
    if (!selectedDay) throw new Error("No se encontró el día disponible esperado.");

    fireEvent.click(selectedDay);

    expect(input.value).toBe("2026-08-16");
    expect(onChange).toHaveBeenCalledWith("2026-08-16");
  });
});
