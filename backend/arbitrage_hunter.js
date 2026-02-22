'use strict';

/**
 * arbitrage_hunter.js — Alpha Opportunity Execution Agent
 *
 * Monitors price discrepancies across equivalent prediction markets.
 * Polls every 30 seconds, flags pairs where spread > 3% AND both sides
 * have liquidity_depth_usd > $500 as Alpha Opportunities, then logs
 * each hit to the `arbitrage_alerts` table (feeds the frontend Alpha Feed).
 *
 * ── Required Supabase Migration (run once in the SQL Editor) ──────────────
 * CREATE TABLE IF NOT EXISTS arbitrage_alerts (
 *   id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   timestamp            timestamptz NOT NULL    DEFAULT now(),
 *   market_pair          text        NOT NULL,
 *   spread               numeric(6,3) NOT NULL,
 *   potential_profit_pct numeric(6,3) NOT NULL,
 *   status               text        NOT NULL    DEFAULT 'ALERT'
 * );
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Run: node arbitrage_hunter.js
 */

require('dotenv').config();
const { supabase } = require('./supabaseClient');

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;   // Scan cadence (ms)
const SPREAD_THRESHOLD = 3.0;      // Min probability spread (%) to flag
const LIQUIDITY_THRESHOLD = 500;      // Min liquidity depth (USD) required per side

// ── Session state ─────────────────────────────────────────────────────────────
let sessionAlertCount = 0;
let cycleCount = 0;

// ── Data layer ────────────────────────────────────────────────────────────────

/**
 * Fetch all rows from market_relationships where relationship_type = 'equivalent'.
 * @returns {Array<{market_key_a: string, market_key_b: string}>}
 */
async function fetchEquivalentPairs() {
  const { data, error } = await supabase
    .from('market_relationships')
    .select('market_key_a, market_key_b')
    .eq('relationship_type', 'equivalent');

  if (error) {
    console.error('[Hunter] Failed to fetch equivalent pairs:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Build a map of market_key → primary event_id (polymarket_token_id preferred,
 * kalshi_ticker as fallback). Mirrors the priority used by agent.js.
 * @returns {Object.<string, string>}
 */
async function fetchMetadataMap() {
  const { data, error } = await supabase
    .from('market_metadata')
    .select('market_key, polymarket_token_id, kalshi_ticker');

  if (error) {
    console.error('[Hunter] Failed to fetch market metadata:', error.message);
    return {};
  }

  const map = {};
  for (const row of (data ?? [])) {
    const eventId = row.polymarket_token_id ?? row.kalshi_ticker ?? null;
    if (eventId) map[row.market_key] = eventId;
  }
  return map;
}

/**
 * Fetch the most recent market_signals entry for each event_id in `eventIds`.
 * Uses a single batch query ordered DESC by created_at, then picks the first
 * row seen per event_id — matching the strategy in agent.js fetchLiveProbabilities.
 *
 * @param {string[]} eventIds
 * @returns {Object.<string, {probability_pct: number, liquidity_depth_usd: number}>}
 */
async function fetchLatestSignals(eventIds) {
  if (eventIds.length === 0) return {};

  const { data, error } = await supabase
    .from('market_signals')
    .select('event_id, probability_pct, liquidity_depth_usd, created_at')
    .in('event_id', eventIds)
    .order('created_at', { ascending: false })
    .limit(1000); // Max Supabase page; sufficient for up to ~50 event_ids × 20 rows each

  if (error) {
    console.error('[Hunter] Failed to fetch market signals:', error.message);
    return {};
  }

  // Pick the first (most recent) row per event_id.
  const latest = {};
  for (const row of (data ?? [])) {
    if (latest[row.event_id] == null) {
      latest[row.event_id] = {
        probability_pct: row.probability_pct,
        liquidity_depth_usd: row.liquidity_depth_usd ?? 0,
      };
    }
  }
  return latest;
}

// ── Alert insertion ───────────────────────────────────────────────────────────

/**
 * Write a single alert record to arbitrage_alerts.
 * Returns true on success, false on failure.
 */
async function insertAlert(marketPair, spread, potentialProfitPct, status = 'ALERT') {
  const { error } = await supabase
    .from('arbitrage_alerts')
    .insert({
      timestamp: new Date().toISOString(),
      market_pair: marketPair,
      spread: parseFloat(spread.toFixed(3)),
      potential_profit_pct: parseFloat(potentialProfitPct.toFixed(3)),
      status,
    });

  if (error) {
    // Surface a clear message if the migration hasn't been run yet.
    if (error.code === '42P01' || (error.message ?? '').includes('does not exist')) {
      console.error(
        '[Hunter] ⚠  Table `arbitrage_alerts` does not exist.\n' +
        '[Hunter]    Run the SQL migration shown at the top of this file\n' +
        '[Hunter]    in your Supabase SQL Editor, then restart.'
      );
    } else {
      console.error('[Hunter] Alert insert failed:', error.message);
    }
    return false;
  }
  return true;
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function runScan() {
  cycleCount++;
  const scanStart = Date.now();

  // Step 1 — fetch equivalent pairs
  const pairs = await fetchEquivalentPairs();
  if (pairs.length === 0) {
    printDashboard(0, 0, [], 'No equivalent pairs in market_relationships yet.');
    return;
  }

  // Step 2 — build market_key → event_id lookup
  const metaMap = await fetchMetadataMap();

  // Step 3 — collect all unique event_ids required by the pairs
  const neededIds = new Set();
  for (const { market_key_a, market_key_b } of pairs) {
    if (metaMap[market_key_a]) neededIds.add(metaMap[market_key_a]);
    if (metaMap[market_key_b]) neededIds.add(metaMap[market_key_b]);
  }

  // Step 4 — batch-fetch latest signals
  const signalMap = await fetchLatestSignals([...neededIds]);

  // Step 5 — evaluate each pair
  let highestSpread = 0;
  let cycleAlerts = 0;
  const opportunities = [];

  for (const { market_key_a, market_key_b } of pairs) {
    const idA = metaMap[market_key_a];
    const idB = metaMap[market_key_b];

    const sigA = idA ? signalMap[idA] : null;
    const sigB = idB ? signalMap[idB] : null;

    // Guard: skip pair if either side has missing or null price data
    if (sigA == null || sigB == null) continue;
    if (sigA.probability_pct == null || sigB.probability_pct == null) continue;

    const spread = Math.abs(sigA.probability_pct - sigB.probability_pct);
    const liquidityA = sigA.liquidity_depth_usd ?? 0;
    const liquidityB = sigB.liquidity_depth_usd ?? 0;

    if (spread > highestSpread) highestSpread = spread;

    // Flag as Alpha Opportunity only if spread AND liquidity thresholds both pass
    if (spread > SPREAD_THRESHOLD && liquidityA > LIQUIDITY_THRESHOLD && liquidityB > LIQUIDITY_THRESHOLD) {
      const marketPair = `${market_key_a} ↔ ${market_key_b}`;
      const potentialProfit = spread; // Theoretical edge = full spread on equivalent markets

      const inserted = await insertAlert(marketPair, spread, potentialProfit, 'ALERT');
      if (inserted) {
        sessionAlertCount++;
        cycleAlerts++;
      }

      opportunities.push({
        marketPair,
        spread,
        potentialProfit,
        probA: sigA.probability_pct,
        probB: sigB.probability_pct,
        liquidityA,
        liquidityB,
        inserted,
      });
    }
  }

  const elapsedMs = Date.now() - scanStart;
  printDashboard(pairs.length, highestSpread, opportunities, null, elapsedMs);
}

// ── Terminal dashboard ────────────────────────────────────────────────────────

function printDashboard(pairsMonitored, highestSpread, opportunities, warning, elapsedMs = 0) {
  const ts = new Date().toISOString();
  const wide = '═'.repeat(62);
  const thin = '─'.repeat(62);

  console.log(`\n${wide}`);
  console.log(`  ARBITRAGE HUNTER  |  Cycle #${String(cycleCount).padEnd(4)}  |  ${ts}`);
  console.log(wide);
  console.log(`  Total equivalent pairs monitored : ${String(pairsMonitored).padStart(4)}`);
  console.log(`  Highest spread this cycle        : ${highestSpread.toFixed(2).padStart(7)}%`);
  console.log(`  Alerts triggered (session total) : ${String(sessionAlertCount).padStart(4)}`);
  console.log(`  Scan completed in                : ${String(elapsedMs).padStart(4)} ms`);

  if (warning) {
    console.log(`\n  ⚠  ${warning}`);
  }

  if (opportunities.length > 0) {
    console.log(`\n${thin}`);
    console.log('  ALPHA OPPORTUNITIES');
    console.log(thin);
    for (const opp of opportunities) {
      const dbStatus = opp.inserted ? '✓ logged' : '✗ log failed';
      console.log(`  PAIR   : ${opp.marketPair}`);
      console.log(`  SPREAD : ${opp.spread.toFixed(2)}%  →  A: ${opp.probA.toFixed(1)}%  |  B: ${opp.probB.toFixed(1)}%`);
      console.log(`  LIQUID : A = $${opp.liquidityA.toFixed(0).padStart(8)}    B = $${opp.liquidityB.toFixed(0).padStart(8)}`);
      console.log(`  EDGE   : ~${opp.potentialProfit.toFixed(2)}% theoretical profit  [${dbStatus}]`);
      console.log(thin);
    }
  } else {
    console.log(
      `\n  No opportunities above thresholds ` +
      `(spread > ${SPREAD_THRESHOLD}%, liquidity > $${LIQUIDITY_THRESHOLD} per side).`
    );
  }

  const nextScanSecs = Math.round(POLL_INTERVAL_MS / 1000);
  console.log(`\n  Next scan in ${nextScanSecs}s  (Ctrl+C to stop)`);
  console.log(`${wide}\n`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Hunter] Received ${signal}.`);
  console.log(`[Hunter] Session summary: ${sessionAlertCount} alert(s) across ${cycleCount} scan cycle(s).`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('[Hunter] ══════════════════════════════════════════════════');
  console.log('[Hunter] Arbitrage Hunter — Alpha Opportunity Execution Agent');
  console.log(`[Hunter] Spread threshold  : > ${SPREAD_THRESHOLD}%`);
  console.log(`[Hunter] Liquidity minimum : > $${LIQUIDITY_THRESHOLD} per side`);
  console.log(`[Hunter] Poll interval     : ${POLL_INTERVAL_MS / 1000}s`);
  console.log('[Hunter] ══════════════════════════════════════════════════\n');

  // Run the first scan immediately, then repeat on the configured interval.
  await runScan().catch(err => console.error('[Hunter] Scan error:', err.message));

  setInterval(
    () => runScan().catch(err => console.error('[Hunter] Scan error:', err.message)),
    POLL_INTERVAL_MS
  );
}

main().catch(err => {
  console.error('[Hunter] Fatal:', err.message);
  process.exit(1);
});
