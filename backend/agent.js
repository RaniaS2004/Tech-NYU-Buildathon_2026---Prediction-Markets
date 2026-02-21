'use strict';

/**
 * agent.js — Advanced Macro Logic Agent v2
 *
 * Builds a Directed Acyclic Graph (DAG) of economic causation between
 * prediction markets using Claude claude-sonnet-4-6 with Chain-of-Thought reasoning.
 *
 * Chain-of-Thought dimensions (reasoned before classification):
 *   1. Temporal Hierarchy  — leading-indicator analysis based on resolution dates
 *   2. Conditionality      — conditional probability direction (A=YES → B more/less likely?)
 *   3. Synthetic Arbitrage — triangle / portfolio constraint detection
 *
 * Output fields per pair:
 *   relationship_type    — equivalent | implied | mutually_exclusive | correlated
 *   confidence_score     — float 0–1
 *   logic_justification  — 1-3 sentence economic reasoning
 *   impact_direction     — Positive | Negative | Neutral
 *   correlation_strength — Low | Medium | High | Extreme
 *   logical_layer        — Financial | Political | Statistical | Direct
 *   vantage_insight      — ≤10-word punchy UI headline
 *   arbitrage_flag       — HIGH_VALUE_ARBITRAGE_OPPORTUNITY when spread > 10%
 *   risk_alert           — VENUE_DIVERGENCE: Potential Arbitrage when spread > 5% (equivalent only)
 *   probability_spread   — absolute % divergence
 *
 * Hub detection (logged at end of run):
 *   Markets with > HUB_LINK_THRESHOLD implied/correlated links are flagged as hub nodes.
 *
 * Run: node agent.js
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabaseClient');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MODEL                    = 'claude-sonnet-4-6';
const CONCURRENCY_LIMIT        = 5;
const ARBITRAGE_THRESHOLD_PCT  = 10;   // arbitrage_flag threshold (existing)
const DIVERGENCE_THRESHOLD_PCT = 5;    // risk_alert (venue divergence) threshold
const HUB_LINK_THRESHOLD       = 3;    // min implied+correlated links to qualify as hub

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Agent] ANTHROPIC_API_KEY is not set in .env');
  process.exit(1);
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Demo probabilities
// Synthetic values for demo_ markets (not live-streamed).
//
// GDP Mismatch demo: demo_gdp_below_20 is intentionally set to 84 —
// the same level as the live gdp_q1_2026 market typically sits (~15-84%).
// When the agent classifies them as EQUIVALENT (same underlying GDP release),
// the absolute spread |liveGDP% - 84%| triggers a HIGH_VALUE_ARBITRAGE_OPPORTUNITY
// flag, demonstrating a ~69% market inefficiency in the demo scenario.
// ---------------------------------------------------------------------------
const DEMO_PROBS = {
  demo_fed_hold_v1:            82,
  demo_fed_hold_v2:            79,  // 3 pt divergence → detectable minor arb on EQUIVALENT pair
  demo_house_dem_v1:           34,
  demo_house_dem_v2:           35,  // 1 pt divergence → near-equivalent
  demo_wti_above_70:           68,
  demo_wti_at_or_below_70:     32,  // sum = 100 ✓ → clean MUTUALLY_EXCLUSIVE pair
  demo_unemp_above_43:         55,
  demo_unemp_at_or_below_43:   45,  // sum = 100 ✓
  demo_fed_hike_march:         12,  // complement of ~82% hold; fair = 18% → 6pt gap
  demo_gdp_below_20:           84,  // ← GDP MISMATCH DEMO (see note above)
  demo_cpi_above_fed_target:   78,
};

// ---------------------------------------------------------------------------
// System Prompt — Chain-of-Thought Macro Analyst
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `\
You are a Senior Macro Risk Analyst with deep expertise in derivatives pricing, \
arbitrage detection, and macro-economic interdependencies.

Analyze two prediction market contracts using structured Chain-of-Thought reasoning \
across three dimensions before delivering your final classification.

═══════════════════════════════════════════
STEP 1 — TEMPORAL HIERARCHY
═══════════════════════════════════════════
Compare resolution dates.
• Which market resolves first? Can it serve as a leading indicator for the later one?
• Example: CPI release (March 11) precedes the Fed decision (March 18). A hot CPI print \
directly raises the probability of a Fed hike — CPI is the leading indicator here.
• If Market A resolves after Market B, consider whether B could lead A instead.

═══════════════════════════════════════════
STEP 2 — CONDITIONALITY
═══════════════════════════════════════════
Assess whether Market B is conditional on Market A's outcome.
• Does A=YES make Market B significantly more or less likely to resolve YES?
• Example: "If Fed Hikes (A=YES), will GDP contract (B=YES)?" — B is conditional on A, \
  with a Negative impact (hike suppresses growth).
• Determine impact_direction:
  - Positive: A=YES raises P(B=YES)
  - Negative: A=YES lowers P(B=YES)
  - Neutral:  No meaningful directional relationship

═══════════════════════════════════════════
STEP 3 — SYNTHETIC ARBITRAGE
═══════════════════════════════════════════
Check for triangle / portfolio constraints involving these two markets.
• Do these two markets plus a third implied market form a set that must sum to ~100%?
• Example: P(Dem House) + P(Rep House) + P(Split Congress) = 100%.
  If P(Dem) = 34% and P(Rep) = 60%, then P(Split) must be ~6% — \
  any deviation is a synthetic arbitrage opportunity.
• Name the missing third leg if a triangle exists. Otherwise state 'None detected.'

═══════════════════════════════════════════
CLASSIFICATION TAXONOMY
═══════════════════════════════════════════
After completing the three reasoning steps, assign exactly one relationship type:

• equivalent       — Same real-world outcome measured from complementary angles. \
  Same underlying data release + complementary directional thresholds \
  (e.g. "above X%" and "below X%" on the same indicator and date). \
  Key test: does the same real-world event simultaneously determine both outcomes? \
  Probabilities should sum to ~100%. Deviation > 10 ppts = pricing inefficiency.

• implied          — Hierarchical/nested logic. If Market A resolves YES, \
  Market B MUST resolve YES. \
  Example: "GDP > 3.0%" implies "GDP > 2.0%" — the higher threshold guarantees the lower.

• mutually_exclusive — Strict logical opposites. A=YES forces B=NO with no overlap \
  and no possibility of both or neither occurring. \
  Example: "Democrats win House" vs "Republicans win House" (two-party winner-take-all).

• correlated       — Causal or statistical linkage. Movements in A's probability are \
  systematically associated with B, but neither logically implies nor excludes the other. \
  Example: rising oil prices increase the probability of above-target CPI.

IMPORTANT RULE — Same Economic Event, Complementary Framing:
When two markets track the same underlying data release with complementary thresholds \
(e.g. "above X%" and "below X%" on the same indicator and date), classify as equivalent. \
Their probabilities should sum to ~100%. Any deviation > 10 percentage points is a \
significant pricing inefficiency.

═══════════════════════════════════════════
FIELD DEFINITIONS
═══════════════════════════════════════════
correlation_strength — magnitude of the relationship:
  Low:     Weak association, easily broken by other factors
  Medium:  Moderate association, directionally reliable
  High:    Strong association, dominant causal or logical link
  Extreme: Near-deterministic (e.g. complementary thresholds on same release)

logical_layer — the domain driving the relationship:
  Financial:   Driven by asset pricing, rates, or monetary mechanisms
  Political:   Driven by elections, legislation, or policy decisions
  Statistical: Driven by data releases, econometric correlations
  Direct:      Structural identity (same event, different framing)

vantage_insight — a punchy ≤10-word headline summarizing the edge for a trader.
  Good examples:
    "CPI outcome will dictate Fed's March move"
    "Equivalent GDP bets across venues — easy arb"
    "Oil shock feeds directly into February CPI print"

═══════════════════════════════════════════
OUTPUT — Return ONLY valid JSON (no markdown, no text outside the JSON braces):
═══════════════════════════════════════════
{
  "reasoning": {
    "temporal_hierarchy": "<1-2 sentences: which resolves first, is it a leading indicator>",
    "conditionality": "<1-2 sentences: conditional direction and economic mechanism>",
    "synthetic_arbitrage": "<Triangle constraint with named missing leg, or 'None detected'>"
  },
  "relationship_type": "equivalent" | "implied" | "mutually_exclusive" | "correlated",
  "confidence_score": <float 0.0–1.0>,
  "logic_justification": "<1-3 sentences of economic or structural reasoning>",
  "impact_direction": "Positive" | "Negative" | "Neutral",
  "correlation_strength": "Low" | "Medium" | "High" | "Extreme",
  "logical_layer": "Financial" | "Political" | "Statistical" | "Direct",
  "vantage_insight": "<≤10-word punchy headline for UI tooltip>"
}`;

// ---------------------------------------------------------------------------
// Concurrency pool — processes tasks with at most `limit` in flight at once
// ---------------------------------------------------------------------------
async function pLimit(limit, tasks) {
  const queue = [...tasks];

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error('[Agent] Task error:', err.message);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
async function fetchMarkets() {
  const { data, error } = await supabase
    .from('market_metadata')
    .select('*')
    .order('resolution_date');
  if (error) throw new Error(`Failed to fetch markets: ${error.message}`);
  return data;
}

async function fetchLiveProbabilities(markets) {
  const polyIds     = markets.filter(m => m.polymarket_token_id).map(m => m.polymarket_token_id);
  const kalshiTicks = markets.filter(m => m.kalshi_ticker && !m.kalshi_ticker.startsWith('DEMO-')).map(m => m.kalshi_ticker);
  const allIds      = [...polyIds, ...kalshiTicks];

  if (allIds.length === 0) return {};

  const { data, error } = await supabase
    .from('market_signals')
    .select('event_id, probability_pct, platform, created_at')
    .in('event_id', allIds)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('[Agent] Could not fetch live probabilities:', error.message);
    return {};
  }

  // Latest probability per event_id (data is DESC by created_at)
  const latestByEventId = {};
  for (const row of data) {
    if (latestByEventId[row.event_id] == null) {
      latestByEventId[row.event_id] = row.probability_pct;
    }
  }

  // Map market_key → probability (prefer Polymarket over Kalshi)
  const probMap = {};
  for (const market of markets) {
    if (market.polymarket_token_id && latestByEventId[market.polymarket_token_id] != null) {
      probMap[market.market_key] = latestByEventId[market.polymarket_token_id];
    } else if (market.kalshi_ticker && latestByEventId[market.kalshi_ticker] != null) {
      probMap[market.market_key] = latestByEventId[market.kalshi_ticker];
    }
  }

  return probMap;
}

// ---------------------------------------------------------------------------
// AI classification
// ---------------------------------------------------------------------------
async function classifyPair(marketA, marketB, probA, probB) {
  const userContent = JSON.stringify({
    market_a: {
      market_key:              marketA.market_key,
      event_name:              marketA.event_name,
      proposition:             marketA.proposition_text,
      resolution_date:         marketA.resolution_date,
      settlement_source:       marketA.settlement_source,
      current_probability_pct: probA,
    },
    market_b: {
      market_key:              marketB.market_key,
      event_name:              marketB.event_name,
      proposition:             marketB.proposition_text,
      resolution_date:         marketB.resolution_date,
      settlement_source:       marketB.settlement_source,
      current_probability_pct: probB,
    },
  }, null, 2);

  let raw;
  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    });
    raw = response.content[0]?.text ?? '';
  } catch (err) {
    console.error(`[Agent] Claude error for ${marketA.market_key} ↔ ${marketB.market_key}:`, err.message);
    return null;
  }

  let parsed;
  try {
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error(`[Agent] Bad JSON for ${marketA.market_key} ↔ ${marketB.market_key}:`, raw.slice(0, 200));
    return null;
  }

  const {
    relationship_type,
    confidence_score,
    logic_justification,
    impact_direction,
    correlation_strength,
    logical_layer,
    vantage_insight,
    reasoning,
  } = parsed;

  // ── Consistency check / arbitrage + divergence detection ─────────────────
  let arbitrage_flag    = null;
  let risk_alert        = null;
  let probability_spread = null;
  let justification     = logic_justification;

  if (probA != null && probB != null) {
    if (relationship_type === 'equivalent') {
      probability_spread = Math.abs(probA - probB);

      // risk_alert: lower bar (5%) — venue divergence / potential arbitrage
      if (probability_spread > DIVERGENCE_THRESHOLD_PCT) {
        risk_alert = 'VENUE_DIVERGENCE: Potential Arbitrage';
      }

      // arbitrage_flag: high-value bar (10%) — appends detail to justification
      if (probability_spread > ARBITRAGE_THRESHOLD_PCT) {
        arbitrage_flag = 'HIGH_VALUE_ARBITRAGE_OPPORTUNITY';

        const isGdpMismatch =
          (marketA.market_key === 'gdp_q1_2026' && marketB.market_key === 'demo_gdp_below_20') ||
          (marketB.market_key === 'gdp_q1_2026' && marketA.market_key === 'demo_gdp_below_20');

        const gdpNote = isGdpMismatch
          ? ` GDP Mismatch: The live "above 2.0%" market and the demo "below 2.0%" complement ` +
            `are both tracking the same BEA Q1 2026 GDP release. ` +
            `With a ${probability_spread.toFixed(1)}% spread between them, ` +
            `this represents a ${probability_spread.toFixed(0)}% market inefficiency — ` +
            `a trader buying the underpriced side captures near-riskless profit.`
          : '';

        justification =
          `${logic_justification} ` +
          `[ARBITRAGE DETECTED: ${probability_spread.toFixed(1)}% spread — ` +
          `${marketA.market_key} at ${probA.toFixed(1)}% vs ` +
          `${marketB.market_key} at ${probB.toFixed(1)}%. ` +
          `These equivalent markets should converge; the gap is a pricing inefficiency.]` +
          gdpNote;
      }

    } else if (relationship_type === 'mutually_exclusive') {
      // Mutually exclusive pair probabilities must sum to ~100%.
      const pairSum      = probA + probB;
      probability_spread = Math.abs(pairSum - 100);

      if (probability_spread > ARBITRAGE_THRESHOLD_PCT) {
        arbitrage_flag = 'HIGH_VALUE_ARBITRAGE_OPPORTUNITY';
        justification  =
          `${logic_justification} ` +
          `[ARBITRAGE DETECTED: Probabilities sum to ${pairSum.toFixed(1)}% (should be ~100%). ` +
          `The ${probability_spread.toFixed(1)}% excess is a potential arbitrage opportunity.]`;
      }
    }
  }

  // Canonical pair ordering (alphabetical) prevents duplicate (A,B) / (B,A) rows
  const [keyA, keyB] = [marketA.market_key, marketB.market_key].sort();

  return {
    market_key_a:        keyA,
    market_key_b:        keyB,
    relationship_type,
    confidence_score:    parseFloat(confidence_score),
    logic_justification: justification,
    arbitrage_flag,
    risk_alert,
    probability_a:       probA,
    probability_b:       probB,
    probability_spread,
    impact_direction:    impact_direction     ?? 'Neutral',
    correlation_strength: correlation_strength ?? 'Medium',
    logical_layer:       logical_layer        ?? 'Financial',
    vantage_insight:     vantage_insight      ?? null,
    // _reasoning is logged below but stripped before DB upsert
    _reasoning:          reasoning,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
async function storeRelationship(rel) {
  // Strip internal CoT field not present in the schema
  const { _reasoning, ...record } = rel;

  const { error } = await supabase
    .from('market_relationships')
    .upsert(record, { onConflict: 'market_key_a,market_key_b' });

  if (error) {
    console.error('[Agent] Supabase upsert error:', error.message,
      `(${rel.market_key_a} ↔ ${rel.market_key_b})`);
  }
}

// ---------------------------------------------------------------------------
// Hub detection — markets with > HUB_LINK_THRESHOLD implied/correlated links
// ---------------------------------------------------------------------------
function detectHubs(results) {
  const linkCounts = {};
  for (const rel of results) {
    if (rel.relationship_type === 'implied' || rel.relationship_type === 'correlated') {
      linkCounts[rel.market_key_a] = (linkCounts[rel.market_key_a] ?? 0) + 1;
      linkCounts[rel.market_key_b] = (linkCounts[rel.market_key_b] ?? 0) + 1;
    }
  }
  return Object.entries(linkCounts)
    .filter(([, count]) => count > HUB_LINK_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ market_key: key, link_count: count }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function runAgent() {
  console.log('[Agent] ══════════════════════════════════════════');
  console.log('[Agent] Advanced Macro Logic Agent v2');
  console.log('[Agent] Model:', MODEL);
  console.log('[Agent] CoT: Temporal Hierarchy + Conditionality + Synthetic Arbitrage');
  console.log('[Agent] ══════════════════════════════════════════');

  const markets = await fetchMarkets();
  console.log(`[Agent] Loaded ${markets.length} markets from market_metadata`);

  const liveProbMap = await fetchLiveProbabilities(markets);
  console.log(`[Agent] Live probabilities: ${Object.keys(liveProbMap).length} markets`);

  // Merge: live data overrides demo defaults
  const probMap = { ...DEMO_PROBS, ...liveProbMap };

  // Generate all unique pairs  n*(n-1)/2
  const pairs = [];
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      pairs.push([markets[i], markets[j]]);
    }
  }
  console.log(`[Agent] Analyzing ${pairs.length} unique pairs (concurrency: ${CONCURRENCY_LIMIT})…\n`);

  let stored    = 0;
  let skipped   = 0;
  let arbitrage = 0;
  let divergence = 0;
  const storedResults = [];

  const tasks = pairs.map(([a, b]) => async () => {
    const probA = probMap[a.market_key] ?? null;
    const probB = probMap[b.market_key] ?? null;

    const rel = await classifyPair(a, b, probA, probB);
    if (!rel) { skipped++; return; }

    await storeRelationship(rel);
    stored++;
    storedResults.push(rel);

    if (rel.arbitrage_flag) arbitrage++;
    if (rel.risk_alert)     divergence++;

    const arbTag      = rel.arbitrage_flag                       ? '  🚨 ARBITRAGE'   : '';
    const divTag      = rel.risk_alert && !rel.arbitrage_flag    ? '  ⚠️  DIVERGENCE'  : '';
    const spreadTag   = rel.probability_spread != null
      ? `  spread: ${rel.probability_spread.toFixed(1)}%`
      : '';
    const layerTag    = `  [${rel.logical_layer}/${rel.correlation_strength}/${rel.impact_direction}]`;
    const insightLine = rel.vantage_insight
      ? `\n         💡 "${rel.vantage_insight}"`
      : '';

    // Log CoT reasoning summary for arbitrage-flagged pairs
    if ((rel.arbitrage_flag || rel.risk_alert) && rel._reasoning) {
      console.log(`[Agent] CoT for ${a.market_key} ↔ ${b.market_key}:`);
      if (rel._reasoning.temporal_hierarchy)  console.log(`   T: ${rel._reasoning.temporal_hierarchy}`);
      if (rel._reasoning.conditionality)      console.log(`   C: ${rel._reasoning.conditionality}`);
      if (rel._reasoning.synthetic_arbitrage) console.log(`   S: ${rel._reasoning.synthetic_arbitrage}`);
    }

    console.log(
      `[Agent] ${String(stored).padStart(3)}/${pairs.length}  ` +
      `${a.market_key} ↔ ${b.market_key}\n` +
      `         → ${rel.relationship_type.toUpperCase().padEnd(20)} ` +
      `conf: ${(rel.confidence_score * 100).toFixed(0)}%` +
      spreadTag + layerTag + arbTag + divTag + insightLine
    );
  });

  await pLimit(CONCURRENCY_LIMIT, tasks);

  // ── Hub detection ──────────────────────────────────────────────────────────
  const hubs = detectHubs(storedResults);

  console.log('\n[Agent] ══════════════════════════════════════════');
  console.log('[Agent] Done.');
  console.log(`[Agent]   Pairs analyzed    : ${pairs.length}`);
  console.log(`[Agent]   Stored            : ${stored}`);
  console.log(`[Agent]   Skipped (error)   : ${skipped}`);
  console.log(`[Agent]   Arbitrage flags   : ${arbitrage}`);
  console.log(`[Agent]   Venue divergences : ${divergence}`);
  console.log(`[Agent]   Hub nodes (>${HUB_LINK_THRESHOLD} implied/corr links): ${hubs.length}`);
  if (hubs.length > 0) {
    for (const hub of hubs) {
      console.log(`[Agent]     • ${hub.market_key}  (${hub.link_count} links)`);
    }
  }
  console.log('[Agent] ══════════════════════════════════════════');
}

runAgent().catch(err => {
  console.error('[Agent] Fatal:', err.message);
  process.exit(1);
});
