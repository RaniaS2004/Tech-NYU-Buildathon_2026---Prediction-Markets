# Prediction Market Intelligence Terminal

> Built for **Tech@NYU Buildathon 2026** — a real-time analytics layer for fragmented prediction markets.

---

## Overview

Prediction markets are split across multiple venues (Polymarket, Kalshi, and others), making it difficult to compare prices, assess liquidity, or detect cross-market signals in one place.

This project is an **intelligence terminal** that aggregates live market data from Polymarket and Kalshi into a unified Supabase backend, then surfaces it through a Bloomberg-style dashboard. Traders and analysts can monitor real-time order books, cross-venue spreads, and market structure — all from a single interface.

---

## Features

- **Real-time aggregation** — WebSocket connections to Polymarket CLOB and Kalshi v2, normalized into a unified schema
- **Bloomberg-style terminal dashboard** — live price feeds, spread views, and market depth panels
- **Cross-venue spreads & liquidity** — side-by-side comparison of Yes/No prices across venues
- **Arbitrage detection** — dedicated hunter module flags cross-venue pricing discrepancies
- **Market relationship graph** — experimental force-graph view linking correlated markets (demo mode)
- **Supabase Realtime** — frontend subscribes directly to Postgres changes for zero-latency UI updates
- **AI agent module** — optional Claude-powered agent for scenario analysis and commentary

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                         │
│  Polymarket CLOB WebSocket    Kalshi v2 WebSocket           │
└───────────────────┬─────────────────────┬───────────────────┘
                    │                     │
                    ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND  (Node.js)                        │
│  aggregator.js — normalizes + batch-inserts to Supabase     │
│  arbitrage_hunter.js — detects cross-venue spread alerts    │
│  scenario_engine.js — demo market relationship inference    │
│  agent.js — Claude-powered AI analysis (optional)          │
│  api.js — lightweight HTTP API over aggregated data         │
└───────────────────────────┬─────────────────────────────────┘
                            │ @supabase/supabase-js
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (hosted)                         │
│  PostgreSQL — market_signals table + analytical views        │
│  Realtime — pushes row changes to subscribed clients        │
└───────────────────────────┬─────────────────────────────────┘
                            │ @supabase/supabase-js (anon key)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND  (Vercel)                        │
│  React + Vite + TypeScript                                  │
│  shadcn/ui + Tailwind CSS — terminal-style UI               │
│  Recharts + react-force-graph-2d — charts & graph views     │
│  TanStack Query — data fetching and cache                   │
└─────────────────────────────────────────────────────────────┘
```

**Data flow summary:**
1. The backend aggregator holds persistent WebSocket connections to both exchanges.
2. Incoming messages are normalized and bulk-inserted into Supabase via a `BatchInserter`.
3. The frontend subscribes to Supabase Realtime and re-renders on every new row — no polling required.

---

## Getting Started

### Prerequisites

- Node.js `>= 18.0.0`
- `npm` or `pnpm`
- A [Supabase](https://supabase.com) project (free tier works)
- Kalshi API key + RSA private key (from [kalshi.com/profile/api](https://kalshi.com/profile/api))
- Polymarket CLOB token IDs for the markets you want to track (read-only; API key optional)

---

### Environment Variables

#### Backend — `backend/.env`

Copy `.env.example` (in the repo root) to `backend/.env` and fill in your values:

```env
# Supabase — use the service-role key (server-side only, never expose to browser)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Polymarket CLOB — token IDs for the Yes-side outcome token of each market
# Read-only market data does not require an API key.
POLYMARKET_API_KEY=your-polymarket-api-key-here
POLYMARKET_MARKET_IDS=<comma-separated-token-ids>

# Kalshi v2 — API key + RSA private key (base64-encoded)
KALSHI_API_KEY=your-kalshi-api-key-here
KALSHI_PRIVATE_KEY_BASE64=your-kalshi-rsa-private-key-base64-encoded
KALSHI_MARKET_TICKERS=<comma-separated-tickers>   # e.g. FED-25JAN-T5.25

# Aggregator tuning (optional — defaults shown)
BATCH_SIZE=25
BATCH_FLUSH_INTERVAL_MS=2000
RECONNECT_BASE_DELAY_MS=1000
RECONNECT_MAX_DELAY_MS=30000
```

#### Frontend — `frontend/.env`

```env
# Supabase — use the anon/publishable key (safe for browser)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_SUPABASE_PROJECT_ID=your-project-ref
```

> **Never commit real secrets.** Both `.env` files are listed in `.gitignore`.

---

### Database Setup

The Supabase schema (tables, views, indexes) is defined in `backend/schema.sql`. Run it once against your Supabase project:

```sh
# Via the Supabase SQL editor, or psql:
psql "$SUPABASE_DB_URL" -f backend/schema.sql
```

---

### Running the Backend (Aggregator)

The backend lives in the `/backend` directory.

```sh
cd backend

# Install dependencies
npm install

# Start the aggregator (watches for file changes in dev)
npm run dev

# Or run in production mode
npm start
```

When running, the aggregator:
- Opens WebSocket connections to Polymarket CLOB and Kalshi v2
- Normalizes all trade/ticker messages into the `market_signals` schema
- Batch-inserts records into Supabase on a configurable interval
- Automatically reconnects with exponential backoff on disconnect

**Other backend scripts:**

| Script | Command | Purpose |
|---|---|---|
| Aggregator | `npm start` | Main data ingestion process |
| HTTP API | `npm run api` | Lightweight REST API over aggregated data |
| Arbitrage hunter | `npm run hunter` | Scans for cross-venue pricing gaps |
| Scenario engine | `npm run scenario` | Demo market relationship graph |
| AI agent | `npm run agent` | Claude-powered market commentary |

---

### Running the Frontend

The frontend lives in the `/frontend` directory.

```sh
cd frontend

# Install dependencies
npm install

# Start the dev server (default: http://localhost:8080)
npm run dev
```

The frontend connects to Supabase using the anon key configured in `frontend/.env`. It subscribes to Realtime changes on the `market_signals` table and renders live updates without requiring any direct connection to the exchange APIs.

To build for production:

```sh
npm run build
```

---

## Deployment

### Frontend — Vercel

The frontend is designed for one-click deployment on [Vercel](https://vercel.com):

1. Import the repo into Vercel and set the **root directory** to `frontend`.
2. Add the three `VITE_SUPABASE_*` environment variables in the Vercel project settings.
3. Vercel handles builds automatically on every push to `main`.

### Backend — Local / Railway / Render

The aggregator is a long-running Node.js process. Options:

- **Local** — run `npm start` in `backend/` on any server or machine.
- **Railway** — connect the repo, set the root to `backend/`, add env vars, deploy.
- **Render** — same as Railway; use a Background Worker service type.
- **PM2** — an `ecosystem.config.js` is included for process-managed deployments:
  ```sh
  npm install -g pm2
  pm2 start backend/ecosystem.config.js
  ```

### Supabase

Supabase remains hosted on Supabase Cloud. No self-hosting is required.

---

## Demo Notes

- **Kalshi market activity** may be low on weekends or outside US market hours. If you see no incoming data, check that your tickers are for active markets.
- **Polymarket market IDs** are the binary outcome token addresses (Yes-side). Look them up via the Polymarket UI URL or the CLOB REST API (`GET https://clob.polymarket.com/markets`).
- **Market relationship graphs** in the scenario engine use `demo_*` prefixed synthetic markets and are illustrative only.
- The **AI agent** requires an Anthropic API key (set `ANTHROPIC_API_KEY` in `backend/.env`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS |
| Charts / Graph | Recharts, react-force-graph-2d |
| Data fetching | TanStack Query, Supabase Realtime |
| Backend | Node.js >= 18, ws (WebSockets), dotenv |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Database | Supabase (PostgreSQL + Realtime) |
| APIs | Polymarket CLOB WebSocket, Kalshi v2 WebSocket |
| Deployment | Vercel (frontend), Railway / Render / PM2 (backend) |

---

## Future Work

- Full probabilistic relationship graph inference across all tracked markets
- Price alert system with configurable thresholds
- Institutional-grade REST/WebSocket API for downstream consumers
- Expanded venue coverage (Manifold, PredictIt, others)
- Historical replay and backtesting mode

---

## Team / Credits

Built at **Tech@NYU Buildathon 2026**.

> Frontend scaffolded with [Lovable](https://lovable.dev). UI components from [shadcn/ui](https://ui.shadcn.com).
