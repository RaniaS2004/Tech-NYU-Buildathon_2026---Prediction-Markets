import { useEffect, useRef, useState } from "react";

const TICKER_ITEMS = [
  { label: "FED RATE CUT", value: "62.4¢", change: "+1.2%", positive: true },
  { label: "BTC > $100K", value: "71.8¢", change: "+3.4%", positive: true },
  { label: "WTI > $80", value: "41.7¢", change: "-0.8%", positive: false },
  { label: "CPI > 3.0%", value: "28.3¢", change: "+0.2%", positive: true },
  { label: "EUR/USD > 1.10", value: "55.2¢", change: "-1.1%", positive: false },
  { label: "RECESSION 2026", value: "18.9¢", change: "+0.6%", positive: true },
  { label: "GOLD > $2500", value: "64.1¢", change: "+2.1%", positive: true },
  { label: "S&P > 6000", value: "47.3¢", change: "-0.3%", positive: false },
];

const TickerItem = ({ item }: { item: typeof TICKER_ITEMS[0] }) => (
  <div className="flex items-center gap-3 px-6 whitespace-nowrap">
    <span className="font-mono text-[10px] text-muted-foreground tracking-wider">{item.label}</span>
    <span className="font-mono text-xs text-foreground font-medium">{item.value}</span>
    <span className={`font-mono text-[10px] font-medium ${item.positive ? "text-signal-green" : "text-signal-red"}`}>
      {item.change}
    </span>
  </div>
);

const LiveTicker = () => {
  const [offset, setOffset] = useState(0);
  const animRef = useRef<number>(0);
  const speed = 0.5;

  useEffect(() => {
    const animate = () => {
      setOffset((prev) => prev - speed);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Double the items for seamless loop
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  const resetPoint = TICKER_ITEMS.length * 200; // approximate width per item

  return (
    <div className="border-b border-border bg-card/50 overflow-hidden h-8 flex items-center">
      <div
        className="flex items-center"
        style={{
          transform: `translateX(${offset % resetPoint}px)`,
          willChange: "transform",
        }}
      >
        {doubled.map((item, i) => (
          <TickerItem key={i} item={item} />
        ))}
      </div>
    </div>
  );
};

export default LiveTicker;
