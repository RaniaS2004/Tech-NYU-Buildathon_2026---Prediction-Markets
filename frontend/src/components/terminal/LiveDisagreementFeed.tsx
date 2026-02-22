import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type MarketSpread = Tables<"market_spreads_live">;

const formatTime = (ts: string | null) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (d.getFullYear() < 2000) return "—";
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const formatUsd = (v: number | null) => {
  if (v === null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const SpreadIcon = ({ spread }: { spread: number | null }) => {
  if (spread === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  if (spread > 1) return <TrendingUp className="w-3.5 h-3.5 text-signal-amber" />;
  if (spread < -1) return <TrendingDown className="w-3.5 h-3.5 text-signal-red" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

type FlashState = Record<string, { poly?: "up" | "down"; kalshi?: "up" | "down" }>;

const FlashCell = ({
  children,
  flash,
}: {
  children: React.ReactNode;
  flash?: "up" | "down";
}) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (flash) {
      setActive(true);
      const t = setTimeout(() => setActive(false), 300);
      return () => clearTimeout(t);
    }
  }, [flash]);

  return (
    <td
      className="px-4 py-3 font-mono text-sm text-foreground transition-colors duration-300"
      style={{
        backgroundColor: active
          ? flash === "up"
            ? "hsl(142 72% 20% / 0.10)"
            : "hsl(0 72% 20% / 0.10)"
          : "transparent",
      }}
    >
      {children}
    </td>
  );
};

const LiveDisagreementFeed = ({ data }: { data: MarketSpread[] }) => {
  const prevRef = useRef<Map<string, { poly: number | null; kalshi: number | null }>>(new Map());
  const [flashes, setFlashes] = useState<FlashState>({});

  useEffect(() => {
    const prev = prevRef.current;
    const newFlashes: FlashState = {};

    for (const row of data) {
      const key = row.market_key ?? "";
      const old = prev.get(key);
      if (old) {
        const pf =
          row.polymarket_pct !== null && old.poly !== null && row.polymarket_pct !== old.poly
            ? row.polymarket_pct > old.poly ? "up" as const : "down" as const
            : undefined;
        const kf =
          row.kalshi_pct !== null && old.kalshi !== null && row.kalshi_pct !== old.kalshi
            ? row.kalshi_pct > old.kalshi ? "up" as const : "down" as const
            : undefined;
        if (pf || kf) newFlashes[key] = { poly: pf, kalshi: kf };
      }
      prev.set(key, { poly: row.polymarket_pct, kalshi: row.kalshi_pct });
    }

    if (Object.keys(newFlashes).length > 0) {
      setFlashes(newFlashes);
      const t = setTimeout(() => setFlashes({}), 350);
      return () => clearTimeout(t);
    }
  }, [data]);

  const sorted = [...data].sort((a, b) => Math.abs(b.spread_pct ?? 0) - Math.abs(a.spread_pct ?? 0));

  return (
      <div className="border border-border rounded-sm bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Live Disagreement Feed
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {data.length} contracts · polling 5s
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Event", "Polymarket", "Kalshi", "Spread", "Depth", "Confidence", "Updated", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const key = row.market_key ?? "";
                const flash = flashes[key];

                return (
                  <tr key={key} className="border-b border-border/50 hover:bg-surface/30 transition-colors duration-150 cursor-default">
                    <td className="px-4 py-3">
                      <div className="font-sans text-sm text-foreground">{row.event_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {row.resolution_date} · {row.settlement_source}
                      </div>
                    </td>
                        <FlashCell flash={flash?.poly}>
                          {row.polymarket_pct !== null ? `${row.polymarket_pct.toFixed(1)}¢` : <span className="text-muted-foreground">N/A</span>}
                        </FlashCell>
                        <FlashCell flash={flash?.kalshi}>
                          {row.kalshi_pct !== null ? `${row.kalshi_pct.toFixed(1)}¢` : <span className="text-muted-foreground">N/A</span>}
                        </FlashCell>
                        <td className="px-4 py-3">
                          {row.spread_pct !== null ? (
                            <span className={`font-mono text-sm font-medium ${
                              Math.abs(row.spread_pct) > 5 ? "text-signal-red" :
                              Math.abs(row.spread_pct) > 1 ? "text-signal-amber" : "text-muted-foreground"
                            }`}>
                              {row.spread_pct > 0 ? "+" : ""}{row.spread_pct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="font-mono text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {formatUsd(row.liquidity_depth_usd)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${
                            row.confidence === "HIGH" ? "text-signal-green" : "text-signal-amber"
                          }`}>
                            {row.confidence ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                          {formatTime(row.polymarket_last_seen)}
                        </td>
                        <td className="px-4 py-3">
                          <SpreadIcon spread={row.spread_pct} />
                        </td>
                      </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
  );
};

export default LiveDisagreementFeed;
