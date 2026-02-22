import { useEffect, useState } from "react";

const NODE_COUNT = 11;

const ConvergeLogo = ({ className = "w-6 h-6" }: { className?: string }) => {
  const [activeNodes, setActiveNodes] = useState<Set<number>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const count = Math.floor(Math.random() * 3) + 1;
      const newActive = new Set<number>();
      for (let i = 0; i < count; i++) {
        newActive.add(Math.floor(Math.random() * NODE_COUNT));
      }
      setActiveNodes(newActive);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const nodeOpacity = (i: number, base: number) =>
    activeNodes.has(i) ? 1 : base;
  const nodeClass = (i: number) =>
    activeNodes.has(i) ? "text-foreground" : "text-muted-foreground";

  return (
    <svg viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Back edges */}
      <line x1="60" y1="8" x2="30" y2="45" stroke="currentColor" strokeWidth="1.2" opacity="0.25" className="text-foreground" />
      <line x1="60" y1="8" x2="90" y2="45" stroke="currentColor" strokeWidth="1.2" opacity="0.25" className="text-foreground" />
      <line x1="60" y1="8" x2="60" y2="50" stroke="currentColor" strokeWidth="1" opacity="0.15" className="text-foreground" />

      {/* Mid-layer edges */}
      <line x1="30" y1="45" x2="90" y2="45" stroke="currentColor" strokeWidth="1.5" opacity="0.35" className="text-foreground" />
      <line x1="30" y1="45" x2="60" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" className="text-foreground" />
      <line x1="90" y1="45" x2="60" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" className="text-foreground" />

      {/* Lower triangle edges */}
      <line x1="20" y1="75" x2="60" y2="95" stroke="currentColor" strokeWidth="1.5" opacity="0.4" className="text-foreground" />
      <line x1="100" y1="75" x2="60" y2="95" stroke="currentColor" strokeWidth="1.5" opacity="0.4" className="text-foreground" />
      <line x1="20" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="1.5" opacity="0.35" className="text-foreground" />

      {/* Connecting edges */}
      <line x1="30" y1="45" x2="20" y2="75" stroke="currentColor" strokeWidth="1.5" opacity="0.4" className="text-foreground" />
      <line x1="90" y1="45" x2="100" y2="75" stroke="currentColor" strokeWidth="1.5" opacity="0.4" className="text-foreground" />
      <line x1="60" y1="50" x2="60" y2="95" stroke="currentColor" strokeWidth="1" opacity="0.2" className="text-foreground" />
      <line x1="30" y1="45" x2="60" y2="95" stroke="currentColor" strokeWidth="1" opacity="0.2" className="text-foreground" />
      <line x1="90" y1="45" x2="60" y2="95" stroke="currentColor" strokeWidth="1" opacity="0.2" className="text-foreground" />
      <line x1="60" y1="50" x2="20" y2="75" stroke="currentColor" strokeWidth="1" opacity="0.2" className="text-foreground" />
      <line x1="60" y1="50" x2="100" y2="75" stroke="currentColor" strokeWidth="1" opacity="0.2" className="text-foreground" />

      {/* Interior detail edges */}
      <line x1="45" y1="55" x2="55" y2="65" stroke="currentColor" strokeWidth="0.8" opacity="0.2" className="text-foreground" />
      <line x1="75" y1="55" x2="65" y2="65" stroke="currentColor" strokeWidth="0.8" opacity="0.2" className="text-foreground" />
      <line x1="45" y1="55" x2="75" y2="55" stroke="currentColor" strokeWidth="0.8" opacity="0.2" className="text-foreground" />
      <line x1="55" y1="65" x2="65" y2="65" stroke="currentColor" strokeWidth="0.8" opacity="0.15" className="text-foreground" />

      {/* Small interior nodes */}
      <circle cx="45" cy="55" r="2" fill="currentColor" opacity={nodeOpacity(0, 0.3)} className={`${nodeClass(0)} transition-all duration-500`} />
      <circle cx="75" cy="55" r="2" fill="currentColor" opacity={nodeOpacity(1, 0.3)} className={`${nodeClass(1)} transition-all duration-500`} />
      <circle cx="55" cy="65" r="1.5" fill="currentColor" opacity={nodeOpacity(2, 0.25)} className={`${nodeClass(2)} transition-all duration-500`} />
      <circle cx="65" cy="65" r="1.5" fill="currentColor" opacity={nodeOpacity(3, 0.25)} className={`${nodeClass(3)} transition-all duration-500`} />

      {/* Main nodes — top */}
      <circle cx="60" cy="8" r="5" fill="currentColor" opacity={nodeOpacity(4, 0.7)} className={`${nodeClass(4)} transition-all duration-500`} />

      {/* Main nodes — mid */}
      <circle cx="30" cy="45" r="6" fill="currentColor" opacity={nodeOpacity(5, 0.8)} className={`${nodeClass(5)} transition-all duration-500`} />
      <circle cx="90" cy="45" r="6" fill="currentColor" opacity={nodeOpacity(6, 0.8)} className={`${nodeClass(6)} transition-all duration-500`} />
      <circle cx="60" cy="50" r="4.5" fill="currentColor" opacity={nodeOpacity(7, 0.5)} className={`${nodeClass(7)} transition-all duration-500`} />

      {/* Main nodes — bottom */}
      <circle cx="20" cy="75" r="7" fill="currentColor" opacity={nodeOpacity(8, 0.9)} className={`${nodeClass(8)} transition-all duration-500`} />
      <circle cx="100" cy="75" r="7" fill="currentColor" opacity={nodeOpacity(9, 0.9)} className={`${nodeClass(9)} transition-all duration-500`} />
      <circle cx="60" cy="95" r="7" fill="currentColor" opacity={nodeOpacity(10, 0.9)} className={`${nodeClass(10)} transition-all duration-500`} />
    </svg>
  );
};

export default ConvergeLogo;
