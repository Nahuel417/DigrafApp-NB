import type { Json } from "@/lib/supabase/database.types";

export const orderLineTypes = ["individual", "set", "flag", "bag", "shield"] as const;
export type OrderLineType = (typeof orderLineTypes)[number];

export type CatalogOptionSelection = {
  option_id: string;
  value_ids: string[];
};

export type LegacyLineOptions = {
  neckline_id?: string;
  upper_pattern_id?: string;
  lower_pattern_id?: string;
  fabric_id?: string;
  extra_ids?: string[];
};

export type OrderLineInput = {
  position: number;
  line_type: OrderLineType;
  product_id?: string;
  quantity: number;
  color?: string | null;
  options?: CatalogOptionSelection[];
  configuration?: {
    upper?: { product_id: string; options?: CatalogOptionSelection[] };
    lower?: { product_id: string; options?: CatalogOptionSelection[] };
    legacy_options?: LegacyLineOptions;
  };
  shield_product_ids?: string[];
};

export type CreateOrderLinesInput = {
  client_name: string;
  team_name: string;
  phone: string;
  order_date: string;
  promised_delivery_date: string;
  description: string;
  total_amount: string;
  deposit_amount: string;
  deposit_paid: boolean;
  lines: OrderLineInput[];
  idempotency_key: string;
};

export type OrderLineSnapshot = OrderLineInput & {
  product_name_snapshot: string;
  configuration: Json;
};
