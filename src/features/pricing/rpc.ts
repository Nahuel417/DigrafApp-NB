import { createClient } from "@/lib/supabase/server";

type RpcError = { message: string };
export type PricingRpc = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }> };

export async function createPricingClient() {
  return (await createClient()) as unknown as PricingRpc;
}
