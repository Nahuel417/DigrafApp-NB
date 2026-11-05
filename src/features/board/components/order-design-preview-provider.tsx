"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { getOrderDesignImagePreviewReadUrlAction } from "@/features/orders/image-actions";

import { createOrderDesignPreviewCache, type PreviewReader } from "../order-design-preview-cache";

const PreviewContext = createContext<PreviewReader | null>(null);
const readDirect = (orderId: string) => {
  const form = new FormData();
  form.set("orderId", orderId);
  return getOrderDesignImagePreviewReadUrlAction({}, form);
};

function PreviewScope({ children }: { children: ReactNode }) {
  const [read] = useState(() => createOrderDesignPreviewCache(readDirect));
  return <PreviewContext value={read}>{children}</PreviewContext>;
}

export function OrderDesignPreviewProvider({ sessionKey, children }: { sessionKey: string; children: ReactNode }) {
  return <PreviewScope key={sessionKey}>{children}</PreviewScope>;
}

export function useOrderDesignPreview(): PreviewReader {
  return useContext(PreviewContext) ?? readDirect;
}
