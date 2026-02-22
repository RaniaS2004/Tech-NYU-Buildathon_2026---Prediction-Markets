import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConvergeQueryBoxProps {
  onSubmit: (query: string) => void;
  loading: boolean;
  progress: number;
}

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 200;

const ConvergeQueryBox = ({ onSubmit, loading, progress }: ConvergeQueryBoxProps) => {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = `${MIN_HEIGHT}px`;
    const scroll = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(scroll, MIN_HEIGHT), MAX_HEIGHT)}px`;
  }, []);

  useEffect(() => { resize(); }, [value, resize]);
  useEffect(() => { if (!loading) textareaRef.current?.focus(); }, [loading]);

  const handleSend = () => {
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !loading;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
      <div
        className={`relative bg-zinc-800/90 backdrop-blur-xl rounded-lg overflow-hidden transition-all duration-200 ${
          focused
            ? "border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
            : "border border-zinc-700"
        }`}
      >
        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />
            <span className="font-mono text-[10px] text-emerald-500 tracking-wider uppercase animate-pulse">
              [COMPUTING...]
            </span>
            <div className="flex-1 h-px bg-zinc-700 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500/60 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-zinc-400">{Math.round(progress)}%</span>
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
            placeholder="Run scenario... (e.g., 'What if CPI spikes to 3.2%?')"
            rows={1}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder:text-zinc-400 outline-none resize-none disabled:opacity-50 leading-relaxed py-2"
            style={{ minHeight: `${MIN_HEIGHT - 16}px`, maxHeight: `${MAX_HEIGHT - 16}px` }}
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            className={`mb-1.5 h-8 w-8 rounded-md flex-shrink-0 transition-colors ${
              canSend
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConvergeQueryBox;
