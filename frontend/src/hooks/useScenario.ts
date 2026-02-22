import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CausalChainItem {
  market_key: string;
  label: string;
  order: number;
  impact: string;
  confidence: number;
  logic_justification: string;
}

export interface AffectedEdge {
  source: string;
  target: string;
}

export interface ScenarioReport {
  id: string;
  query: string;
  trigger_market: string;
  causal_chain: CausalChainItem[];
  narrative: string | null;
  affected_nodes: string[];
  affected_edges: AffectedEdge[];
  status: string;
  created_at: string;
}

export function useScenario() {
  const [report, setReport] = useState<ScenarioReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const submitScenario = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setReport(null);

    // Fake progress animation
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 12, 90));
    }, 400);

    try {
      const { data, error: err } = await supabase.functions.invoke("scenario", {
        body: { query },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setReport(data as ScenarioReport);
      setProgress(100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
    setProgress(0);
    setError(null);
  }, []);

  // Realtime listener for reports created externally (e.g. CLI)
  useEffect(() => {
    const channel = supabase
      .channel("scenario_reports_realtime")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "scenario_reports" },
        (payload: any) => {
          const newReport = payload.new;
          if (newReport.status === "complete") {
            setReport(newReport as ScenarioReport);
          }
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "scenario_reports" },
        (payload: any) => {
          const updated = payload.new;
          if (updated.status === "complete") {
            setReport(updated as ScenarioReport);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { report, loading, error, progress, submitScenario, clearReport };
}
