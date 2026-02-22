'use strict';

/**
 * scenario_engine.js — Scenario Stress-Testing Engine
 *
 * Performs a two-level graph traversal across market_relationships when a
 * macro scenario is triggered, scoring downstream probability impacts and
 * generating RAG-augmented narratives via Claude.
 *
 * Two Anthropic API calls per scenario:
 *   1. parseScenario  — extract target_market + direction from natural language
 *   2. generateNarratives — RAG: graph JSON + justifications → impact summaries
 *
 * All other logic (BFS traversal, direction propagation, confidence decay)
 * is pure JavaScript — zero extra API cost for the graph math.
 *
 * ── Supabase schema (matches Lovable frontend exactly) ───────────────────────
 *
 *   CREATE TABLE public.scenario_reports (
 *     id              UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 *     query           TEXT    NOT NULL,
 *     trigger_market  TEXT    NOT NULL,
 *     causal_chain    JSONB   NOT NULL DEFAULT '[]'::jsonb,
 *     narrative       TEXT,
 *     affected_nodes  TEXT[]  NOT NULL DEFAULT '{}',
 *     affected_edges  JSONB   NOT NULL DEFAULT '[]'::jsonb,
 *     status          TEXT    NOT NULL DEFAULT 'pending',
 *     created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
 *   );
 *
 *   ALTER TABLE public.scenario_reports ENABLE ROW LEVEL SECURITY;
 *
 *   CREATE POLICY "Anyone can read scenario reports"
 *     ON public.scenario_reports FOR SELECT USING (true);
 *
 *   CREATE POLICY "Service role can manage scenario reports"
 *     ON public.scenario_reports FOR ALL USING (true) WITH CHECK (true);
 *
 *   ALTER PUBLICATION supabase_realtime ADD TABLE public.scenario_reports;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage (module):
 *   const { predictScenario } = require('./scenario_engine');
 *   const report = await predictScenario('CPI comes in at 3.2%');
 *
 * Usage (CLI):
 *   node scenario_engine.js "CPI comes in at 3.2%"
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabaseClient');

// ── Config ────────────────────────────────────────────────────────────────────
const MODEL         = 'claude-sonnet-4-6';
const MAX_DEPTH     = 2;    // 1 = first-order only, 2 = first + second-order
const MIN_PATH_CONF = 0.05; // prune paths whose cumulative confidence falls below this

// ── Robust JSON extractor ─────────────────────────────────────────────────────
/**
 * Extract the first well-formed JSON object from an AI response string.
 *
 * Claude occasionally wraps JSON in prose or markdown even when told not to.
 * This function tries three strategies in order:
 *   1. The raw text is already valid JSON.
 *   2. Strip markdown fences (``` json ... ```) then parse.
 *   3. Find the first { ... } block anywhere in the text and parse that.
 *
 * Strategy 3 is the critical safety net for geopolitical / ambiguous queries
 * where Claude adds an explanation before or after the JSON object.
 *
 * Throws a descriptive error (not a bare SyntaxError) if all three fail,
 * so callers can surface a meaningful message to the user.
 *
 * @param {string} raw  — raw text from response.content[0].text
 * @returns {Object}    — parsed JSON object
 */
function extractJson(raw) {
  // Strategy 1: already clean JSON
  try { return JSON.parse(raw.trim()); } catch {}

  // Strategy 2: strip markdown fences
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try { return JSON.parse(stripped); } catch {}

  // Strategy 3: pull the first {...} block out of surrounding prose.
  // Works even when Claude writes "Here is the analysis: { ... } Hope that helps!"
  // The slice from first { to last } captures the full object even with nesting.
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }

  throw new Error(
    `Failed to parse AI response as JSON. ` +
    `Raw response (first 300 chars): ${raw.slice(0, 300)}`
  );
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Engine] ANTHROPIC_API_KEY is not set in .env');
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Demo price fallbacks (kept in sync with agent.js / api.js) ───────────────
const DEMO_PROBS = {
  demo_fed_hold_v1:          82,
  demo_fed_hold_v2:          79,
  demo_house_dem_v1:         34,
  demo_house_dem_v2:         35,
  demo_wti_above_70:         68,
  demo_wti_at_or_below_70:   32,
  demo_unemp_above_43:       55,
  demo_unemp_at_or_below_43: 45,
  demo_fed_hike_march:       12,
  demo_gdp_below_20:         84,
  demo_cpi_above_fed_target: 78,
};

// =============================================================================
// STEP 1 — Parse the natural-language scenario
// =============================================================================

/**
 * Call Claude to extract the target market and direction from a user query.
 *
 * Provides Claude with the full list of market_metadata rows so it can match
 * the right market_key even when the user uses informal language.
 *
 * @param {string} userQuery   e.g. 'CPI comes in hot at 3.2%'
 * @param {Array}  markets     rows from market_metadata
 * @returns {{ target_market: string, assumed_change: string, direction: 'UP'|'DOWN' }}
 */
async function parseScenario(userQuery, markets) {
  const marketList = markets
    .map(m => `• ${m.market_key}: "${m.event_name}" — ${m.proposition_text ?? ''}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 512,
    system: `\
You are a prediction market analyst. Given a news scenario and a list of markets,
identify which single market is MOST directly affected and whether its YES
probability will increase (UP) or decrease (DOWN).

IMPORTANT RULES:
- You MUST always return a result. Never say "no market matches."
- If the scenario is geopolitical (war, sanctions, elections, etc.), map it to
  the most economically downstream market in the list. For example:
    • Middle East conflict / oil supply shock → oil price market
    • Geopolitical uncertainty / flight to safety → Fed rate / bond market
    • Election outcome → relevant political market
- Pick the single market that would move FIRST or MOST in reaction to the news.
- assumed_change must be ≤15 words and describe the primary economic effect.

Return ONLY a valid JSON object — no explanation, no markdown, nothing else:
{
  "target_market":  "<exact market_key from the list>",
  "assumed_change": "<primary economic effect in ≤15 words>",
  "direction":      "UP" | "DOWN"
}`,
    messages: [{
      role:    'user',
      content: `Scenario: "${userQuery}"\n\nAvailable markets:\n${marketList}`,
    }],
  });

  const raw = response.content[0]?.text ?? '';
  return extractJson(raw);
}

// =============================================================================
// STEP 2 — Load the market graph from Supabase
// =============================================================================

/**
 * Fetch all three tables needed for a full scenario run in one parallel batch.
 *
 * Returns:
 *   relationships — all rows from market_relationships
 *   markets       — all rows from market_metadata (for names / propositions)
 *   priceMap      — market_key → current probability_pct (live > demo fallback)
 */
async function loadMarketGraph() {
  const [
    { data: relationships, error: rErr },
    { data: markets,       error: mErr },
    { data: signals,       error: sErr },
  ] = await Promise.all([
    supabase.from('market_relationships').select('*'),
    supabase.from('market_metadata').select('*'),
    supabase
      .from('market_signals')
      .select('event_id, probability_pct, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  if (rErr) throw new Error(`market_relationships: ${rErr.message}`);
  if (mErr) throw new Error(`market_metadata: ${mErr.message}`);

  // Latest live probability per event_id (DESC order means first row is newest)
  const latestByEventId = {};
  for (const row of (signals ?? [])) {
    if (latestByEventId[row.event_id] == null) {
      latestByEventId[row.event_id] = row.probability_pct;
    }
  }

  // market_key → { probability_pct, event_name, proposition_text }
  const metaMap  = {};
  const priceMap = {};
  for (const m of (markets ?? [])) {
    metaMap[m.market_key] = {
      event_name:       m.event_name,
      proposition_text: m.proposition_text,
      resolution_date:  m.resolution_date,
    };

    // Priority: live Polymarket → live Kalshi → demo fallback → null
    let prob = DEMO_PROBS[m.market_key] ?? null;
    if (m.polymarket_token_id && latestByEventId[m.polymarket_token_id] != null) {
      prob = latestByEventId[m.polymarket_token_id];
    } else if (m.kalshi_ticker && latestByEventId[m.kalshi_ticker] != null) {
      prob = latestByEventId[m.kalshi_ticker];
    }
    priceMap[m.market_key] = prob;
  }

  return { relationships: relationships ?? [], markets: markets ?? [], metaMap, priceMap };
}

// =============================================================================
// STEP 3 — Graph traversal (BFS + circular-dependency guard)
// =============================================================================

/**
 * Given the current propagation direction and the relationship connecting two
 * markets, return the direction the downstream market will move.
 *
 * Mapping:
 *   equivalent          → same direction   (A↑ → B↑)
 *   mutually_exclusive  → opposite         (A↑ → B↓)
 *   implied             → same direction   (A=YES implies B=YES; A more likely → B more likely)
 *   implied_conditional → same direction   (alias used in some frontends)
 *   correlated/Positive → same direction
 *   correlated/Negative → opposite
 *   correlated/Neutral  → same direction (weak, but don't flip)
 *
 * @param {'UP'|'DOWN'} currentDir
 * @param {string}      relationshipType
 * @param {string}      impactDirection   — 'Positive' | 'Negative' | 'Neutral'
 * @returns {'UP'|'DOWN'}
 */
function propagateDirection(currentDir, relationshipType, impactDirection) {
  const flip = () => (currentDir === 'UP' ? 'DOWN' : 'UP');

  switch (relationshipType) {
    case 'equivalent':
    case 'implied':
    case 'implied_conditional':
      return currentDir;

    case 'mutually_exclusive':
      return flip();

    case 'correlated':
      return impactDirection === 'Negative' ? flip() : currentDir;

    default:
      return currentDir;
  }
}

/**
 * BFS traversal of the market relationship graph up to MAX_DEPTH levels.
 *
 * Circular-dependency protection: the `visited` Set ensures each market node
 * is processed at most once — the first (highest-confidence) path wins.
 *
 * Confidence decay: pathConfidence = product of all edge confidence_scores
 * along the path.  Paths that fall below MIN_PATH_CONF are pruned early.
 *
 * @param {string}  targetMarket      — the directly impacted market_key
 * @param {'UP'|'DOWN'} initialDir    — direction of the initial shock
 * @param {Array}   relationships     — all rows from market_relationships
 * @returns {Array} impacts sorted by confidence_score DESC
 */
function traverseGraph(targetMarket, initialDir, relationships) {
  // visited prevents infinite loops on cyclic graphs
  const visited = new Set([targetMarket]);
  const impacts  = [];

  // BFS queue entry:
  //   marketKey      — node being processed
  //   direction      — propagated direction arriving at this node
  //   depth          — 1 = first-order, 2 = second-order
  //   path           — ordered list of market_keys from target to this node
  //   pathConfidence — cumulative product of confidence_scores along the path
  const queue = [{
    marketKey:      targetMarket,
    direction:      initialDir,
    depth:          0,
    path:           [targetMarket],
    pathConfidence: 1.0,
  }];

  while (queue.length > 0) {
    const { marketKey, direction, depth, path, pathConfidence } = queue.shift();

    if (depth >= MAX_DEPTH) continue;

    // All edges where this market appears on either side
    const edges = relationships.filter(
      r => r.market_key_a === marketKey || r.market_key_b === marketKey
    );

    for (const rel of edges) {
      const neighbor = rel.market_key_a === marketKey
        ? rel.market_key_b
        : rel.market_key_a;

      // ── Circular dependency guard ──────────────────────────────────────────
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const edgeConfidence  = rel.confidence_score ?? 0.5;
      const newPathConf     = parseFloat((pathConfidence * edgeConfidence).toFixed(4));

      // Prune paths that are too weak to be meaningful
      if (newPathConf < MIN_PATH_CONF) continue;

      const newDir  = propagateDirection(direction, rel.relationship_type, rel.impact_direction);
      const newPath = [...path, neighbor];

      impacts.push({
        market_key:        neighbor,
        order:             depth + 1,           // 1 = first-order, 2 = second-order
        relationship_type: rel.relationship_type,
        direction:         newDir,
        confidence_score:  newPathConf,
        edge_confidence:   edgeConfidence,
        path:              newPath,
        // Relationship metadata — fed into the RAG prompt
        meta: {
          logic_justification: rel.logic_justification,
          vantage_insight:     rel.vantage_insight,
          impact_direction:    rel.impact_direction,
          correlation_strength: rel.correlation_strength,
          logical_layer:       rel.logical_layer,
          probability_a:       rel.probability_a,
          probability_b:       rel.probability_b,
          probability_spread:  rel.probability_spread,
        },
      });

      queue.push({
        marketKey:      neighbor,
        direction:      newDir,
        depth:          depth + 1,
        path:           newPath,
        pathConfidence: newPathConf,
      });
    }
  }

  // Highest-confidence impacts first
  return impacts.sort((a, b) => b.confidence_score - a.confidence_score);
}

// =============================================================================
// STEP 4 — RAG narrative generation
// =============================================================================

/**
 * Build the JSON context block that will be injected into Claude's prompt.
 * This is the RAG layer: Claude reasons over real relationship justifications
 * and current market prices rather than hallucinating from scratch.
 */
function buildRagContext(targetMarket, assumedChange, direction, impacts, priceMap, metaMap) {
  const targetMeta = metaMap[targetMarket] ?? {};

  return {
    scenario: {
      target_market:    targetMarket,
      event_name:       targetMeta.event_name ?? targetMarket,
      proposition:      targetMeta.proposition_text ?? '',
      assumed_change:   assumedChange,
      direction,
      current_probability_pct: priceMap[targetMarket] ?? null,
    },
    impacted_markets: impacts.map(imp => {
      const meta = metaMap[imp.market_key] ?? {};
      return {
        market_key:        imp.market_key,
        event_name:        meta.event_name ?? imp.market_key,
        proposition:       meta.proposition_text ?? '',
        order:             imp.order === 1 ? 'First-Order' : 'Second-Order',
        relationship_type: imp.relationship_type,
        direction:         imp.direction,
        confidence_score:  imp.confidence_score,
        current_probability_pct: priceMap[imp.market_key] ?? null,
        causal_path:       imp.path.join(' → '),
        // Pre-computed justifications from agent.js — the core of the RAG
        logic_justification: imp.meta.logic_justification,
        vantage_insight:     imp.meta.vantage_insight,
        impact_direction:    imp.meta.impact_direction,
        correlation_strength: imp.meta.correlation_strength,
        logical_layer:       imp.meta.logical_layer,
      };
    }),
  };
}

/**
 * Second Claude call: generate the executive summary and per-market impact
 * statements, augmented with the full graph JSON (RAG).
 *
 * @returns {{ executive_summary: string, market_impacts: Array }}
 */
async function generateNarratives(userQuery, ragContext) {
  if (ragContext.impacted_markets.length === 0) {
    return {
      executive_summary: `Scenario "${userQuery}" targets ${ragContext.scenario.target_market}, which has no connected markets in the current relationship graph.`,
      market_impacts:    [],
    };
  }

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2048,
    system: `\
You are a Senior Macro Risk Analyst writing a scenario stress-test report.

You will receive:
  • A macro scenario and the directly impacted prediction market
  • A graph of downstream markets with relationship types, confidence scores,
    causal paths, and pre-written economic justifications (RAG context)

Your output must be grounded in the provided RAG data — do not invent
relationships that are not present in the graph.

Rules for market_impacts statements:
  • Format EXACTLY: "If [Market A] moves [UP/DOWN], then [Market B] is [X]%
    likely to move [Y] because of their [relationship_type] link."
  • X = confidence_score × 100, rounded to the nearest integer
  • Lead with "[First-Order]" or "[Second-Order]" as a prefix
  • Incorporate the logic_justification from the RAG context

Return ONLY valid JSON — no markdown, no text outside the braces:
{
  "executive_summary": "<2–3 sentence paragraph covering the overall macro impact>",
  "market_impacts": [
    {
      "market_key": "<market_key>",
      "order": 1 or 2,
      "direction": "UP" | "DOWN",
      "confidence_pct": <integer>,
      "statement": "<impact statement per the format above>"
    }
  ]
}`,
    messages: [{
      role:    'user',
      content: `Scenario: "${userQuery}"\n\nRAG Context:\n${JSON.stringify(ragContext, null, 2)}`,
    }],
  });

  const raw = response.content[0]?.text ?? '';
  return extractJson(raw);
}

// =============================================================================
// STEP 5 — Persist the report
// =============================================================================

/**
 * Insert the completed scenario report into scenario_reports.
 *
 * Column mapping (Lovable schema → our internal data):
 *   query          ← userQuery
 *   trigger_market ← targetMarket
 *   causal_chain   ← impacts[]  (BFS traversal results)
 *   narrative      ← executive_summary + formatted impact statements (single text block)
 *   affected_nodes ← distinct market_key strings touched by the traversal (TEXT[])
 *   affected_edges ← source→target relationship objects traversed (JSONB[])
 *   status         ← 'completed'
 *
 * Returns the generated UUID on success, null on failure.
 */
async function saveReport(userQuery, targetMarket, assumedChange, direction, impacts, narratives) {
  // affected_nodes: every market key touched in the traversal
  const affected_nodes = impacts.map(i => i.market_key);

  // affected_edges: the source→target hops actually followed by BFS
  // Each impact records its full path, so we derive unique edges from consecutive pairs.
  const edgeSet = new Set();
  const affected_edges = [];
  for (const imp of impacts) {
    const path = imp.path ?? [];
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}→${path[i + 1]}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        affected_edges.push({
          source:            path[i],
          target:            path[i + 1],
          relationship_type: imp.relationship_type,
          direction:         imp.direction,
          confidence_score:  imp.edge_confidence,
        });
      }
    }
  }

  // narrative: single text block the frontend can render directly
  const impactLines = (narratives.market_impacts ?? [])
    .map(i => i.statement)
    .join('\n');
  const narrative = [
    narratives.executive_summary ?? '',
    impactLines ? `\n${impactLines}` : '',
  ].join('').trim();

  const { data, error } = await supabase
    .from('scenario_reports')
    .insert({
      query:          userQuery,
      trigger_market: targetMarket,
      causal_chain:   impacts,      // full BFS objects — frontend can drill in
      narrative,
      affected_nodes,               // Postgres TEXT[] from JS string[]
      affected_edges,
      status:         'completed',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42P01' || (error.message ?? '').includes('does not exist')) {
      console.error(
        '[Engine] ⚠  Table `scenario_reports` does not exist.\n' +
        '[Engine]    Run the SQL migration shown at the top of this file.'
      );
    } else {
      console.error('[Engine] Failed to save report:', error.message);
    }
    return null;
  }

  return data?.id ?? null;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Run a full scenario stress-test from a natural language query.
 *
 * Orchestrates all five steps and returns the complete report object.
 * Also pretty-prints a dashboard to stdout.
 *
 * @param {string} userQuery   e.g. 'CPI comes in hot at 3.2%'
 * @returns {Promise<Object>}  Full report with impacts + narratives
 */
async function predictScenario(userQuery) {
  const divider = '═'.repeat(62);
  const thin    = '─'.repeat(62);

  console.log(`\n${divider}`);
  console.log(`  SCENARIO ENGINE  |  ${new Date().toISOString()}`);
  console.log(`  Query: "${userQuery}"`);
  console.log(divider);

  // ── Step 1: Parse ────────────────────────────────────────────────────────
  console.log('\n[Engine] Step 1/5  Parsing scenario with Claude...');
  const { relationships, markets, metaMap, priceMap } = await loadMarketGraph();
  console.log(`[Engine]           Loaded ${markets.length} markets, ${relationships.length} relationships`);

  const { target_market, assumed_change, direction } = await parseScenario(userQuery, markets);
  console.log(`[Engine]           Target market : ${target_market}`);
  console.log(`[Engine]           Assumed change: ${assumed_change}`);
  console.log(`[Engine]           Direction     : ${direction} (YES probability)`);

  // Validate the extracted market exists
  if (!metaMap[target_market]) {
    console.warn(`[Engine] ⚠  "${target_market}" not found in market_metadata. Proceeding anyway.`);
  }

  // ── Step 2: BFS traversal ────────────────────────────────────────────────
  console.log('\n[Engine] Step 2/5  Traversing market graph (BFS, max depth 2)...');
  const impacts     = traverseGraph(target_market, direction, relationships);
  const firstOrder  = impacts.filter(i => i.order === 1);
  const secondOrder = impacts.filter(i => i.order === 2);
  console.log(`[Engine]           First-order impacts : ${firstOrder.length}`);
  console.log(`[Engine]           Second-order impacts: ${secondOrder.length}`);
  console.log(`[Engine]           Circular deps guarded by visited Set — ${
    relationships.length - impacts.length
  } edges skipped or pruned`);

  // ── Step 3: Build RAG context ─────────────────────────────────────────────
  console.log('\n[Engine] Step 3/5  Building RAG context...');
  const ragContext = buildRagContext(target_market, assumed_change, direction, impacts, priceMap, metaMap);
  console.log(`[Engine]           RAG payload: ${impacts.length} markets, ${
    JSON.stringify(ragContext).length
  } chars`);

  // ── Step 4: Generate narratives ───────────────────────────────────────────
  console.log('\n[Engine] Step 4/5  Generating narratives (Claude RAG pass)...');
  const narratives = await generateNarratives(userQuery, ragContext);
  console.log(`[Engine]           Generated ${narratives.market_impacts?.length ?? 0} impact statements`);

  // ── Step 5: Save report ───────────────────────────────────────────────────
  console.log('\n[Engine] Step 5/5  Saving report to scenario_reports...');
  const reportId = await saveReport(userQuery, target_market, assumed_change, direction, impacts, narratives);
  if (reportId) {
    console.log(`[Engine]           Saved  →  id: ${reportId}`);
  }

  // ── Terminal report ───────────────────────────────────────────────────────
  console.log(`\n${divider}`);
  console.log('  SCENARIO REPORT');
  console.log(divider);
  console.log(`\n  ${narratives.executive_summary ?? ''}\n`);

  if ((narratives.market_impacts ?? []).length > 0) {
    console.log(thin);
    const first  = (narratives.market_impacts ?? []).filter(i => i.order === 1);
    const second = (narratives.market_impacts ?? []).filter(i => i.order === 2);

    if (first.length > 0) {
      console.log('  FIRST-ORDER IMPACTS');
      console.log(thin);
      for (const imp of first) {
        console.log(`  ${imp.statement}`);
      }
    }
    if (second.length > 0) {
      console.log(`\n${thin}`);
      console.log('  SECOND-ORDER IMPACTS  (Ripple Effect)');
      console.log(thin);
      for (const imp of second) {
        console.log(`  ${imp.statement}`);
      }
    }
  }

  console.log(`\n${divider}\n`);

  return {
    report_id:     reportId,
    user_query:    userQuery,
    target_market,
    assumed_change,
    direction,
    impacts,
    narratives,
  };
}

// =============================================================================
// Module export  (for api.js → POST /api/scenario)
// =============================================================================

module.exports = { predictScenario };

// =============================================================================
// CLI entry point  →  node scenario_engine.js "CPI comes in at 3.2%"
// =============================================================================

if (require.main === module) {
  const userQuery = process.argv.slice(2).join(' ').trim();

  if (!userQuery) {
    console.error('[Engine] Usage: node scenario_engine.js "<scenario>"');
    console.error('[Engine] Example: node scenario_engine.js "CPI comes in hot at 3.2%"');
    process.exit(1);
  }

  predictScenario(userQuery)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Engine] Fatal:', err.message);
      process.exit(1);
    });
}
