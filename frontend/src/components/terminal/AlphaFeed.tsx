import { useState } from "react";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import type { ArbitrageAlert } from "@/hooks/useArbitrageAlerts";

interface AlphaFeedProps {
  alerts: ArbitrageAlert[];
}

const AlphaFeed = ({ alerts }: AlphaFeedProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-card/90 backdrop-blur-sm border border-border rounded-sm font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Zap className="w-3 h-3 text-signal-amber" />
        Alpha Feed
        {alerts.some((a) => a.isNew) && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-signal-amber animate-pulse" />
        )}
        {open ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Sliding panel */}
      <div
        className={`absolute top-0 right-0 h-full bg-card/95 backdrop-blur-sm border-l border-border z-20 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: 320 }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-signal-amber" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Alpha Feed
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {alerts.length}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-48px)] p-3 space-y-2">
          {alerts.length === 0 && (
            <p className="font-mono text-[10px] text-muted-foreground/50 text-center mt-8">
              No alerts yet. Waiting for signals…
            </p>
          )}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-sm border transition-all duration-500 ${
                alert.isNew
                  ? "border-signal-amber/60 bg-signal-amber/5 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "border-border bg-card/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-foreground font-semibold truncate max-w-[200px]">
                  {alert.market_pair}
                </span>
                {alert.isNew && (
                  <span className="font-mono text-[8px] font-bold tracking-widest text-signal-amber bg-signal-amber/10 px-1.5 py-0.5 rounded animate-pulse">
                    NEW
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <span className="font-mono text-[9px] text-muted-foreground block">Spread</span>
                  <span className="font-mono text-xs text-foreground">
                    {alert.spread.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[9px] text-muted-foreground block">Profit</span>
                  <span className="font-mono text-xs text-signal-amber">
                    +{alert.potential_profit_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="ml-auto">
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default AlphaFeed;
