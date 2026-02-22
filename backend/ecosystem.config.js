'use strict';

const path = require('path');

// Absolute path to the project-root .env file.
// ecosystem.config.js lives in backend/, so we step one level up.
//
// We pass this to Node via --env-file (native Node ≥ 20.6, no dotenv needed).
// dotenv.config() inside each script is a no-op when vars are already set,
// so there is no conflict.
const ENV_FILE = path.resolve(__dirname, '../.env');

// node_args string shared by every app — loads .env before any user code runs.
const NODE_ENV_FILE_ARG = `--env-file=${ENV_FILE}`;

/**
 * ecosystem.config.js — PM2 Process Manager Configuration
 *
 * Manages all backend services for the Prediction Markets platform.
 *
 * ── Cost architecture ─────────────────────────────────────────────────────────
 *
 *   agent.js            ← ONE-SHOT  │ Uses Anthropic API (Claude).
 *                                   │ Run manually to seed market_relationships.
 *                                   │ autorestart: false — never looped by PM2.
 *
 *   arbitrage_hunter.js ← 24/7 LIVE │ Pure JS math only. Zero AI cost.
 *   aggregator.js       ← 24/7 LIVE │ Zero AI cost.
 *   api.js              ← 24/7 LIVE │ Zero AI cost.
 *
 * ── Quick-start ───────────────────────────────────────────────────────────────
 *
 *   # Install PM2 globally (once)
 *   npm install -g pm2
 *
 *   # Start all three live services
 *   pm2 start ecosystem.config.js
 *
 *   # Run the AI classifier manually (one-shot, seeds market_relationships)
 *   pm2 start ecosystem.config.js --only agent
 *
 *   # Persist across reboots
 *   pm2 save
 *   pm2 startup          ← follow the printed command to enable on boot
 *
 * ── Useful PM2 commands ───────────────────────────────────────────────────────
 *
 *   pm2 list                         — show all managed processes
 *   pm2 logs arbitrage-hunter        — tail logs for the hunter
 *   pm2 logs arbitrage-hunter --lines 200  — last 200 lines
 *   pm2 restart arbitrage-hunter     — manual restart
 *   pm2 stop    arbitrage-hunter     — stop without deleting
 *   pm2 delete  arbitrage-hunter     — remove from PM2
 *   pm2 monit                        — live resource dashboard (CPU, RAM)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {
  apps: [

    // ── 1. Arbitrage Hunter ─────────────────────────────────────────────────
    // Pure JS math. No AI calls. Designed to run forever at zero extra cost.
    // Scans market_relationships every 30 s, writes alerts to arbitrage_alerts.
    {
      name:        'arbitrage-hunter',
      script:      'arbitrage_hunter.js',
      cwd:         __dirname,

      // ── Reliability ───────────────────────────────────────────────────────
      autorestart:              true,
      // Exponential backoff: first restart after 100 ms, doubles each time
      // (200 ms, 400 ms … up to 30 s). Prevents hammering Supabase on a
      // persistent connection error.
      exp_backoff_restart_delay: 100,
      max_restarts:             20,       // cap infinite crash-loop cycles
      min_uptime:               '10s',    // must stay up 10 s to count as "stable"

      // ── Resources ─────────────────────────────────────────────────────────
      max_memory_restart: '150M',         // lightweight polling script
      instances:          1,
      exec_mode:          'fork',
      watch:              false,          // never restart on file changes in prod

      // ── Environment ───────────────────────────────────────────────────────
      // env_file is loaded by PM2 before the process starts, making all
      // vars available to dotenv.config() without needing the file path.
      node_args: NODE_ENV_FILE_ARG,
      env: {
        NODE_ENV: 'production',
      },

      // ── Logging ───────────────────────────────────────────────────────────
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:      'logs/arbitrage-hunter-error.log',
      out_file:        'logs/arbitrage-hunter-out.log',
      merge_logs:      true,
    },

    // ── 2. Market Data Aggregator ───────────────────────────────────────────
    // Maintains persistent WebSocket connections to Polymarket and Kalshi.
    // Writes normalized price ticks into market_signals via BatchInserter.
    {
      name:        'aggregator',
      script:      'aggregator.js',
      cwd:         __dirname,

      autorestart:              true,
      exp_backoff_restart_delay: 100,
      max_restarts:             20,
      min_uptime:               '10s',

      // WebSocket + in-memory book cache can grow; give it more headroom.
      max_memory_restart: '300M',
      instances:          1,
      exec_mode:          'fork',
      watch:              false,

      node_args: NODE_ENV_FILE_ARG,
      env: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:      'logs/aggregator-error.log',
      out_file:        'logs/aggregator-out.log',
      merge_logs:      true,
    },

    // ── 3. REST API Server ──────────────────────────────────────────────────
    // Serves /api/graph-data and /health to the frontend.
    {
      name:        'api',
      script:      'api.js',
      cwd:         __dirname,

      autorestart:              true,
      exp_backoff_restart_delay: 100,
      max_restarts:             20,
      min_uptime:               '10s',

      max_memory_restart: '128M',
      instances:          1,
      exec_mode:          'fork',
      watch:              false,

      node_args: NODE_ENV_FILE_ARG,
      env: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:      'logs/api-error.log',
      out_file:        'logs/api-out.log',
      merge_logs:      true,
    },

    // ── 4. AI Relationship Classifier (one-shot) ────────────────────────────
    // Calls Claude claude-sonnet-4-6 to classify market pairs and populate
    // market_relationships. Run manually whenever market_metadata changes.
    //
    // HOW TO RUN:
    //   pm2 start ecosystem.config.js --only agent
    //
    // autorestart is explicitly FALSE — this process must exit on its own.
    // PM2 is included here only for convenience (unified logging, env loading).
    {
      name:        'agent',
      script:      'agent.js',
      cwd:         __dirname,

      autorestart: false,           // ← CRITICAL: one-shot, must not loop
      watch:       false,

      instances:   1,
      exec_mode:   'fork',

      node_args: NODE_ENV_FILE_ARG,
      env: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:      'logs/agent-error.log',
      out_file:        'logs/agent-out.log',
      merge_logs:      true,
    },

  ],
};
