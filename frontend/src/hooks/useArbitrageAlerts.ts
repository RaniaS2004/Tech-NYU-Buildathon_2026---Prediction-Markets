import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ArbitrageAlert {
  id: string;
  market_pair: string;
  spread: number;
  potential_profit_pct: number;
  status: string;
  timestamp: string;
  isNew?: boolean;
}

export function useArbitrageAlerts() {
  const [alerts, setAlerts] = useState<ArbitrageAlert[]>([]);
  const [flashingPairs, setFlashingPairs] = useState<Set<string>>(new Set());

  // Fetch existing alerts
  const fetchAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("arbitrage_alerts")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);
    if (!error && data) {
      setAlerts(data.map((a) => ({ ...a, isNew: false })));
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("arbitrage_alerts_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "arbitrage_alerts" },
        (payload) => {
          const newAlert: ArbitrageAlert = {
            ...(payload.new as any),
            isNew: true,
          };

          setAlerts((prev) => [newAlert, ...prev].slice(0, 50));

          // Flash the market pair for 5 seconds
          const pair = newAlert.market_pair;
          setFlashingPairs((prev) => new Set(prev).add(pair));
          setTimeout(() => {
            setFlashingPairs((prev) => {
              const next = new Set(prev);
              next.delete(pair);
              return next;
            });
          }, 5000);

          // Clear "NEW" badge after 10 seconds
          setTimeout(() => {
            setAlerts((prev) =>
              prev.map((a) => (a.id === newAlert.id ? { ...a, isNew: false } : a))
            );
          }, 10000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { alerts, flashingPairs };
}
