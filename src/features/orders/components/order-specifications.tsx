import type { OrderDetailCatalogs, OrderDetailLine, OrderSelection } from "../detail-queries";
import type { OrderCatalogOption, LegacyCatalogOption } from "../queries";

export type SpecificationItem = { label: string; value: string };
export type SpecificationSection = { items: SpecificationItem[]; title: string };

const lineTypeLabels: Record<OrderDetailLine["lineType"], string> = {
  individual: "Prenda individual",
  set: "Conjunto",
  flag: "Bandera",
  bag: "Bolso",
  shield: "Escudo",
};

const legacyLabels: Record<string, string> = {
  neckline: "Cuello",
  upper_pattern: "Molde superior",
  lower_pattern: "Molde inferior",
  fabric: "Tela",
  extra: "Extra",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function idValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (!isRecord(value)) return null;
  return textValue(value.id) ?? textValue(value.value_id) ?? textValue(value.product_id);
}

function embeddedName(value: unknown) {
  if (!isRecord(value)) return null;
  return textValue(value.name) ?? textValue(value.value) ?? textValue(value.label);
}

function readableKey(key: string) {
  const readable = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Dato";
}

function primitiveValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  return textValue(value) ?? "Sin configurar";
}

function productsFrom(catalogs: OrderDetailCatalogs) {
  return [...catalogs.garments, ...catalogs.flags, ...catalogs.bags, ...catalogs.shields];
}

function findProductName(id: string | null, catalogs: OrderDetailCatalogs, selections: OrderSelection[]) {
  if (!id) return null;
  return productsFrom(catalogs).find((product) => product.id === id)?.name
    ?? selections.find((selection) => selection.catalogItemId === id)?.itemName
    ?? null;
}

function findLegacyName(id: string | null, options: LegacyCatalogOption[], selections: OrderSelection[]) {
  if (!id) return null;
  return options.find((option) => option.id === id)?.name
    ?? selections.find((selection) => selection.catalogItemId === id)?.itemName
    ?? null;
}

function displayId(value: unknown, name: string | null | undefined, fallback = "Sin configurar") {
  if (name) return name;
  const id = idValue(value);
  return id ? "No disponible" : fallback;
}

function findOption(optionId: string | null, productId: string | null, catalogs: OrderDetailCatalogs): OrderCatalogOption | null {
  const productOptions = productsFrom(catalogs).find((product) => product.id === productId)?.options ?? [];
  return productOptions.find((option) => option.id === optionId)
    ?? productsFrom(catalogs).flatMap((product) => product.options).find((option) => option.id === optionId)
    ?? null;
}

function optionValueEntries(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.values)) return value.values;
  if (Array.isArray(value.value_ids)) return value.value_ids;
  return [];
}

function formatOptionItems(value: unknown, productId: string | null, catalogs: OrderDetailCatalogs): SpecificationItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [{ label: `Opción ${index + 1}`, value: primitiveValue(entry) }];
    const optionId = idValue(entry.option_id) ?? idValue(entry.id);
    const option = findOption(optionId, productId, catalogs);
    const optionLabel = embeddedName(entry) ?? option?.name ?? (optionId ? "Opción no disponible" : `Opción ${index + 1}`);
    const values = optionValueEntries(entry).map((item) => {
      const valueId = idValue(item);
      const optionValue = option?.values.find((candidate) => candidate.id === valueId)?.value;
      return embeddedName(item) ?? optionValue ?? displayId(item, null);
    });
    return [{ label: optionLabel, value: values.length ? values.join(", ") : "Sin seleccionar" }];
  });
}

function formatLegacyItems(value: unknown, catalogs: OrderDetailCatalogs, selections: OrderSelection[]): SpecificationItem[] {
  if (!isRecord(value)) return [];
  const definitions = [
    { key: "neckline", options: catalogs.necklines },
    { key: "upper_pattern", options: catalogs.upperPatterns },
    { key: "lower_pattern", options: catalogs.lowerPatterns },
    { key: "fabric", options: catalogs.fabrics },
  ];
  const items = definitions.flatMap(({ key, options }) => {
    const raw = value[`${key}_id`] ?? value[key];
    if (raw === undefined) return [];
    return [{ label: legacyLabels[key]!, value: displayId(raw, embeddedName(raw) ?? findLegacyName(idValue(raw), options, selections)) }];
  });
  const extras = value.extra_ids ?? value.extras;
  if (Array.isArray(extras)) {
    const extraValues = extras.map((extra) => displayId(extra, embeddedName(extra) ?? findLegacyName(idValue(extra), catalogs.extras, selections))).join(", ");
    items.push({ label: legacyLabels.extra!, value: extraValues || "Sin configurar" });
  }
  return items;
}

function unknownItems(label: string, value: unknown): SpecificationItem[] {
  if (value === null || value === undefined) return [{ label, value: "Sin configurar" }];
  if (!isRecord(value) && !Array.isArray(value)) return [{ label, value: primitiveValue(value) }];
  const name = embeddedName(value);
  if (name) return [{ label, value: name }];
  const id = idValue(value);
  if (id) return [{ label, value: "No disponible" }];
  if (Array.isArray(value)) {
    if (!value.length) return [{ label, value: "Sin configurar" }];
    return value.flatMap((entry, index) => unknownItems(`${label} ${index + 1}`, entry));
  }
  return Object.entries(value).flatMap(([key, entry]) => unknownItems(`${label} · ${readableKey(key)}`, entry));
}

function partSection(title: string, value: unknown, catalogs: OrderDetailCatalogs, selections: OrderSelection[]): SpecificationSection | null {
  if (!isRecord(value)) return null;
  const productId = idValue(value.product_id);
  const productName = textValue(value.product_name) ?? embeddedName(value) ?? findProductName(productId, catalogs, selections);
  const items: SpecificationItem[] = [{ label: "Producto", value: displayId(value.product_id, productName) }];
  items.push(...formatOptionItems(value.options, productId, catalogs));
  items.push(...Object.entries(value).filter(([key]) => !["product_id", "product_name", "options"].includes(key)).flatMap(([key, entry]) => unknownItems(readableKey(key), entry)));
  return { items, title };
}

export function buildOrderSpecificationSections(line: OrderDetailLine, catalogs: OrderDetailCatalogs, selections: OrderSelection[] = []): SpecificationSection[] {
  const snapshot = isRecord(line.configurationSnapshot) ? line.configurationSnapshot : {};
  const configuration = isRecord(snapshot.configuration) ? { ...snapshot, ...snapshot.configuration } : snapshot;
  const baseItems: SpecificationItem[] = [
    { label: "Tipo de renglón", value: lineTypeLabels[line.lineType] },
    { label: "Cantidad", value: String(line.quantity) },
  ];
  if (line.lineType !== "set") baseItems.push({ label: "Producto", value: line.productName });
  if (line.color?.trim()) baseItems.push({ label: "Color", value: line.color.trim() });
  if (line.shieldNames.length) baseItems.push({ label: "Escudos", value: line.shieldNames.join(", ") });

  const sections: SpecificationSection[] = [{ items: baseItems, title: "Datos del renglón" }];
  if (line.lineType === "set") {
    const upper = partSection("Parte superior", configuration.upper, catalogs, selections);
    const lower = partSection("Parte inferior", configuration.lower, catalogs, selections);
    if (upper) sections.push(upper);
    if (lower) sections.push(lower);
  }
  const optionItems = line.lineType === "set"
    ? []
    : formatOptionItems(configuration.options, line.productId, catalogs);
  if (optionItems.length) sections.push({ items: optionItems, title: "Opciones del producto" });
  const legacyItems = formatLegacyItems(configuration.legacy_options, catalogs, selections);
  if (legacyItems.length) sections.push({ items: legacyItems, title: "Opciones clásicas" });
  const knownLegacyKeys = new Set(["neckline", "neckline_id", "upper_pattern", "upper_pattern_id", "lower_pattern", "lower_pattern_id", "fabric", "fabric_id", "extra", "extra_ids", "extras"]);
  const unknownLegacy = isRecord(configuration.legacy_options)
    ? Object.entries(configuration.legacy_options).filter(([key]) => !knownLegacyKeys.has(key)).flatMap(([key, value]) => unknownItems(readableKey(key), value))
    : configuration.legacy_options === undefined ? [] : unknownItems("Opciones clásicas", configuration.legacy_options);
  if (unknownLegacy.length) sections.push({ items: unknownLegacy, title: "Otros datos clásicos" });
  return sections;
}

export function OrderSpecifications({ catalogs, line, selections = [] }: { catalogs: OrderDetailCatalogs; line: OrderDetailLine; selections?: OrderSelection[] }) {
  const sections = buildOrderSpecificationSections(line, catalogs, selections);
  return (
    <div className="mt-3 flex min-w-0 flex-col gap-3" data-order-specifications>
      {sections.map((section) => (
        <section className="min-w-0 rounded-lg border border-border bg-background/70 p-3" key={section.title}>
          <h4 className="text-xs font-semibold tracking-label text-muted-foreground">{section.title}</h4>
          <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            {section.items.map((item, index) => (
              <div className="min-w-0 rounded-md border border-border bg-card p-3" key={`${section.title}-${item.label}-${index}`}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
