import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch relationships
    const { data: relationships, error: relErr } = await supabase
      .from("market_relationships")
      .select("*");

    if (relErr) throw relErr;

    // Fetch metadata
    const { data: metadata, error: metaErr } = await supabase
      .from("market_metadata")
      .select("*");

    if (metaErr) throw metaErr;

    // Fetch latest signals for probability/liquidity
    const { data: signals, error: sigErr } = await supabase
      .from("market_spreads_live")
      .select("*");

    if (sigErr) throw sigErr;

    // Build signal lookup
    const signalMap = new Map<string, any>();
    for (const s of signals ?? []) {
      if (s.market_key) signalMap.set(s.market_key, s);
    }

    // Build metadata lookup
    const metaMap = new Map<string, any>();
    for (const m of metadata ?? []) {
      metaMap.set(m.market_key, m);
    }

    // Count hub links
    const hubCount = new Map<string, number>();
    for (const r of relationships ?? []) {
      hubCount.set(r.market_key_a, (hubCount.get(r.market_key_a) ?? 0) + 1);
      hubCount.set(r.market_key_b, (hubCount.get(r.market_key_b) ?? 0) + 1);
    }

    // Collect unique market keys
    const allKeys = new Set<string>();
    for (const r of relationships ?? []) {
      allKeys.add(r.market_key_a);
      allKeys.add(r.market_key_b);
    }

    // Build nodes
    const nodes = Array.from(allKeys).map((key) => {
      const meta = metaMap.get(key);
      const sig = signalMap.get(key);
      return {
        id: key,
        label: meta?.event_name ?? key,
        hub_link_count: hubCount.get(key) ?? 0,
        probability: sig?.kalshi_pct ?? sig?.polymarket_pct ?? null,
        liquidity_score: sig?.liquidity_depth_usd ?? null,
        settlement_source: meta?.settlement_source ?? null,
        resolution_date: meta?.resolution_date ?? null,
      };
    });

    // Build links
    const links = (relationships ?? []).map((r: any) => ({
      source: r.market_key_a,
      target: r.market_key_b,
      relationship_type: r.relationship_type,
      confidence_score: r.confidence_score,
      impact_direction: r.impact_direction,
      vantage_insight: r.vantage_insight,
      logic_justification: r.logic_justification,
      risk_alert: r.risk_alert,
      probability_a: r.probability_a,
      probability_b: r.probability_b,
      probability_spread: r.probability_spread,
      arbitrage_flag: r.arbitrage_flag,
      correlation_strength: r.correlation_strength,
    }));

    // Top hubs
    const hubNodes = [...hubCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => ({
        market_key: key,
        label: metaMap.get(key)?.event_name ?? key,
        link_count: count,
      }));

    return new Response(
      JSON.stringify({ nodes, links, meta: { hub_nodes: hubNodes, total_relationships: links.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
