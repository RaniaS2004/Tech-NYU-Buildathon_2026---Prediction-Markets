'use strict';

/**
 * supabaseClient.js
 *
 * Exports a ready-to-use Supabase client (service-role, bypasses RLS)
 * and a BatchInserter that accumulates records and flushes them to
 * the market_signals table in controlled bursts.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. ' +
    'Copy .env.example → .env and fill in your credentials.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    // Service-role keys must never be sent to the browser; this confirms we
    // are using them only in a server-side worker context.
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    // The worker does not subscribe to Realtime itself; Realtime is for
    // frontend consumers. Disabling it here avoids an unnecessary socket.
    enabled: false,
  },
});

// ---------------------------------------------------------------------------
// BatchInserter
// ---------------------------------------------------------------------------
const TABLE = 'market_signals';
const DEFAULT_BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? '25', 10);
const DEFAULT_FLUSH_INTERVAL = parseInt(
  process.env.BATCH_FLUSH_INTERVAL_MS ?? '2000',
  10
);

/**
 * Accumulates normalized market_signals records and flushes them to Supabase
 * either when the queue reaches `batchSize` or after `flushIntervalMs` ms,
 * whichever comes first.
 *
 * Usage:
 *   const inserter = new BatchInserter();
 *   inserter.enqueue(normalizedRecord);
 *   // On shutdown:
 *   await inserter.flush();
 *   inserter.stop();
 */
class BatchInserter {
  constructor({
    batchSize = DEFAULT_BATCH_SIZE,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL,
  } = {}) {
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this._queue = [];
    this._timer = setInterval(() => this.flush(), this.flushIntervalMs);
    // Prevent the timer from blocking Node.js process exit.
    this._timer.unref();
    this._flushing = false;
    this._totalInserted = 0;
    this._totalErrors = 0;
  }

  /**
   * Add a single normalized record to the pending queue.
   * @param {Object} record — must conform to the market_signals schema.
   */
  enqueue(record) {
    this._queue.push(record);
    if (this._queue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Drain the current queue and upsert all records into Supabase in one call.
   * Safe to call concurrently — a second flush while one is in-flight will
   * wait for the first to complete before draining any remaining records.
   */
  async flush() {
    if (this._queue.length === 0) return;

    // Drain the queue atomically.
    const batch = this._queue.splice(0, this._queue.length);

    try {
      const { error } = await supabase
        .from(TABLE)
        .insert(batch, {
          // Returning minimal to avoid sending data back over the wire.
          returning: 'minimal',
        });

      if (error) {
        this._totalErrors += batch.length;
        console.error(
          `[BatchInserter] Supabase insert error (${batch.length} records):`,
          error.message
        );
        // Put records back at the front of the queue for retry on the next tick.
        // Cap the retry queue to avoid unbounded growth during persistent errors.
        if (this._queue.length < this.batchSize * 10) {
          this._queue.unshift(...batch);
        } else {
          console.warn(
            `[BatchInserter] Retry queue is full; dropping ${batch.length} records.`
          );
        }
      } else {
        this._totalInserted += batch.length;
        console.log(
          `[BatchInserter] Inserted ${batch.length} records ` +
          `(total: ${this._totalInserted})`
        );
      }
    } catch (err) {
      this._totalErrors += batch.length;
      console.error('[BatchInserter] Unexpected error during flush:', err);
    }
  }

  /** Stop the periodic timer. Call on graceful shutdown after a final flush(). */
  stop() {
    clearInterval(this._timer);
  }

  get stats() {
    return {
      queued: this._queue.length,
      inserted: this._totalInserted,
      errors: this._totalErrors,
    };
  }
}

module.exports = { supabase, BatchInserter };
