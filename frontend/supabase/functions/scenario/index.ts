import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'query' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create a pending report first
    const { data: report, error: insertErr } = await supabase
      .from("scenario_reports")
      .insert({ query, trigger_market: "", status: "processing" })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const reportId = report.id;

    // Fetch graph context
    const [relResult, metaResult] = await Promise.all([
      supabase.from("market_relationships").select("*"),
      supabase.from("market_metadata").select("market_key, event_name"),
    ]);

    if (relResult.error) throw relResult.error;
    if (metaResult.error) throw metaResult.error;

    const relationships = relResult.data ?? [];
    const metadata = metaResult.data ?? [];
    const metaMap = new Map(metadata.map((m: any) => [m.market_key, m.event_name]));

    // Build adjacency for context
    const adjacency: Record<string, string[]> = {};
    for (const r of relationships) {
      if (!adjacency[r.market_key_a]) adjacency[r.market_key_a] = [];
      if (!adjacency[r.market_key_b]) adjacency[r.market_key_b] = [];
      adjacency[r.market_key_a].push(r.market_key_b);
      adjacency[r.market_key_b].push(r.market_key_a);
    }

    // Call AI gateway to analyze the scenario
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a prediction market analyst. You have a graph of market relationships. Given a what-if scenario, identify which markets are affected and trace the causal chain.

Available markets: ${metadata.map((m: any) => `${m.market_key}: ${m.event_name}`).join("; ")}

Relationships: ${relationships.slice(0, 50).map((r: any) => `${r.market_key_a} -[${r.relationship_type}]-> ${r.market_key_b} (conf: ${r.confidence_score}, justification: ${r.logic_justification})`).join("; ")}

Respond ONLY with valid JSON (no markdown):
{
  "trigger_market": "market_key of the most directly affected market",
  "causal_chain": [
    { "market_key": "...", "label": "...", "order": 0, "impact": "description of impact", "confidence": 0.0-1.0, "logic_justification": "..." },
    { "market_key": "...", "label": "...", "order": 1, "impact": "...", "confidence": 0.0-1.0, "logic_justification": "..." }
  ],
  "narrative": "A 2-3 paragraph analysis of the scenario's ripple effects across markets",
  "affected_edges": [
    { "source": "market_key_a", "target": "market_key_b" }
  ]
}`
          },
          {
            role: "user",
            content: `Scenario: ${query}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";
    
    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    const affectedNodes = (parsed.causal_chain ?? []).map((c: any) => c.market_key);

    // Update the report with results
    const { error: updateErr } = await supabase
      .from("scenario_reports")
      .update({
        trigger_market: parsed.trigger_market ?? "",
        causal_chain: parsed.causal_chain ?? [],
        narrative: parsed.narrative ?? "",
        affected_nodes: affectedNodes,
        affected_edges: parsed.affected_edges ?? [],
        status: "complete",
      })
      .eq("id", reportId);

    if (updateErr) throw updateErr;

    // Fetch the complete report
    const { data: finalReport } = await supabase
      .from("scenario_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    return new Response(JSON.stringify(finalReport), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
