import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { formatArs } from "@/lib/money/decimal";

export type StockItem = Pick<Database["public"]["Tables"]["stock_items"]["Row"], "id" | "is_active" | "name" | "quantity">;
export type StockMovement = Pick<Database["public"]["Tables"]["stock_movements"]["Row"], "created_at" | "id" | "item_id" | "kind" | "movement_date" | "quantity">;

export async function listStockItems() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, is_active, name, quantity")
    .order("name")
    .order("id");
  if (error) throw new Error("No se pudo cargar el stock de telas.");
  return data satisfies StockItem[];
}

export async function getStockHistory(itemId: string, includePrices: boolean) {
  const supabase = await createClient();
  const { data: movements, error } = await supabase
    .from("stock_movements")
    .select("id, item_id, kind, quantity, movement_date, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(2);
  if (error) throw new Error("No se pudo cargar el historial de la tela.");

  const movementIds = movements.map((movement) => movement.id);
  const cancellationsPromise = movementIds.length
    ? supabase.from("stock_movement_cancellations").select("movement_id, reason, created_at").in("movement_id", movementIds)
        .then(({ data, error: cancellationError }) => {
          if (cancellationError) throw new Error("No se pudo cargar el historial de la tela.");
          return data;
        })
    : Promise.resolve([]);
  const pricesPromise = includePrices && movementIds.length
    ? supabase.from("stock_purchase_prices").select("movement_id, amount").in("movement_id", movementIds)
        .then(({ data, error: priceError }) => {
          if (priceError) throw new Error("No se pudieron cargar los precios por rollo.");
          return data;
        })
    : Promise.resolve([]);
  const [cancellations, prices] = await Promise.all([cancellationsPromise, pricesPromise]);

  return {
    cancellationsByMovementId: new Map(cancellations.map((cancellation) => [cancellation.movement_id, cancellation])),
    pricesByMovementId: new Map(prices.map((price) => [price.movement_id, formatArs(String(price.amount))])),
    movements: movements satisfies StockMovement[],
  };
}

export function formatStockQuantity(quantity: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(quantity);
}

export function formatStockDate(date: string) {
  return date.split("-").reverse().join("/");
}

export function formatStockDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(value));
}
