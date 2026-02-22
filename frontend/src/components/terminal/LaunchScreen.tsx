import { Terminal } from "lucide-react";

const LaunchScreen = ({ onLaunch }: { onLaunch: () => void }) => {
  return (
    <div className="min-h-screen bg-background grid-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Converge Terminal</span>
        </div>

        <button
          onClick={onLaunch}
          className="px-8 py-3 border border-border rounded-sm bg-card hover:bg-accent font-mono text-sm tracking-wider text-foreground uppercase transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          Launch Terminal
        </button>

        <span className="font-mono text-[10px] text-muted-foreground">
          Cross-venue prediction market intelligence
        </span>
      </div>
    </div>
  );
};

export default LaunchScreen;
