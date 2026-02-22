import { useState, useRef, useEffect } from "react";
import { Terminal, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ScenarioInputBarProps {
  onSubmit: (query: string) => void;
  loading: boolean;
  progress: number;
}

const ScenarioInputBar = ({ onSubmit, loading, progress }: ScenarioInputBarProps) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
      <form
        onSubmit={handleSubmit}
        className="relative bg-[#0a0a0c] border border-signal-green/30 rounded-sm shadow-[0_0_20px_-4px_hsl(var(--signal-green)/0.15)] overflow-hidden"
      >
        {loading && (
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Loader2 className="w-3 h-3 text-signal-green animate-spin" />
              <span className="font-mono text-[10px] text-signal-green tracking-wider uppercase animate-pulse">
                Scanning Graph Logic…
              </span>
            </div>
            <Progress value={progress} className="h-1 bg-secondary [&>div]:bg-signal-green" />
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-3">
          <Terminal className="w-4 h-4 text-signal-green flex-shrink-0" />
          <span className="font-mono text-[11px] text-signal-green/60 flex-shrink-0">[SYSTEM]&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            placeholder="Enter 'What-if' scenario (e.g., 'CPI spikes to 3.2%')..."
            className="flex-1 bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-50"
          />
        </div>
      </form>
    </div>
  );
};

export default ScenarioInputBar;
