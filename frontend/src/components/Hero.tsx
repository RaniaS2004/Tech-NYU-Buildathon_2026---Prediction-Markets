import { ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import ConvergeLogo from "./ConvergeLogo";
import AnimatedCounter from "./AnimatedCounter";

const ROTATING_WORDS = ["Prediction Markets.", "Macro Intelligence.", "Cross-Venue Alpha.", "Information Arbitrage."];

const Hero = ({ onLaunchTerminal }: { onLaunchTerminal?: () => void }) => {
  const [wordIndex, setWordIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        setIsVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative pt-32 pb-16 px-6 overflow-hidden">
      {/* Radial glow behind logo */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-glow/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Status badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 border border-border rounded-sm mb-8 animate-terminal-in">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse-dot" />
          <span className="text-xs font-mono text-muted-foreground tracking-wide uppercase">
            Live · 2 Venues Connected
          </span>
        </div>

        {/* Large logo with slow spin */}
        <div className="flex justify-center mb-8">
          <div className="animate-slow-spin">
            <ConvergeLogo className="w-20 h-20 sm:w-24 sm:h-24" />
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
          The Institutional Layer for
          <br />
          <span
            className="inline-block transition-all duration-300 text-glow"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(8px)",
            }}
          >
            {ROTATING_WORDS[wordIndex]}
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
          Cross-venue liquidity analysis and real-time divergence tracking
          for the modern macro desk.
        </p>

        {/* Live stats strip */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 mb-10">
          <div className="text-center">
            <div className="font-mono text-2xl sm:text-3xl font-semibold text-foreground">
              <AnimatedCounter end={26.4} suffix="M" prefix="$" decimals={1} />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase mt-1">24h Volume</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <div className="font-mono text-2xl sm:text-3xl font-semibold text-signal-amber">
              <AnimatedCounter end={3.2} suffix="%" prefix="+" decimals={1} />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase mt-1">Max Spread</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <div className="font-mono text-2xl sm:text-3xl font-semibold text-signal-green">
              <AnimatedCounter end={12} suffix="ms" decimals={0} />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase mt-1">Latency</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onLaunchTerminal}
            className="group inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium text-sm rounded-sm hover:bg-primary/90 transition-all hover:gap-3"
          >
            Launch Terminal
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button className="inline-flex items-center gap-2 px-6 py-3 border border-border text-muted-foreground font-medium text-sm rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors">
            View Documentation
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
