import type { GetOrderDesignImagePreviewReadUrlActionState } from "@/features/orders/image-actions";

type PreviewResult = GetOrderDesignImagePreviewReadUrlActionState;
type PreviewLoader = (orderId: string) => Promise<PreviewResult>;
export type PreviewReader = (orderId: string, revision: string, force?: boolean) => Promise<PreviewResult>;
type Entry = { revision: string; result?: PreviewResult; pending?: Promise<PreviewResult> };

export function createOrderDesignPreviewCache(load: PreviewLoader): PreviewReader {
  const entries = new Map<string, Entry>();

  return (orderId, revision, force = false) => {
    let entry = entries.get(orderId);
    if (!entry || force || entry.revision !== revision) {
      entry = { revision };
      entries.set(orderId, entry);
    }
    const current = entry;
    const expiry = Date.parse(current.result?.image?.expiresAt ?? "");
    if (current.result && expiry > Date.now() + 5_000) return Promise.resolve(current.result);
    if (current.pending) return current.pending;

    const pending = load(orderId).then(result => {
      if (entries.get(orderId) === current && current.pending === pending && result.status === "success" && result.image) {
        current.result = result;
      }
      return result;
    }).finally(() => {
      if (current.pending === pending) current.pending = undefined;
    });
    current.pending = pending;
    return pending;
  };
}
