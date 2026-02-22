import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type MarketSpread = Tables<"market_spreads_live">;

export function useMarketSpreads(enabled: boolean, pollInterval = 5000) {
  const [data, setData] = useState<MarketSpread[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"LIVE" | "DEGRADED" | "OFFLINE">("OFFLINE");

  const fetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data: rows, error } = await supabase
        .from("market_spreads_live")
        .select("*");
      if (error) {
        setStatus("DEGRADED");
        return;
      }
      setData(rows ?? []);
      setStatus("LIVE");
    } catch {
      setStatus("OFFLINE");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    fetch();
    const id = setInterval(fetch, pollInterval);
    return () => clearInterval(id);
  }, [enabled, fetch, pollInterval]);

  return { data, loading, status };
}
