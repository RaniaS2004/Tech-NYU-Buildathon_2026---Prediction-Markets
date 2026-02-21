'use strict';

/**
 * aggregator.js
 *
 * Real-time prediction market data aggregator.
 *
 * Connects to:
 *   • Polymarket CLOB WebSocket  (market + book channels)
 *   • Kalshi v2 WebSocket        (trade + ticker channels)
 *
 * Normalizes all incoming messages into the unified market_signals schema
 * and bulk-inserts them into Supabase via BatchInserter.
 *
 * Resilience: exponential backoff reconnect on every source independently.
 */

require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { BatchInserter } = require('./supabaseClient');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const KALSHI_WS_URL = 'wss://api.elections.kalshi.com/trade-api/ws/v2';

const POLYMARKET_MARKET_IDS = (process.env.POLYMARKET_MARKET_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const KALSHI_MARKET_TICKERS = (process.env.KALSHI_MARKET_TICKERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const KALSHI_API_KEY = process.env.KALSHI_API_KEY ?? '';
const KALSHI_PRIVATE_KEY_BASE64 = process.env.KALSHI_PRIVATE_KEY_BASE64 ?? '';

const RECONNECT_BASE_DELAY = parseInt(
  process.env.RECONNECT_BASE_DELAY_MS ?? '1000',
  10
);
const RECONNECT_MAX_DELAY = parseInt(
  process.env.RECONNECT_MAX_DELAY_MS ?? '30000',
  10
);

// ---------------------------------------------------------------------------
// Shared inserter — both connectors push into the same batch queue.
// ---------------------------------------------------------------------------
const inserter = new BatchInserter();

// Shared state cache — single source of truth for market microstructure data.
// Polymarket entries (keyed by asset_id): { depth: number, bestBid: number, bestAsk: number }
// Kalshi entries    (keyed by market_ticker): { yesBid: number, yesAsk: number, spread: number, volume: number }
const marketStateCache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value to [0, 1]. Some APIs return integers (0–100) or floats
 * slightly outside the valid probability range due to floating-point math.
 */
function normProb(raw) {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  // If the value looks like a cents integer (1–100), scale it.
  if (n > 1) return Math.min(n / 100, 1);
  return Math.max(0, Math.min(n, 1));
}

/**
 * Sleep for `ms` milliseconds.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Compute the next reconnect delay using capped exponential backoff.
 */
function nextDelay(attempt) {
  const jitter = Math.random() * 500;
  return Math.min(RECONNECT_BASE_DELAY * 2 ** attempt + jitter, RECONNECT_MAX_DELAY);
}

/**
 * Unified confidence score in [0, 100] combining depth and spread signals.
 *
 * Depth component  (max 60 pts, log scale): $0→0, $100→20, $1k→30, $10k→40, $1M→60
 * Spread component (max 40 pts, linear):    0%→40, 10%→20, 20%+→0; null→20 (neutral)
 *
 * Usage: confidence_flag = 'LOW_CONFIDENCE' when score < 50.
 */
function calculateUnifiedConfidence(depth, spreadPct) {
  const depthScore = depth > 0
    ? Math.min(Math.log10(depth) * 10, 60)
    : 0;

  const spreadScore = spreadPct != null
    ? Math.max(0, 40 - spreadPct * 2)
    : 20; // neutral when no spread data

  return Math.round(Math.min(Math.max(depthScore + spreadScore, 0), 100));
}

/**
 * Compute order-book liquidity depth within 2% of mid-price.
 *
 * @param {Array<[number, number]>} bids - Array of [price, size] pairs (best bid first).
 * @param {Array<[number, number]>} asks - Array of [price, size] pairs (best ask first).
 * @param {number} mid - Mid-price as a float.
 * @returns {number} Total USD value of qualifying bid + ask levels. 0 if mid is 0 or arrays empty.
 */
function computePolymarketBookDepth(bids, asks, mid) {
  if (!mid || !Array.isArray(bids) || !Array.isArray(asks)) return 0;
  if (bids.length === 0 && asks.length === 0) return 0;

  const lowerBound = mid * 0.98;
  const upperBound = mid * 1.02;

  // Polymarket book entries are objects: { price: "0.65", size: "100" }
  const getPrice = (e) => parseFloat(e.price ?? e[0]);
  const getSize  = (e) => parseFloat(e.size  ?? e[1]);

  const bidDepth = bids
    .filter((e) => getPrice(e) >= lowerBound)
    .reduce((sum, e) => sum + getPrice(e) * getSize(e), 0);

  const askDepth = asks
    .filter((e) => getPrice(e) <= upperBound)
    .reduce((sum, e) => sum + getPrice(e) * getSize(e), 0);

  return bidDepth + askDepth;
}

// ---------------------------------------------------------------------------
// Kalshi Authentication
// ---------------------------------------------------------------------------

/**
 * Builds the RSA-PSS Authorization headers required by Kalshi v2.
 *
 * Kalshi expects:
 *   KALSHI-ACCESS-KEY:       the API key UUID
 *   KALSHI-ACCESS-TIMESTAMP: Unix milliseconds as a string
 *   KALSHI-ACCESS-SIGNATURE: base64( RSA-PSS-SHA256( timestamp + method + path ) )
 *
 * Algorithm details (from Kalshi docs):
 *   - RSA-PSS padding, MGF1 with SHA-256, salt length = 32 (SHA-256 digest size)
 *   - Message = timestamp || "GET" || path  (plain concatenation, no separators)
 */
function kalshiAuthHeaders(apiKey, privateKeyBase64) {
  if (!apiKey || !privateKeyBase64) return {};

  try {
    const ts = Date.now().toString();
    const path = '/trade-api/ws/v2';
    const msgToSign = `${ts}GET${path}`;

    const privateKeyPem = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    const signature = crypto
      .sign('SHA256', Buffer.from(msgToSign), {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      })
      .toString('base64');

    return {
      'KALSHI-ACCESS-KEY': apiKey,
      'KALSHI-ACCESS-TIMESTAMP': ts,
      'KALSHI-ACCESS-SIGNATURE': signature,
    };
  } catch (err) {
    console.warn('[Kalshi] Failed to generate auth headers:', err.message);
    return {};
  }
}

function kalshiAuthHeadersWithLog(apiKey, privateKeyBase64) {
  const headers = kalshiAuthHeaders(apiKey, privateKeyBase64);
  if (Object.keys(headers).length === 0) {
    console.error('[Kalshi] AUTH FAILED — empty headers. Check KALSHI_API_KEY and KALSHI_PRIVATE_KEY_BASE64.');
  } else {
    console.log('[Kalshi] Auth headers generated OK (key:', apiKey.slice(0, 8) + '…)');
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Polymarket Normalizers
// ---------------------------------------------------------------------------

/**
 * Normalize a Polymarket CLOB market-channel event into the unified schema.
 *
 * Handles three event types from the /ws/market endpoint:
 *   trade        — { event_type:"trade", asset_id, price, size, side, timestamp }
 *   last_trade_price — { event_type:"last_trade_price", asset_id, price, timestamp }
 *   price_change — { event_type:"price_change", asset_id, best_bid, best_ask, timestamp }
 *
 * Price priority: midpoint of best_bid/best_ask → trade price → 0.
 */
function normalizePolymarketTrade(msg) {
  const bid = parseFloat(msg.best_bid ?? 0);
  const ask = parseFloat(msg.best_ask ?? 0);
  const mid = bid && ask ? (bid + ask) / 2 : 0;
  const price = normProb(mid || msg.price);

  // Pull microstructure state written by the book snapshot handler.
  const state = marketStateCache.get(msg.asset_id ?? msg.market) ?? {};
  const liquidity_depth_usd = state.depth ?? 0;
  const cachedBid = state.bestBid ?? 0;
  const cachedAsk = state.bestAsk ?? 0;
  const bid_ask_spread_pct = cachedBid && cachedAsk
    ? ((cachedAsk - cachedBid) / ((cachedAsk + cachedBid) / 2)) * 100
    : null;

  const liquidity_score = calculateUnifiedConfidence(liquidity_depth_usd, bid_ask_spread_pct);
  const confidence_flag = liquidity_score < 50 ? 'LOW_CONFIDENCE' : null;

  return {
    id: uuidv4(),
    timestamp: msg.timestamp
      ? new Date(parseInt(msg.timestamp, 10)).toISOString()
      : new Date().toISOString(),
    platform: 'polymarket',
    event_id: msg.asset_id ?? msg.market ?? 'unknown',
    proposition_name:
      msg.question ??
      msg.market_slug ??
      `Polymarket-${(msg.asset_id ?? '').slice(0, 8)}`,
    price,
    side: (msg.side ?? 'BUY').toLowerCase() === 'buy' ? 'buy' : 'sell',
    size: parseFloat(msg.size ?? 0),
    liquidity_score,
    probability_pct: price * 100,
    liquidity_depth_usd,
    bid_ask_spread_pct,
    volume_24h: null,
    confidence_flag,
    raw_payload: msg,
  };
}

// ---------------------------------------------------------------------------
// Kalshi Normalizers
// ---------------------------------------------------------------------------

/**
 * Normalize a Kalshi trade message into the unified schema.
 *
 * Kalshi trade payload (type: "trade"):
 * {
 *   type: "trade",
 *   msg: {
 *     market_ticker: "FED-25JAN-T5.25",
 *     yes_price: 65,          ← cents (1–99)
 *     no_price: 35,
 *     count: 10,              ← number of contracts
 *     taker_side: "yes" | "no",
 *     ts: 1700000000000,      ← Unix ms
 *   }
 * }
 */
function normalizeKalshiTrade(data) {
  const msg = data.msg ?? data;
  const takerSide = (msg.taker_side ?? 'yes').toLowerCase();
  const rawPrice  = takerSide === 'yes' ? msg.yes_price : msg.no_price;
  const ticker    = msg.market_ticker ?? 'unknown';

  // Inherit spread and volume from the most recent ticker snapshot for this market.
  const state = marketStateCache.get(ticker) ?? {};
  const cachedMid = state.yesBid && state.yesAsk
    ? (state.yesBid + state.yesAsk) / 2
    : 0;
  const bid_ask_spread_pct = state.spread != null && cachedMid > 0
    ? (state.spread / cachedMid) * 100
    : null;
  const volume_24h = state.volume ?? null;

  const liquidity_score = calculateUnifiedConfidence(0, bid_ask_spread_pct);
  const confidence_flag = liquidity_score < 50 ? 'LOW_CONFIDENCE' : null;

  return {
    id: uuidv4(),
    timestamp: msg.ts
      ? new Date(msg.ts).toISOString()
      : new Date().toISOString(),
    platform: 'kalshi',
    event_id: ticker,
    proposition_name: ticker,
    price: normProb(rawPrice),
    side: 'buy',   // Kalshi trade messages represent the taker's buy direction.
    size: parseFloat(msg.count ?? 0),
    liquidity_score,
    probability_pct: normProb(rawPrice) * 100,
    liquidity_depth_usd: 0,
    bid_ask_spread_pct,
    volume_24h,
    confidence_flag,
    raw_payload: data,
  };
}

/**
 * Normalize a Kalshi ticker message into the unified schema.
 *
 * Kalshi ticker payload (type: "ticker"):
 * {
 *   type: "ticker",
 *   msg: {
 *     market_ticker: "FED-25JAN-T5.25",
 *     yes_bid: 63,
 *     yes_ask: 65,
 *     no_bid: 35,
 *     no_ask: 37,
 *     volume: 5000,
 *     ts: 1700000000000,
 *   }
 * }
 */
function normalizeKalshiTicker(data) {
  const msg = data.msg ?? data;
  const yesBid = parseFloat(msg.yes_bid ?? 0);
  const yesAsk = parseFloat(msg.yes_ask ?? 0);
  const mid    = yesBid && yesAsk ? (yesBid + yesAsk) / 2 : yesBid || yesAsk;
  const spread = Math.max(yesAsk - yesBid, 0);
  const volume = parseFloat(msg.volume ?? 0);
  const bid_ask_spread_pct = mid > 0 ? (spread / mid) * 100 : null;

  // Cache microstructure so Kalshi trade messages can inherit spread + volume.
  const ticker = msg.market_ticker ?? 'unknown';
  marketStateCache.set(ticker, { yesBid, yesAsk, spread, volume });

  const liquidity_score = calculateUnifiedConfidence(0, bid_ask_spread_pct);
  const confidence_flag = liquidity_score < 50 ? 'LOW_CONFIDENCE' : null;

  return {
    id: uuidv4(),
    timestamp: msg.ts
      ? new Date(msg.ts).toISOString()
      : new Date().toISOString(),
    platform: 'kalshi',
    event_id: ticker,
    proposition_name: ticker,
    price: normProb(mid),
    side: 'buy',
    size: volume,
    liquidity_score,
    probability_pct: normProb(mid) * 100,
    liquidity_depth_usd: 0,
    bid_ask_spread_pct,
    volume_24h: volume,
    confidence_flag,
    raw_payload: data,
  };
}

// ---------------------------------------------------------------------------
// Polymarket Connector
// ---------------------------------------------------------------------------

/**
 * Opens and maintains a Polymarket CLOB WebSocket connection.
 * Subscribes to the `market` channel (trades + price changes) and the
 * `book` channel (order-book snapshots/deltas) for all configured market IDs.
 *
 * Reconnects automatically on close or error with exponential backoff.
 */
async function connectPolymarket() {
  let attempt = 0;

  while (true) {
    console.log(`[Polymarket] Connecting (attempt ${attempt + 1})…`);

    const ws = new WebSocket(POLYMARKET_WS_URL, {
      handshakeTimeout: 10_000,
    });

    let heartbeat;

    ws.on('open', () => {
      attempt = 0; // Reset backoff on successful connection.
      console.log('[Polymarket] Connected.');

      if (POLYMARKET_MARKET_IDS.length === 0) {
        console.warn(
          '[Polymarket] No market IDs configured. ' +
          'Set POLYMARKET_MARKET_IDS in .env to start receiving data.'
        );
      }

      // Subscribe to the market channel for all configured token IDs.
      // assets_ids is the correct field name per Polymarket CLOB docs.
      // custom_feature_enabled: true enables book snapshots and best_bid_ask events.
      ws.send(
        JSON.stringify({
          auth: {
            apiKey: process.env.POLYMARKET_API_KEY ?? '',
          },
          type: 'market',
          assets_ids: POLYMARKET_MARKET_IDS,
          custom_feature_enabled: true,
        })
      );

      for (const id of POLYMARKET_MARKET_IDS) {
        console.log(`[Polymarket] Subscribed to market channel for ${id}`);
      }

      // Send a periodic ping to keep the connection alive.
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20_000);
    });

    ws.on('message', (raw) => {
      let messages;
      try {
        const parsed = JSON.parse(raw);
        // Polymarket may batch multiple events in a single frame as an array.
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        console.warn('[Polymarket] Non-JSON frame received, skipping.');
        return;
      }

      for (const msg of messages) {
        try {
          const eventType = msg.event_type ?? msg.type;

          if (
            eventType === 'trade' ||
            eventType === 'last_trade_price' ||
            eventType === 'price_change' ||
            eventType === 'best_bid_ask'
          ) {
            const record = normalizePolymarketTrade(msg);
            if (record.price > 0) {
              inserter.enqueue(record);
            }
          } else if (eventType === 'book' || eventType === 'book_snapshot') {
            // Update marketStateCache with depth + best bid/ask for this asset.
            const bids = msg.bids ?? [];
            const asks = msg.asks ?? [];
            // Entries are objects: { price: "0.65", size: "100" }
            const bestBid = bids.length > 0 ? parseFloat(bids[0].price ?? bids[0][0]) : 0;
            const bestAsk = asks.length > 0 ? parseFloat(asks[0].price ?? asks[0][0]) : 0;
            const mid   = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
            const depth = computePolymarketBookDepth(bids, asks, mid);
            const assetId = msg.asset_id ?? msg.market;
            if (assetId) {
              marketStateCache.set(assetId, { depth, bestBid, bestAsk });
              console.log(`[Polymarket] Book depth for ${assetId}: $${depth.toFixed(2)} (bid: ${bestBid}, ask: ${bestAsk})`);
            }
          }
          // Ignore ping/pong and subscription-acknowledgement frames.
        } catch (err) {
          console.error('[Polymarket] Error normalizing message:', err.message, msg);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[Polymarket] WebSocket error:', err.message);
    });

    // Wait for the socket to close before deciding whether to reconnect.
    await new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        clearInterval(heartbeat);
        console.warn(
          `[Polymarket] Disconnected (code: ${code}, reason: ${reason || 'none'}).`
        );
        resolve();
      });
    });

    const delay = nextDelay(attempt++);
    console.log(`[Polymarket] Reconnecting in ${Math.round(delay)}ms…`);
    await sleep(delay);
  }
}

// ---------------------------------------------------------------------------
// Kalshi Connector
// ---------------------------------------------------------------------------

/**
 * Opens and maintains a Kalshi v2 WebSocket connection.
 * Subscribes to the `trade` and `ticker` channels for all configured tickers.
 *
 * Reconnects automatically on close or error with exponential backoff.
 */
async function connectKalshi() {
  let attempt = 0;
  let cmdId = 1; // Kalshi requires a monotonically increasing command ID.

  while (true) {
    console.log(`[Kalshi] Connecting (attempt ${attempt + 1})…`);

    const authHeaders = kalshiAuthHeadersWithLog(KALSHI_API_KEY, KALSHI_PRIVATE_KEY_BASE64);

    const ws = new WebSocket(KALSHI_WS_URL, {
      headers: authHeaders,
      handshakeTimeout: 10_000,
    });

    let heartbeat;

    ws.on('open', () => {
      attempt = 0;
      console.log('[Kalshi] Connected.');

      if (KALSHI_MARKET_TICKERS.length === 0) {
        console.warn(
          '[Kalshi] No market tickers configured. ' +
          'Set KALSHI_MARKET_TICKERS in .env to start receiving data.'
        );
      }

      // Subscribe to trade channel.
      ws.send(
        JSON.stringify({
          id: cmdId++,
          cmd: 'subscribe',
          params: {
            channels: ['trade'],
            market_tickers: KALSHI_MARKET_TICKERS,
          },
        })
      );
      console.log('[Kalshi] Sent subscribe → trade for:', KALSHI_MARKET_TICKERS.join(', '));

      // Subscribe to ticker channel.
      ws.send(
        JSON.stringify({
          id: cmdId++,
          cmd: 'subscribe',
          params: {
            channels: ['ticker'],
            market_tickers: KALSHI_MARKET_TICKERS,
          },
        })
      );
      console.log('[Kalshi] Sent subscribe → ticker for:', KALSHI_MARKET_TICKERS.join(', '));

      // Kalshi drops idle connections; use a native WebSocket ping frame.
      // Application-level { cmd: 'ping' } returns code 5 "Unknown command".
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 20_000);
    });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn('[Kalshi] Non-JSON frame received, skipping.');
        return;
      }

      try {
        const msgType = data.type;

        if (msgType === 'trade') {
          const record = normalizeKalshiTrade(data);
          if (record.size > 0 || record.price > 0) {
            inserter.enqueue(record);
          }
        } else if (msgType === 'ticker') {
          const record = normalizeKalshiTicker(data);
          inserter.enqueue(record);
        } else if (msgType === 'subscribed') {
          console.log('[Kalshi] Subscription confirmed:', JSON.stringify(data.msg ?? data));
        } else if (msgType === 'error') {
          console.error('[Kalshi] Server error:', JSON.stringify(data.msg ?? data));
        } else if (msgType === 'pong') {
          // expected — heartbeat reply, no action needed
        } else {
          console.warn('[Kalshi] Unhandled message type:', msgType, JSON.stringify(data).slice(0, 200));
        }
      } catch (err) {
        console.error('[Kalshi] Error normalizing message:', err.message, data);
      }
    });

    ws.on('error', (err) => {
      console.error('[Kalshi] WebSocket error:', err.message);
    });

    await new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        clearInterval(heartbeat);
        console.warn(
          `[Kalshi] Disconnected (code: ${code}, reason: ${reason || 'none'}).`
        );
        resolve();
      });
    });

    const delay = nextDelay(attempt++);
    console.log(`[Kalshi] Reconnecting in ${Math.round(delay)}ms…`);
    await sleep(delay);
  }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal) {
  console.log(`\n[Aggregator] Received ${signal}. Flushing remaining records…`);
  await inserter.flush();
  inserter.stop();
  console.log('[Aggregator] Final stats:', inserter.stats);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

console.log('[Aggregator] Starting prediction market aggregator…');
console.log(
  `[Aggregator] Polymarket markets: ${POLYMARKET_MARKET_IDS.length ? POLYMARKET_MARKET_IDS.join(', ') : '(none configured)'}`
);
console.log(
  `[Aggregator] Kalshi tickers: ${KALSHI_MARKET_TICKERS.length ? KALSHI_MARKET_TICKERS.join(', ') : '(none configured)'}`
);
console.log(`[Aggregator] Book depth tracking: enabled on Polymarket connection (${POLYMARKET_MARKET_IDS.length} market(s))`);

// Run both connectors concurrently. Each manages its own reconnect loop
// independently so an outage on one source does not affect the others.
Promise.all([
  connectPolymarket().catch((err) => {
    console.error('[Polymarket] Fatal error in connector loop:', err);
    process.exit(1);
  }),
  connectKalshi().catch((err) => {
    console.error('[Kalshi] Fatal error in connector loop:', err);
    process.exit(1);
  }),
]);
