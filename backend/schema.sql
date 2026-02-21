-- =============================================================================
-- market_signals — unified prediction market event stream
-- Run this once in your Supabase SQL Editor (or via supabase db push).
-- =============================================================================

-- 1. Create the table ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_signals (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp        TIMESTAMPTZ  NOT NULL,
    platform         TEXT         NOT NULL CHECK (platform IN ('kalshi', 'polymarket')),
    event_id         TEXT         NOT NULL,
    proposition_name TEXT         NOT NULL,
    price            FLOAT8       NOT NULL CHECK (price >= 0.0 AND price <= 1.0),
    side             TEXT         NOT NULL CHECK (side IN ('buy', 'sell')),
    size             FLOAT8       NOT NULL CHECK (size >= 0),
    liquidity_score  FLOAT8       NOT NULL CHECK (liquidity_score >= 0),
    raw_payload      JSONB,       -- optional: store the original message for debugging
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. Indexes for common query patterns ----------------------------------------
-- Frontend dashboards typically filter by platform + event_id over a time window.
CREATE INDEX IF NOT EXISTS idx_market_signals_platform_event
    ON public.market_signals (platform, event_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_market_signals_timestamp
    ON public.market_signals (timestamp DESC);

-- 3. Row-Level Security -------------------------------------------------------
ALTER TABLE public.market_signals ENABLE ROW LEVEL SECURITY;

-- Allow the service-role key (used by the aggregator worker) to INSERT freely.
-- This policy is intentionally permissive for the service role; tighten as needed.
CREATE POLICY "service_role_full_access"
    ON public.market_signals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anonymous / authenticated frontend clients to SELECT only.
CREATE POLICY "anon_read_only"
    ON public.market_signals
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 4. Enable Supabase Realtime broadcasting ------------------------------------
-- This publishes every INSERT/UPDATE/DELETE on this table to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_signals;

-- (Optional) If you only want INSERT events to be broadcast (lower noise):
-- ALTER TABLE public.market_signals REPLICA IDENTITY DEFAULT;

-- =============================================================================
-- market_metadata — static reference data for each tracked market
-- Run in Supabase SQL Editor alongside schema.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_metadata (
    market_key          TEXT PRIMARY KEY,
    event_name          TEXT NOT NULL,
    proposition_text    TEXT,            -- full question wording shown to users
    polymarket_token_id TEXT,            -- nullable; Oil/Labor are Kalshi-only
    kalshi_ticker       TEXT NOT NULL,
    resolution_date     DATE NOT NULL,
    settlement_source   TEXT NOT NULL
);

INSERT INTO public.market_metadata
    (market_key, event_name, proposition_text, polymarket_token_id, kalshi_ticker, resolution_date, settlement_source)
VALUES
    ('fed_march_2026',       'Fed Rate Decision — March 18 FOMC',
     'Will the Federal Reserve leave interest rates unchanged at its March 18–19, 2026 FOMC meeting?',
     '102559817034631022221500208641784929295731053857601013029449249654006364919935',
     'KXFEDDECISION-26MAR-H0',  '2026-03-18', 'Federal Reserve'),
    ('cpi_feb_2026',         'CPI Core YoY — Feb 2026 (BLS release March 11)',
     'Will the U.S. Core CPI year-over-year rate for February 2026 be above 2.4% (BLS release March 11)?',
     '52975867598867342093602444472498689604147805837923954696532625366255053339037',
     'KXCPICOREYOY-26FEB-T2.4', '2026-03-11', 'BLS'),
    ('gdp_q1_2026',          'GDP Q1 2026 (BEA Advance Estimate April 30)',
     'Will the BEA advance estimate of U.S. real GDP growth for Q1 2026 be above 2.0% (released April 30)?',
     '62741540586810785796611679100995722865508821499319734929274882283929330917217',
     'KXGDP-26APR30-T2.0',      '2026-04-30', 'BEA'),
    ('house_midterms_2026',  'U.S. House 2026 Midterms — Democratic Control',
     'Will Democrats win control of the U.S. House of Representatives in the 2026 midterm elections?',
     '83247781037352156539108067944461291821683755894607244160607042790356561625563',
     'CONTROLH-2026-D',         '2026-11-03', 'AP'),
    ('wti_feb_2026',         'WTI Oil Price Feb 27 — Above $70',
     'Will the WTI crude oil spot price be above $70 on February 27, 2026 (CME settlement)?',
     NULL, 'KXWTI-26FEB27-T70.00',    '2026-02-27', 'CME Group'),
    ('unemployment_feb_2026','Unemployment Rate Feb 2026 — Above 4.3%',
     'Will the U.S. unemployment rate for February 2026 be above 4.3% (BLS release March 6)?',
     NULL, 'KXUNEMP-26FEB-T4.3',      '2026-03-06', 'BLS')
ON CONFLICT (market_key) DO NOTHING;

ALTER TABLE public.market_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON public.market_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_only" ON public.market_metadata FOR SELECT TO anon, authenticated USING (true);

-- =============================================================================
-- Extend market_signals with 5 new analytical columns
-- =============================================================================

-- =============================================================================
-- market_relationships — AI-detected relationships between market pairs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_relationships (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    market_key_a        TEXT        NOT NULL,
    market_key_b        TEXT        NOT NULL,
    relationship_type   TEXT        NOT NULL CHECK (relationship_type IN ('equivalent','implied','mutually_exclusive','correlated')),
    confidence_score    FLOAT8      NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    logic_justification TEXT        NOT NULL,
    arbitrage_flag      TEXT,
    probability_a       FLOAT8,
    probability_b       FLOAT8,
    probability_spread  FLOAT8,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT market_relationships_pair UNIQUE (market_key_a, market_key_b)
);

ALTER TABLE public.market_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON public.market_relationships FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_only" ON public.market_relationships FOR SELECT TO anon, authenticated USING (true);

-- =============================================================================
-- Extend market_signals with 5 new analytical columns
-- =============================================================================

ALTER TABLE public.market_signals
    ADD COLUMN IF NOT EXISTS probability_pct      FLOAT8,
    ADD COLUMN IF NOT EXISTS liquidity_depth_usd  FLOAT8 DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bid_ask_spread_pct   FLOAT8,
    ADD COLUMN IF NOT EXISTS volume_24h           FLOAT8,
    ADD COLUMN IF NOT EXISTS confidence_flag      TEXT;

-- =============================================================================
-- Verification — run these SELECTs to confirm setup:
-- =============================================================================
--
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   → should show market_signals in the result set
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'market_signals';
--   → rowsecurity should be true
