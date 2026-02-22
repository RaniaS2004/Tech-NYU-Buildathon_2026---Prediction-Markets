import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GraphNode {
  id: string;
  label: string;
  hub_link_count: number;
  probability: number | null;
  liquidity_score: number | null;
  settlement_source: string | null;
  resolution_date: string | null;
  // Added by force-graph
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship_type: string;
  confidence_score: number;
  impact_direction: string | null;
  vantage_insight: string | null;
  logic_justification: string;
  risk_alert: string | null;
  probability_a: number | null;
  probability_b: number | null;
  probability_spread: number | null;
  arbitrage_flag: string | null;
  correlation_strength: string | null;
}

export interface HubNode {
  market_key: string;
  label: string;
  link_count: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: { hub_nodes: HubNode[]; total_relationships: number };
}

export function useGraphData() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: result, error: err } = await supabase.functions.invoke("graph-data");
      if (err) throw err;
      setData(result as GraphData);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
