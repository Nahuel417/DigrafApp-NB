const OPERATING_TIME_ZONE = "America/Argentina/Cordoba";

const operatingDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: OPERATING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getOperatingDate(instant: Date): string {
  const parts = operatingDateFormatter.formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("No se pudo calcular el día operativo.");
  }

  return `${year}-${month}-${day}`;
}
