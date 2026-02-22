import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useEffect, useState } from "react";

const TERMINAL_DATA = [
  {
    event: "Fed Rate Decision",
    date: "Mar 2026",
    polymarket: 62.4,
    kalshi: 59.2,
    spread: 3.2,
    volume24h: "12.4M",
    depth: "4.2M",
    trend: "up" as const,
  },
  {
    event: "WTI Oil > $80",
    date: "Q2 2026",
    polymarket: 41.7,
    kalshi: 43.1,
    spread: -1.4,
    volume24h: "8.7M",
    depth: "2.8M",
    trend: "down" as const,
  },
  {
    event: "CPI > 3.0%",
    date: "Feb 2026",
    polymarket: 28.3,
    kalshi: 27.9,
    spread: 0.4,
    volume24h: "5.1M",
    depth: "1.6M",
    trend: "neutral" as const,
  },
];

const TrendIcon = ({ trend }: { trend: "up" | "down" | "neutral" }) => {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-signal-green" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-signal-red" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

const FlickerNumber = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const interval = setInterval(() => {
      // Small random fluctuation
      const jitter = (Math.random() - 0.5) * 0.4;
      setDisplay(value + jitter);
    }, 2000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <span className="transition-all duration-300">
      {display.toFixed(1)}{suffix}
    </span>
  );
};

const TerminalPreview = () => {
  const [secondsAgo, setSecondsAgo] = useState(0.4);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(parseFloat((Math.random() * 0.8 + 0.1).toFixed(1)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="px-6 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="terminal-glow border border-border rounded-sm bg-card overflow-hidden relative">
          {/* Scanning line */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            <div className="animate-scan-line absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-glow/30 to-transparent" />
          </div>

          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">CONVERGE</span>
              <span className="text-border">|</span>
              <span className="font-mono text-xs text-muted-foreground">CROSS-VENUE MONITOR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse-dot" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Live Feed</span>
            </div>
          </div>

          {/* Divergence alert */}
          <div className="px-4 py-2.5 border-b border-border bg-surface/50 flex items-center gap-3">
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-signal-amber/15 text-signal-amber border border-signal-amber/25 rounded-sm animate-pulse-dot">
              Divergence
            </span>
            <span className="font-mono text-xs text-surface-foreground">
              +3.2% Spread Detected — Fed Rate Decision (Polymarket leads Kalshi)
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Event", "Polymarket", "Kalshi", "Spread", "24h Vol", "Depth", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TERMINAL_DATA.map((row) => (
                  <tr key={row.event} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-foreground">{row.event}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{row.date}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-foreground">
                      <FlickerNumber value={row.polymarket} suffix="¢" />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-foreground">
                      <FlickerNumber value={row.kalshi} suffix="¢" />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-sm font-medium ${
                        row.spread > 1 ? "text-signal-amber" : row.spread < -1 ? "text-signal-red" : "text-muted-foreground"
                      }`}>
                        {row.spread > 0 ? "+" : ""}{row.spread.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">${row.volume24h}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">${row.depth}</td>
                    <td className="px-4 py-3"><TrendIcon trend={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Terminal footer */}
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">3 contracts · 2 venues · updated {secondsAgo}s ago</span>
            <span className="font-mono text-[10px] text-muted-foreground">WebSocket latency: 12ms</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TerminalPreview;
