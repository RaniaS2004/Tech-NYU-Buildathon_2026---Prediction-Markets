import type { Tables } from "@/integrations/supabase/types";

type MarketSpread = Tables<"market_spreads_live">;

const HeatCell = ({ row }: { row: MarketSpread }) => {
  const spread = row.spread_pct;
  const abs = spread !== null ? Math.abs(spread) : 0;

  let bg = "bg-muted/30";
  let textColor = "text-muted-foreground";
  if (spread !== null) {
    if (abs > 10) { bg = "bg-signal-red/20"; textColor = "text-signal-red"; }
    else if (abs > 3) { bg = "bg-signal-amber/15"; textColor = "text-signal-amber"; }
    else if (abs > 0.5) { bg = "bg-signal-green/10"; textColor = "text-signal-green"; }
  }

  return (
    <div className={`${bg} border border-border rounded-sm p-3 min-w-0`}>
      <div className="font-sans text-[11px] text-surface-foreground truncate mb-2">{row.event_name}</div>
      <div className={`font-mono text-lg font-semibold ${textColor}`}>
        {spread !== null ? `${spread > 0 ? "+" : ""}${spread.toFixed(1)}%` : "—"}
      </div>
      <div className="font-mono text-[10px] text-muted-foreground mt-1">{row.settlement_source}</div>
    </div>
  );
};

const GlobalMacroHeatmap = ({ data }: { data: MarketSpread[] }) => {
  return (
    <div className="border border-border rounded-sm bg-card p-5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
        Global Macro Heatmap
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {data.map((row) => (
          <HeatCell key={row.market_key} row={row} />
        ))}
      </div>
    </div>
  );
};

export default GlobalMacroHeatmap;
