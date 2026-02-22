import { useState } from "react";
import { useMarketSpreads } from "@/hooks/useMarketSpreads";
import CommandCenter from "./CommandCenter";
import PrimeSignal from "./PrimeSignal";
import GlobalMacroHeatmap from "./GlobalMacroHeatmap";
import LiveDisagreementFeed from "./LiveDisagreementFeed";
import IntelligenceGraph from "./IntelligenceGraph";

type Tab = "feed" | "graph";

const TerminalDashboard = ({ onExit }: { onExit?: () => void }) => {
  const { data, loading, status } = useMarketSpreads(true, 5000);
  const [activeTab, setActiveTab] = useState<Tab>("feed");

  return (
    <div className="min-h-screen bg-background flex flex-col animate-terminal-in">
      <CommandCenter status={status} onExit={onExit} />

      {/* Tab bar */}
      <div className="px-6 pt-4 flex items-center gap-1">
        {([
          { key: "feed" as Tab, label: "Live Feed" },
          { key: "graph" as Tab, label: "Intelligence Graph" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-colors duration-150 ${
              activeTab === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {activeTab === "feed" ? (
          loading ? (
            <div className="flex items-center justify-center h-64">
              <span className="font-mono text-sm text-muted-foreground animate-pulse">Initializing feeds…</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PrimeSignal data={data} />
                <GlobalMacroHeatmap data={data} />
              </div>
              <LiveDisagreementFeed data={data} />
            </>
          )
        ) : (
          <IntelligenceGraph />
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-border flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">
          {data.length} contracts · 2 venues · polling 5s
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">CONVERGE v0.1</span>
      </div>
    </div>
  );
};

export default TerminalDashboard;
