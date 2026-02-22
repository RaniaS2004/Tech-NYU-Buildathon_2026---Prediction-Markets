import { Layers, Filter, GitCompareArrows } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";

const PILLARS = [
  {
    icon: Layers,
    title: "Unified Aggregation",
    stat: { value: 2, suffix: " Venues", decimals: 0 },
    description:
      "Connect to the global liquidity of Polymarket and the regulated safety of Kalshi through one API. Normalized data, single schema, zero reconciliation overhead.",
  },
  {
    icon: Filter,
    title: "Conviction Filtering",
    stat: { value: 94, suffix: "% Noise Removed", decimals: 0 },
    description:
      "Don't be fooled by noisy retail bets. Our engine filters for order book depth and 24h volume to surface only institutional-grade signals.",
  },
  {
    icon: GitCompareArrows,
    title: "Information Arbitrage",
    stat: { value: 3.2, suffix: "% Avg Spread", decimals: 1 },
    description:
      "Instantly identify when different regions or asset classes have conflicting views on the same macro event. Capture alpha from information asymmetry.",
  },
];

const ValuePillars = () => {
  return (
    <section className="px-6 pb-32">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border rounded-sm overflow-hidden">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="bg-card p-8 flex flex-col gap-4 group hover:bg-surface/50 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <pillar.icon className="w-5 h-5 text-muted-foreground group-hover:text-glow transition-colors duration-300" strokeWidth={1.5} />
                <span className="font-mono text-lg font-semibold text-foreground">
                  <AnimatedCounter end={pillar.stat.value} suffix={pillar.stat.suffix} decimals={pillar.stat.decimals} />
                </span>
              </div>
              <h3 className="text-sm font-semibold tracking-tight">{pillar.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ValuePillars;
