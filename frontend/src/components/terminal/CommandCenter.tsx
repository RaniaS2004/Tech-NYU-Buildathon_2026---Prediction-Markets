import { Activity, Wifi, WifiOff, ArrowLeft } from "lucide-react";
import ConvergeLogo from "../ConvergeLogo";

type Status = "LIVE" | "DEGRADED" | "OFFLINE";

const statusConfig: Record<Status, { color: string; icon: typeof Activity; label: string }> = {
  LIVE: { color: "text-signal-green", icon: Activity, label: "ALL SYSTEMS OPERATIONAL" },
  DEGRADED: { color: "text-signal-amber", icon: Wifi, label: "DEGRADED" },
  OFFLINE: { color: "text-signal-red", icon: WifiOff, label: "OFFLINE" },
};

const CommandCenter = ({ status, onExit }: { status: Status; onExit?: () => void }) => {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        {onExit && (
          <button onClick={onExit} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-150 mr-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] uppercase tracking-wider">Exit</span>
          </button>
        )}
        <ConvergeLogo className="w-4 h-4" />
        <span className="font-mono text-xs tracking-widest text-muted-foreground">CONVERGE</span>
        <span className="text-border">|</span>
        <span className="text-border">|</span>
        <span className="font-sans text-sm font-semibold text-foreground tracking-tight">
          Prediction Market Command Center
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${status === "LIVE" ? "bg-signal-green animate-pulse-dot" : status === "DEGRADED" ? "bg-signal-amber" : "bg-signal-red"}`} />
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        <span className={`font-mono text-[10px] uppercase tracking-wider ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
};

export default CommandCenter;
