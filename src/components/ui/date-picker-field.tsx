"use client";

import { CalendarDays } from "lucide-react";
import { es } from "react-day-picker/locale";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

export function DatePickerField({
  defaultValue = "",
  errorId,
  id,
  invalid = false,
  label,
  align = "start",
  max,
  min,
  name,
  onChange,
  required = true,
  triggerLabel,
  value,
}: {
  defaultValue?: string;
  errorId?: string;
  id: string;
  invalid?: boolean;
  label: string;
  align?: "start" | "end";
  max?: string;
  min?: string;
  name: string;
  onChange?: (value: string) => void;
  required?: boolean;
  triggerLabel: string;
  value?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedValue = value ?? internalValue;
  const selectedDate = dateFromInput(selectedValue);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!fieldRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function setDate(nextValue: string) {
    setInternalValue(nextValue);
    onChange?.(nextValue);
  }

  return (
    <div className="relative" ref={fieldRef}>
      <Input
        aria-describedby={errorId}
        aria-invalid={invalid}
        className="rounded-xl bg-card pr-10 font-mono text-sm shadow-none transition-colors focus-visible:bg-card [appearance:none] [&::-webkit-calendar-picker-indicator]:opacity-0"
        id={id}
        max={max}
        min={min}
        name={name}
        onChange={(event) => setDate(event.target.value)}
        ref={inputRef}
        required={required}
        type="date"
        value={selectedValue}
      />
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className="absolute right-0 top-1/2 size-11 -translate-y-1/2 rounded-l-none text-muted-foreground hover:text-foreground md:size-10"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost">
        <CalendarDays aria-hidden="true" />
      </Button>
      {open ? (
        <div
          aria-label={`Calendario para ${label}`}
          className={`${align === "end" ? "right-0" : "left-0"} absolute top-[calc(100%+0.5rem)] z-50 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-2 shadow-md`}
          role="dialog">
          <Calendar
            aria-label={`Calendario para ${label}`}
            captionLayout="label"
            className="w-full rounded-xl border-0 bg-card p-2 shadow-none"
            defaultMonth={selectedDate ?? new Date()}
            fixedWeeks
            formatters={{
              formatCaption: (date) => {
                const caption = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
                return caption.charAt(0).toUpperCase() + caption.slice(1);
              },
              formatWeekdayName: (date) => ["do", "lu", "ma", "mi", "ju", "vi", "sá"][date.getDay()] ?? "",
            }}
            locale={es}
            mode="single"
            onSelect={(date) => {
              if (!date) return;
              setDate(dateToInput(date));
              setOpen(false);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            selected={selectedDate}
            showOutsideDays
          />
        </div>
      ) : null}
    </div>
  );
}

function dateFromInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function dateToInput(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}
