"use client";

import { createClient } from "@/lib/supabase/browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { MetricsDashboard, MetricsSales, MetricsSummary } from "../contract";
import { resolveMetricsDateRange, type MetricsFilters, type MetricsPeriod } from "../filters";
import { MetricsRequestCache } from "../request-cache";

type MetricsCacheContextValue = {
  cache: MetricsRequestCache<MetricsDashboard>;
  salesCache: MetricsRequestCache<MetricsSales>;
  summaryCache: MetricsRequestCache<MetricsSummary>;
  ready: boolean;
  scope: string | null;
  filters: MetricsFilters | null;
  period: MetricsPeriod;
  setFilters: (filters: MetricsFilters | null | ((current: MetricsFilters | null) => MetricsFilters | null)) => void;
  setPeriod: (period: MetricsPeriod) => void;
  initializeFilters: () => void;
};

const MetricsCacheContext = createContext<MetricsCacheContextValue | null>(null);

function sessionScope(session: { access_token: string; user: { id: string } } | null, profileId: string) {
  if (!session || session.user.id !== profileId) return null;
  const encodedPayload = session.access_token.split(".")[1];
  try {
    const payload = JSON.parse(atob(encodedPayload!.replaceAll("-", "+").replaceAll("_", "/"))) as { session_id?: unknown };
    return `${profileId}:${typeof payload.session_id === "string" ? payload.session_id : session.user.id}`;
  } catch {
    return `${profileId}:${session.user.id}`;
  }
}

export function MetricsCacheProvider({ profileId, children }: { profileId: string; children: React.ReactNode }) {
  const cacheRef = useRef(new MetricsRequestCache<MetricsDashboard>(12));
  const salesCacheRef = useRef(new MetricsRequestCache<MetricsSales>(12));
  const summaryCacheRef = useRef(new MetricsRequestCache<MetricsSummary>(12));
  const scopeRef = useRef<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [filters, setFilters] = useState<MetricsFilters | null>(null);
  const [period, setPeriod] = useState<MetricsPeriod>("last7");

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let authEventVersion = 0;
    const applySession = (session: { access_token: string; user: { id: string } } | null) => {
      const scope = sessionScope(session, profileId);
      if (scope !== scopeRef.current) {
        cacheRef.current.setScope(scope);
        salesCacheRef.current.setScope(scope);
        summaryCacheRef.current.setScope(scope);
        scopeRef.current = scope;
        setScope(scope);
        setFilters(null);
        setPeriod("last7");
      }
      setReady(Boolean(scope));
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventVersion += 1;
      applySession(session);
    });
    const initialEventVersion = authEventVersion;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && authEventVersion === initialEventVersion) applySession(data.session);
    }).catch(() => {
      if (mounted) applySession(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [profileId]);

  const initializeFilters = useCallback(() => {
    setFilters((current) => {
      if (current) return current;
      const range = resolveMetricsDateRange("last7");
      return { ...range, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null };
    });
  }, []);

  const value = useMemo(() => ({ cache: cacheRef.current, salesCache: salesCacheRef.current, summaryCache: summaryCacheRef.current, ready, scope, filters, period, setFilters, setPeriod, initializeFilters }), [ready, scope, filters, period, initializeFilters]);
  return <MetricsCacheContext.Provider value={value}>{children}</MetricsCacheContext.Provider>;
}

export function useMetricsCache() {
  const context = useContext(MetricsCacheContext);
  if (!context) throw new Error("MetricsCacheProvider is missing.");
  return context;
}
