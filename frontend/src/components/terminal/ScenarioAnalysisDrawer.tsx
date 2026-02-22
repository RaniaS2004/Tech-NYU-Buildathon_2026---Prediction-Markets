import { useEffect, useState, useMemo } from "react";
import { X, ChevronRight, Target } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScenarioReport, CausalChainItem } from "@/hooks/useScenario";

interface ScenarioAnalysisDrawerProps {
  report: ScenarioReport;
  onClose: () => void;
}

/* ── Bold key terms in narrative text ── */
const BOLD_TERMS = /\b(WTI Oil|Brent|Core CPI|CPI|S&P 500|Nasdaq|USD|EUR|JPY|GBP|Gold|Silver|Bitcoin|BTC|ETH|Treasury|Fed|FOMC|GDP|PCE|PPI|NFP|VIX|DXY|Surge|Surges|Spike|Spikes|Rally|Rallies|Crash|Crashes|Plunge|Plunges|Drop|Drops|Decrease|Decreases|Increase|Increases|Rise|Rises|Fall|Falls|Decline|Declines|Soar|Soars|Collapse|Collapses|Rebound|Rebounds)\b/i;

const boldKeyTerms = (text: string) => {
  const parts = text.split(new RegExp(BOLD_TERMS.source, "gi"));
  return parts.map((part, i) =>
    BOLD_TERMS.test(part)
      ? <strong key={i} className="text-foreground font-semibold">{part}</strong>
      : part
  );
};

/* ── Circular confidence gauge (emerald) ── */
const ConfidenceGauge = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);

  return (
    <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
      <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
        <circle
          cx="22" cy="22" r={radius} fill="none" stroke="hsl(var(--signal-green))" strokeWidth="2.5"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700"
        />
      </svg>
      <span className="absolute font-mono text-[9px] text-foreground">{pct}%</span>
    </div>
  );
};

/* ── Order helpers ── */
const orderGlow = (order: number) => {
  if (order === 0) return "shadow-[inset_0_0_24px_rgba(16,185,129,0.08)]";
  if (order === 1) return "shadow-[inset_0_0_24px_rgba(245,158,11,0.06)]";
  return "shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]";
};

const orderBorderColor = (order: number) => {
  if (order === 0) return "border-signal-green/40";
  if (order === 1) return "border-signal-amber/40";
  return "border-signal-red/30";
};

const orderDotColor = (order: number) => {
  if (order === 0) return "bg-signal-green";
  if (order === 1) return "bg-signal-amber";
  return "bg-signal-red";
};

const orderLabel = (order: number) => {
  if (order === 0) return "TRIGGER";
  if (order === 1) return "1ST ORDER";
  if (order === 2) return "2ND ORDER";
  if (order === 3) return "3RD ORDER";
  return `${order}TH ORDER`;
};

/* ── Chain Card ── */
const ChainCard = ({
  item,
  isHovered,
  onHover,
  onLeave,
}: {
  item: CausalChainItem;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) => (
  <div
    className={`border ${orderBorderColor(item.order)} ${orderGlow(item.order)} rounded-sm p-4 bg-zinc-800/50 backdrop-blur-sm min-w-[250px] max-w-[320px] flex-shrink-0 transition-all duration-200 cursor-default ${
      isHovered ? "scale-[1.03] brightness-110 z-10" : ""
    }`}
    onMouseEnter={onHover}
    onMouseLeave={onLeave}
  >
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-1.5 h-1.5 rounded-full ${orderDotColor(item.order)}`} />
      <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-400">{orderLabel(item.order)}</span>
      <div className="ml-auto">
        <ConfidenceGauge value={item.confidence} />
      </div>
    </div>
    <h4 className="font-mono text-xs text-zinc-100 font-medium mb-2 leading-tight">{item.label}</h4>
    <p className="font-mono text-[11px] text-zinc-400 leading-relaxed mb-3">{item.impact}</p>
    <div className="border-t border-border/50 pt-2">
      <span className="font-mono text-[8px] text-zinc-500 block mb-0.5 tracking-[0.1em]">LOGIC</span>
      <p className="font-mono text-[10px] text-zinc-400/80 leading-relaxed">{item.logic_justification}</p>
    </div>
  </div>
);

/* ── Glowing pulse connector ── */
const PulseConnector = () => (
  <div className="flex items-center px-2 flex-shrink-0">
    <div className="relative w-10 h-px">
      <div className="absolute inset-0 bg-gradient-to-r from-signal-green/40 via-signal-green/60 to-signal-green/40 rounded-full" />
      <div className="absolute inset-0 bg-gradient-to-r from-signal-green/20 via-signal-green/50 to-signal-green/20 animate-pulse rounded-full" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-signal-green/70 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-signal-green/50" />
    </div>
  </div>
);

const ScenarioAnalysisDrawer = ({ report, onClose }: ScenarioAnalysisDrawerProps) => {
  const sortedChain = useMemo(
    () => [...(report.causal_chain ?? [])].sort((a, b) => a.order - b.order),
    [report.causal_chain]
  );
  const [mounted, setMounted] = useState(false);
  const [hoveredOrder, setHoveredOrder] = useState<number | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const narrativeElements = useMemo(() => {
    if (!report.narrative) return null;
    return boldKeyTerms(report.narrative);
  }, [report.narrative]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-lg" />

      {/* Modal */}
      <div
        className={`relative w-[85vw] max-w-[1400px] h-[75vh] rounded-sm flex flex-col overflow-hidden transition-all duration-300 ease-out border border-signal-green/30 ${
          mounted ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
        style={{
          transformOrigin: "center bottom",
          background: "hsl(var(--background) / 0.95)",
          backdropFilter: "blur(24px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient border overlay */}
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{
            border: "0.5px solid transparent",
            borderImage: "linear-gradient(to bottom, rgba(16,185,129,0.5), transparent 70%) 1",
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Target className="w-3.5 h-3.5 text-signal-green/70" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Inference Engine</span>
            <div className="flex items-center gap-1 ml-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green/70 animate-pulse-dot" />
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-signal-green/60">Live</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-sm text-zinc-100 hover:text-foreground hover:shadow-[0_0_8px_rgba(16,185,129,0.2)] transition-all duration-200"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body — vertical: chain on top, narrative below */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6 overflow-x-hidden max-w-full">
            {/* Query */}
            <div>
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-500 block mb-1.5">Scenario Query</span>
              <p className="font-mono text-sm text-zinc-100 leading-relaxed border-l-2 border-signal-green/30 pl-4">
                {report.query}
              </p>
            </div>

            {/* Trigger badge */}
            <div className="flex items-center gap-2 px-3 py-2 border border-signal-green/20 rounded-sm bg-signal-green/5 w-fit">
              <ChevronRight className="w-3 h-3 text-signal-green/70" />
              <span className="font-mono text-[9px] text-signal-green/80 tracking-wide">
                Trigger: <span className="text-zinc-100 font-medium">{report.trigger_market}</span>
              </span>
            </div>

            {/* Causal chain — horizontal */}
            <div>
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-500 block mb-3">Causal Chain</span>
              <div className="flex items-stretch gap-0 overflow-x-auto pb-3 pr-6 scrollbar-thin">
                {sortedChain.map((item, i) => (
                  <div key={item.market_key} className="flex items-center flex-shrink-0">
                    <ChainCard
                      item={item}
                      isHovered={hoveredOrder === item.order}
                      onHover={() => setHoveredOrder(item.order)}
                      onLeave={() => setHoveredOrder(null)}
                    />
                    {i < sortedChain.length - 1 && <PulseConnector />}
                  </div>
                ))}
              </div>
            </div>

            {/* Narrative — below causal chain */}
            {report.narrative && (
              <div className="w-full border-t border-zinc-800 pt-5 pb-8">
                <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-500 block mb-3">Analysis Narrative</span>
                <p className="font-mono text-sm text-zinc-100 leading-relaxed whitespace-normal break-words w-full overflow-x-hidden">
                  {narrativeElements}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ScenarioAnalysisDrawer;
