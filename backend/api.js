'use strict';

/**
 * api.js
 *
 * Lightweight HTTP API server.
 *
 * Endpoints:
 *   GET /api/graph-data  — D3-compatible node-link JSON with hub detection
 *   GET /health          — liveness check
 *
 * Hub detection:
 *   Markets with > HUB_LINK_THRESHOLD implied/correlated links are tagged
 *   is_hub: true so the frontend can scale their visual radius.
 *
 * Run: node api.js
 */

require('dotenv').config();
const http = require('http');
const { supabase } = require('./supabaseClient');
const { predictScenario } = require('./scenario_engine');

const PORT               = parseInt(process.env.API_PORT ?? '3000', 10);
const HUB_LINK_THRESHOLD = 3;   // implied + correlated links required to be a hub

// Keep in sync with agent.js DEMO_PROBS
const DEMO_PROBS = {
  demo_fed_hold_v1:            82,
  demo_fed_hold_v2:            79,
  demo_house_dem_v1:           34,
  demo_house_dem_v2:           35,
  demo_wti_above_70:           68,
  demo_wti_at_or_below_70:     32,
  demo_unemp_above_43:         55,
  demo_unemp_at_or_below_43:   45,
  demo_fed_hike_march:         12,
  demo_gdp_below_20:           84,
  demo_cpi_above_fed_target:   78,
};

// D3 edge color per relationship type
const TYPE_COLOR = {
  equivalent:         '#4CAF50',  // green
  implied:            '#2196F3',  // blue
  mutually_exclusive: '#F44336',  // red
  correlated:         '#FF9800',  // orange
};

// ---------------------------------------------------------------------------
// Hub detection
// ---------------------------------------------------------------------------

/**
 * Count implied + correlated links per market key.
 * Returns a Map<market_key, count>.
 */
function buildLinkCounts(relationships) {
  const counts = new Map();
  for (const r of relationships) {
    if (r.relationship_type === 'implied' || r.relationship_type === 'correlated') {
      counts.set(r.market_key_a, (counts.get(r.market_key_a) ?? 0) + 1);
      counts.set(r.market_key_b, (counts.get(r.market_key_b) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------
async function buildGraphData() {
  const [
    { data: markets,       error: mErr },
    { data: relationships, error: rErr },
    { data: signals,       error: sErr },
  ] = await Promise.all([
    supabase.from('market_metadata').select('*'),
    supabase.from('market_relationships').select('*'),
    supabase
      .from('market_signals')
      .select('event_id, probability_pct, platform, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (mErr) throw new Error(`market_metadata: ${mErr.message}`);
  if (rErr) throw new Error(`market_relationships: ${rErr.message}`);

  // Latest probability per event_id from live signals
  const latestByEventId = {};
  for (const row of signals ?? []) {
    if (latestByEventId[row.event_id] == null) {
      latestByEventId[row.event_id] = row.probability_pct;
    }
  }

  // ── Hub detection ──────────────────────────────────────────────────────────
  const linkCounts = buildLinkCounts(relationships ?? []);
  const hubSet     = new Set(
    [...linkCounts.entries()]
      .filter(([, count]) => count > HUB_LINK_THRESHOLD)
      .map(([key]) => key)
  );

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const nodes = (markets ?? []).map(m => {
    // Probability priority: live Polymarket → live Kalshi → demo default → null
    let probability_pct = DEMO_PROBS[m.market_key] ?? null;

    if (m.polymarket_token_id && latestByEventId[m.polymarket_token_id] != null) {
      probability_pct = latestByEventId[m.polymarket_token_id];
    } else if (m.kalshi_ticker && latestByEventId[m.kalshi_ticker] != null) {
      probability_pct = latestByEventId[m.kalshi_ticker];
    }

    return {
      id:                   m.market_key,
      label:                m.event_name,
      proposition:          m.proposition_text,
      resolution_date:      m.resolution_date,
      settlement_source:    m.settlement_source,
      kalshi_ticker:        m.kalshi_ticker,
      polymarket_token_id:  m.polymarket_token_id,
      probability_pct,
      group:                m.market_key.startsWith('demo_') ? 'demo' : 'live',
      // Hub flag: frontend uses this to scale node size
      is_hub:               hubSet.has(m.market_key),
      hub_link_count:       linkCounts.get(m.market_key) ?? 0,
    };
  });

  // ── Links ─────────────────────────────────────────────────────────────────

  // Type-aware fallback copy used when logic_justification and vantage_insight
  // are both absent — guarantees every edge has a non-null justification string.
  const TYPE_FALLBACK = {
    equivalent:         'These markets track the same underlying event — prices should converge to ~100% combined.',
    mutually_exclusive: 'These markets are strict logical opposites — if one resolves YES, the other must resolve NO.',
    implied:            'Market A resolving YES structurally implies Market B also resolves YES.',
    correlated:         'These markets share a causal or statistical relationship — movements in one signal movements in the other.',
  };

  const links = (relationships ?? []).map(r => {
    // Justification priority:
    //   1. logic_justification  — full AI-generated economic reasoning (all types)
    //   2. vantage_insight      — punchy ≤10-word headline (all types)
    //   3. TYPE_FALLBACK        — static description by relationship_type
    const justification =
      (r.logic_justification ?? '').trim() ||
      (r.vantage_insight     ?? '').trim() ||
      TYPE_FALLBACK[r.relationship_type]   ||
      'No justification available.';

    // Spread context appended for equivalent / mutually_exclusive edges
    // so the hover tooltip surfaces the pricing gap immediately.
    const spreadNote =
      (r.relationship_type === 'equivalent' || r.relationship_type === 'mutually_exclusive') &&
      r.probability_spread != null
        ? ` | Spread: ${r.probability_spread.toFixed(1)}%${r.arbitrage_flag ? ' ⚠ ARBITRAGE' : ''}`
        : '';

    return {
      source:               r.market_key_a,
      target:               r.market_key_b,
      type:                 r.relationship_type,
      color:                TYPE_COLOR[r.relationship_type] ?? '#9E9E9E',
      confidence:           r.confidence_score,
      // Single field Lovable should bind to for hover tooltips — always populated.
      justification:        justification + spreadNote,
      // Kept for backwards compat with any existing frontend reads.
      label:                r.logic_justification,
      // Arbitrage fields
      arbitrage_flag:       r.arbitrage_flag,
      probability_spread:   r.probability_spread,
      // Macro Logic Agent v2 fields
      impact_direction:     r.impact_direction,
      correlation_strength: r.correlation_strength,
      logical_layer:        r.logical_layer,
      vantage_insight:      r.vantage_insight,
      risk_alert:           r.risk_alert,
    };
  });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const typeBreakdown = {};
  for (const l of links) {
    typeBreakdown[l.type] = (typeBreakdown[l.type] ?? 0) + 1;
  }

  const hubNodes = [...hubSet]
    .map(key => ({
      id:         key,
      label:      markets?.find(m => m.market_key === key)?.event_name ?? key,
      link_count: linkCounts.get(key) ?? 0,
    }))
    .sort((a, b) => b.link_count - a.link_count);

  return {
    nodes,
    links,
    meta: {
      generated_at:      new Date().toISOString(),
      node_count:        nodes.length,
      live_node_count:   nodes.filter(n => n.group === 'live').length,
      demo_node_count:   nodes.filter(n => n.group === 'demo').length,
      link_count:        links.length,
      type_breakdown:    typeBreakdown,
      arbitrage_count:   links.filter(l => l.arbitrage_flag).length,
      divergence_count:  links.filter(l => l.risk_alert).length,
      arbitrage_pairs:   links
        .filter(l => l.arbitrage_flag)
        .map(l => ({ source: l.source, target: l.target, spread: l.probability_spread })),
      hub_count:         hubSet.size,
      hub_nodes:         hubNodes,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, statusCode, body) {
  setCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;

  // GET /api/graph-data
  if (req.method === 'GET' && pathname === '/api/graph-data') {
    try {
      const data = await buildGraphData();
      console.log(
        `[API] /api/graph-data → ${data.nodes.length} nodes (${data.meta.hub_count} hubs), ` +
        `${data.links.length} links, ` +
        `${data.meta.arbitrage_count} arbitrage, ` +
        `${data.meta.divergence_count} divergences`
      );
      json(res, 200, data);
    } catch (err) {
      console.error('[API] Error building graph data:', err.message);
      json(res, 500, { error: err.message });
    }
    return;
  }

  // GET /health
  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // POST /api/scenario  — Scenario Stress-Testing Engine
  // Body: { "query": "CPI comes in at 3.2%" }
  if (req.method === 'POST' && pathname === '/api/scenario') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { query } = JSON.parse(body);
        if (!query || typeof query !== 'string' || !query.trim()) {
          json(res, 400, { error: 'Request body must include a non-empty "query" string.' });
          return;
        }
        console.log(`[API] POST /api/scenario  query="${query}"`);
        const report = await predictScenario(query.trim());
        json(res, 200, report);
      } catch (err) {
        console.error('[API] /api/scenario error:', err.message);
        json(res, 500, { error: err.message });
      }
    });
    return;
  }

  // GET /api/scenarios  — list saved reports (newest first)
  if (req.method === 'GET' && pathname === '/api/scenarios') {
    try {
      const { data, error } = await supabase
        .from('scenario_reports')
        .select('id, created_at, user_query, target_market, assumed_change, direction, first_order_count, second_order_count, executive_summary')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      json(res, 200, data ?? []);
    } catch (err) {
      console.error('[API] /api/scenarios error:', err.message);
      json(res, 500, { error: err.message });
    }
    return;
  }

  json(res, 404, {
    error: 'Not found',
    available_endpoints: ['/api/graph-data', '/api/scenario', '/api/scenarios', '/health'],
  });
});

server.listen(PORT, () => {
  console.log(`[API] ══════════════════════════════════════════`);
  console.log(`[API] Graph data server running`);
  console.log(`[API]   http://localhost:${PORT}/api/graph-data`);
  console.log(`[API]   http://localhost:${PORT}/health`);
  console.log(`[API] Hub threshold: >${HUB_LINK_THRESHOLD} implied/correlated links`);
  console.log(`[API] ══════════════════════════════════════════`);
});
