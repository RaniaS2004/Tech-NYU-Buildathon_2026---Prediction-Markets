import { TrendingUp, AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type MarketSpread = Tables<"market_spreads_live">;

const PrimeSignal = ({ data }: { data: MarketSpread[] }) => {
  // Find largest absolute spread as prime signal
  const prime = data
    .filter((d) => d.spread_pct !== null)
    .sort((a, b) => Math.abs(b.spread_pct!) - Math.abs(a.spread_pct!))[0];

  if (!prime) {
    return (
      <div className="border border-border rounded-sm bg-card p-5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Prime Signal</div>
        <div className="font-mono text-sm text-muted-foreground">No active signals</div>
      </div>
    );
  }

  const absSpread = Math.abs(prime.spread_pct!);
  const isAlert = absSpread > 5;

  return (
    <div className={`border rounded-sm p-5 ${isAlert ? "border-signal-amber/40 bg-signal-amber/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Prime Signal</span>
        {isAlert ? (
          <AlertTriangle className="w-4 h-4 text-signal-amber" />
        ) : (
          <TrendingUp className="w-4 h-4 text-signal-green" />
        )}
      </div>
      <div className="font-sans text-sm font-medium text-foreground mb-1">{prime.event_name}</div>
      <div className="flex items-baseline gap-3 mt-3">
        <span className={`font-mono text-2xl font-semibold ${isAlert ? "text-signal-amber" : "text-signal-green"}`}>
          {prime.spread_pct! > 0 ? "+" : ""}{prime.spread_pct!.toFixed(2)}%
        </span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase">spread</span>
      </div>
      <div className="flex gap-6 mt-4 pt-3 border-t border-border">
        <div>
          <div className="font-mono text-[10px] text-muted-foreground mb-1">POLYMARKET</div>
          <div className="font-mono text-sm text-foreground">
            {prime.polymarket_pct !== null ? `${prime.polymarket_pct.toFixed(1)}¢` : "N/A"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] text-muted-foreground mb-1">KALSHI</div>
          <div className="font-mono text-sm text-foreground">
            {prime.kalshi_pct !== null ? `${prime.kalshi_pct.toFixed(1)}¢` : "N/A"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] text-muted-foreground mb-1">CONFIDENCE</div>
          <div className={`font-mono text-sm ${prime.confidence === "HIGH" ? "text-signal-green" : "text-signal-amber"}`}>
            {prime.confidence ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrimeSignal;
