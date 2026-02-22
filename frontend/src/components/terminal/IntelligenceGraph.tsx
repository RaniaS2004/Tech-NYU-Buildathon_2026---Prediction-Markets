import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useGraphData, type GraphNode, type GraphLink, type HubNode } from "@/hooks/useGraphData";
import { useArbitrageAlerts } from "@/hooks/useArbitrageAlerts";
import { useScenario } from "@/hooks/useScenario";
import { X, AlertTriangle, Network, ChevronLeft, ChevronRight, LocateFixed, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import AlphaFeed from "./AlphaFeed";
import ConvergeQueryBox from "./ConvergeQueryBox";
import ScenarioAnalysisDrawer from "./ScenarioAnalysisDrawer";

/* ── colour map ── */
const EDGE_COLORS: Record<string, string> = {
  equivalent: "#F59E0B",
  implied: "#10B981",
  conditional: "#10B981",
  exclusive: "#EF4444",
  correlated: "#71717A",
};

const edgeColor = (type: string) => {
  const t = (type ?? "").toLowerCase().replace(/_/g, " ").trim();
  if (EDGE_COLORS[t]) return EDGE_COLORS[t];
  if (t.includes("equivalent") || t.includes("arbitrage")) return EDGE_COLORS.equivalent;
  if (t.includes("exclusive")) return EDGE_COLORS.exclusive;
  if (t.includes("implied") || t.includes("conditional")) return EDGE_COLORS.implied;
  if (t.includes("correlated")) return EDGE_COLORS.correlated;
  for (const word of t.split(" ")) {
    if (EDGE_COLORS[word]) return EDGE_COLORS[word];
  }
  return EDGE_COLORS.correlated;
};

type FilterCategory = "equivalent" | "implied" | "exclusive" | "correlated";
const ALL_CATEGORIES: FilterCategory[] = ["equivalent", "implied", "exclusive", "correlated"];

const classifyRelType = (type: string): FilterCategory => {
  const t = (type ?? "").toLowerCase().replace(/_/g, " ").trim();
  if (t.includes("equivalent") || t.includes("arbitrage")) return "equivalent";
  if (t.includes("exclusive")) return "exclusive";
  if (t.includes("implied") || t.includes("conditional")) return "implied";
  return "correlated";
};

const LEGEND: { key: FilterCategory; label: string; color: string }[] = [
  { key: "equivalent", label: "Equivalent (Arbitrage)", color: "#F59E0B" },
  { key: "implied", label: "Implied / Conditional", color: "#10B981" },
  { key: "exclusive", label: "Mutually Exclusive", color: "#EF4444" },
  { key: "correlated", label: "Correlated", color: "#71717A" },
];

/* ── Node side-panel ── */
const NodePanel = ({ node, onClose }: { node: GraphNode; onClose: () => void }) => (
  <div className="absolute top-4 right-4 w-80 bg-card border border-border rounded-sm shadow-xl z-20 animate-terminal-in">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Market Detail</span>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
    <div className="p-4 space-y-3">
      <h3 className="font-sans text-sm font-semibold text-foreground leading-tight">{node.label}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="font-mono text-[10px] text-muted-foreground block">Probability</span>
          <span className="font-mono text-sm text-foreground">{node.probability !== null ? `${node.probability.toFixed(1)}%` : "—"}</span>
        </div>
        <div>
          <span className="font-mono text-[10px] text-muted-foreground block">Liquidity</span>
          <span className="font-mono text-sm text-foreground">{node.liquidity_score !== null ? `$${(node.liquidity_score / 1000).toFixed(1)}K` : "—"}</span>
        </div>
        <div>
          <span className="font-mono text-[10px] text-muted-foreground block">Settlement</span>
          <span className="font-mono text-sm text-foreground">{node.settlement_source ?? "—"}</span>
        </div>
        <div>
          <span className="font-mono text-[10px] text-muted-foreground block">Connections</span>
          <span className="font-mono text-sm text-foreground">{node.hub_link_count}</span>
        </div>
      </div>
    </div>
  </div>
);

/* ── Edge audit modal ── */
/* ── Fallback descriptions ── */
const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  equivalent: "Direct price parity expected across venues.",
  implied: "Conditional logic suggests a secondary move here.",
  exclusive: "Strict logical contradiction; these cannot both be true.",
  correlated: "Historical or statistical trend link detected.",
};

const AuditModal = ({ link, onClose }: { link: GraphLink; onClose: () => void }) => {
  const hasRisk = !!link.risk_alert;
  const category = classifyRelType(link.relationship_type ?? "");
  const borderColor = EDGE_COLORS[category] ?? EDGE_COLORS.correlated;

  // Fallback chain: logic_justification → vantage_insight → static description
  const justification =
    (link.logic_justification && link.logic_justification.trim()) ||
    (link.vantage_insight && link.vantage_insight.trim()) ||
    FALLBACK_DESCRIPTIONS[category] ||
    FALLBACK_DESCRIPTIONS.correlated;

  const confPct = link.confidence_score != null ? (link.confidence_score * 100).toFixed(0) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 bg-[#09090b] rounded-sm shadow-2xl animate-terminal-in"
        style={{ border: `1px solid ${borderColor}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${borderColor}40` }}>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: borderColor }} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{link.relationship_type}</span>
            {confPct && (
              <span
                className="font-mono text-[9px] px-1.5 py-0.5 rounded-full ml-2"
                style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
              >
                {confPct}% conf
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {hasRisk && (
            <div className="flex items-center gap-2 px-3 py-2 border rounded-sm border-signal-amber/40 bg-signal-amber/5 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-signal-amber flex-shrink-0" />
              <span className="font-mono text-xs text-signal-amber font-semibold tracking-wide">INEFFICIENCY DETECTED</span>
            </div>
          )}
          {link.vantage_insight && link.logic_justification?.trim() && (
            <div>
              <span className="font-mono text-[10px] text-zinc-500 block mb-1">CONVERGE INSIGHT</span>
              <p className="font-mono text-sm text-zinc-300 leading-relaxed">{link.vantage_insight}</p>
            </div>
          )}
          {(link.probability_a !== null || link.probability_b !== null) && (
            <div className="flex gap-4">
              <div>
                <span className="font-mono text-[10px] text-zinc-500 block">P(A)</span>
                <span className="font-mono text-sm text-zinc-200">{link.probability_a?.toFixed(1) ?? "—"}%</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-zinc-500 block">P(B)</span>
                <span className="font-mono text-sm text-zinc-200">{link.probability_b?.toFixed(1) ?? "—"}%</span>
              </div>
              {link.probability_spread !== null && (
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 block">Spread</span>
                  <span className="font-mono text-sm text-signal-amber">{link.probability_spread.toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}
          <div>
            <span className="font-mono text-[10px] text-zinc-500 block mb-1">JUSTIFICATION</span>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed max-h-48 overflow-y-auto">
              {justification}
            </p>
          </div>
          {hasRisk && (
            <div>
              <span className="font-mono text-[10px] text-signal-amber block mb-1">RISK ALERT</span>
              <p className="font-mono text-xs text-signal-amber/80">{link.risk_alert}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Sidebar with interactive legend ── */
interface GraphSidebarProps {
  hubs: HubNode[];
  totalRels: number;
  filteredRels: number;
  collapsed: boolean;
  onToggle: () => void;
  visibleTypes: Set<FilterCategory>;
  onToggleType: (cat: FilterCategory) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const GraphSidebar = ({ hubs, totalRels, filteredRels, collapsed, onToggle, visibleTypes, onToggleType, onShowAll, onHideAll }: GraphSidebarProps) => {
  const allVisible = visibleTypes.size === ALL_CATEGORIES.length;
  return (
    <div className={`absolute top-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-sm z-10 transition-all duration-200 ${collapsed ? "w-8" : "w-56"}`}>
      {collapsed ? (
        <button onClick={onToggle} className="w-full h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <>
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Filter</span>
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-3 h-3" /></button>
          </div>
          <div className="p-3 space-y-1">
            {LEGEND.map((l) => {
              const active = visibleTypes.has(l.key);
              return (
                <button
                  key={l.key}
                  onClick={() => onToggleType(l.key)}
                  className="flex items-center gap-2 w-full text-left py-0.5 group transition-opacity"
                  style={{ opacity: active ? 1 : 0.3 }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 border transition-colors"
                    style={{ backgroundColor: active ? l.color : "transparent", borderColor: l.color }}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">{l.label}</span>
                </button>
              );
            })}
            <button
              onClick={allVisible ? onHideAll : onShowAll}
              className="flex items-center gap-1.5 mt-2 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {allVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {allVisible ? "Hide All" : "Show All"}
            </button>
          </div>
          <div className="px-3 py-2.5 border-t border-border">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Top Hubs</span>
            {hubs.map((h) => (
              <div key={h.market_key} className="flex items-center justify-between py-1">
                <span className="font-mono text-[10px] text-foreground truncate max-w-[140px]">{h.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{h.link_count}</span>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border">
            <span className="font-mono text-[10px] text-muted-foreground">{filteredRels} / {totalRels} relationships</span>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Hover tooltip ── */
const NodeTooltip = ({ node, pos }: { node: GraphNode; pos: { x: number; y: number } }) => (
  <div
    className="absolute z-30 pointer-events-none px-2.5 py-1.5 rounded bg-[#18181b] border border-border shadow-lg"
    style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -120%)" }}
  >
    <span className="font-mono text-[10px] text-white whitespace-nowrap">{node.label}</span>
    {node.probability !== null && (
      <span className="font-mono text-[10px] text-muted-foreground ml-2">{node.probability.toFixed(0)}%</span>
    )}
  </div>
);


const nodeRadius = (hub: number) => (hub || 1) * 0.8 + 3;

/* ── Main Component ── */
const IntelligenceGraph = () => {
  const { data, loading, error } = useGraphData();
  const { alerts, flashingPairs } = useArbitrageAlerts();
  const { report: scenarioReport, loading: scenarioLoading, progress: scenarioProgress, submitScenario, clearReport } = useScenario();
  const activeAlertPairs = useMemo(() => new Set(alerts.map((a) => a.market_pair)), [alerts]);

  // Scenario affected sets for ripple effect
  const affectedNodeSet = useMemo(() => new Set(scenarioReport?.affected_nodes ?? []), [scenarioReport]);
  const affectedEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of scenarioReport?.affected_edges ?? []) {
      set.add(`${e.source}__${e.target}`);
      set.add(`${e.target}__${e.source}`);
    }
    return set;
  }, [scenarioReport]);
  const hasScenario = !!scenarioReport && scenarioReport.status === "complete";

  const prevAlertCount = useRef(0);
  useEffect(() => {
    if (alerts.length > prevAlertCount.current && prevAlertCount.current > 0) {
      const latest = alerts[0];
      toast("⚡ Alpha Alert", {
        description: `${latest.market_pair} — spread ${latest.spread.toFixed(2)}%`,
        duration: 4000,
      });
    }
    prevAlertCount.current = alerts.length;
  }, [alerts]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<FilterCategory>>(new Set(ALL_CATEGORIES));
  const [showAnalysisDrawer, setShowAnalysisDrawer] = useState(false);
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Auto-open drawer when scenario completes
  useEffect(() => {
    if (hasScenario) setShowAnalysisDrawer(true);
  }, [hasScenario]);

  const handleToggleType = useCallback((cat: FilterCategory) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);
  const handleShowAll = useCallback(() => setVisibleTypes(new Set(ALL_CATEGORIES)), []);
  const handleHideAll = useCallback(() => setVisibleTypes(new Set()), []);

  const visibleLinkCount = useMemo(() => {
    if (!data) return 0;
    return data.links.filter((link) => {
      const rt = typeof link.relationship_type === "string" ? link.relationship_type : "";
      return visibleTypes.has(classifyRelType(rt));
    }).length;
  }, [data, visibleTypes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !graphRef.current) return;
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 100);
    }, 500);
    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    if (!graphRef.current) return;
    const fg = graphRef.current;
    fg.d3Force("charge")?.strength(-600);
    fg.d3Force("center")?.strength(0.03);
    fg.d3Force("link")?.distance((link: any) => {
      const t = (link.relationship_type ?? "").toLowerCase().replace(/_/g, " ").trim();
      if (t.includes("equivalent") || t.includes("arbitrage")) return 80;
      if (t.includes("correlated")) return 250;
      return 200;
    });
  }, [data]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedLink(null);
    setSelectedNode(node as GraphNode);
  }, []);

  const handleLinkClick = useCallback((link: any) => {
    setSelectedNode(null);
    setSelectedLink(link as GraphLink);
  }, []);

  const handleCenterGraph = useCallback(() => {
    graphRef.current?.zoomToFit(400, 100);
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    if (node) {
      setHoveredNode(node as GraphNode);
      const fg = graphRef.current;
      if (fg) {
        const coords = fg.graph2ScreenCoords(node.x, node.y);
        setTooltipPos({ x: coords.x, y: coords.y });
      }
    } else {
      setHoveredNode(null);
      setTooltipPos(null);
    }
  }, []);

  const handleCloseScenario = useCallback(() => {
    setShowAnalysisDrawer(false);
    clearReport();
  }, [clearReport]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const hub = node.hub_link_count ?? 0;
    const isAffected = hasScenario && affectedNodeSet.has(node.id);
    const isDimmed = hasScenario && !isAffected;

    // Scale up affected nodes
    const r = isAffected ? nodeRadius(hub) * 1.8 : nodeRadius(hub);
    const isHub = hub >= 3;

    if (isDimmed) {
      // Dimmed node
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(16, 185, 129, 0.03)";
      ctx.fill();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      return;
    }

    // Glow for affected nodes
    if (isAffected) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 500);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 8, 0, 2 * Math.PI);
      const gradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 8);
      gradient.addColorStop(0, `rgba(16, 185, 129, ${0.3 * pulse})`);
      gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    if (isHub && !isAffected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
      const gradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 4);
      gradient.addColorStop(0, "rgba(16, 185, 129, 0.1)");
      gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = isAffected ? "rgba(16, 185, 129, 0.35)" : "rgba(16, 185, 129, 0.15)";
    ctx.fill();
    ctx.strokeStyle = isAffected ? "rgba(16, 185, 129, 1)" : isHub ? "rgba(16, 185, 129, 0.8)" : "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = isAffected ? 2 : 1;
    ctx.stroke();

    // Draw label for affected nodes
    if (isAffected) {
      ctx.font = "bold 4px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(16, 185, 129, ${pulse})`;
      ctx.fillText(node.label, node.x, node.y + r + 3);
    }
  }, [hasScenario, affectedNodeSet]);

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const s = link.source;
    const t = link.target;
    if (!s?.x || !t?.x) return;

    const type = (link.relationship_type ?? "").toLowerCase().replace(/_/g, " ").trim();
    const category = classifyRelType(link.relationship_type ?? "");
    const isVisible = visibleTypes.has(category);
    if (!isVisible) return;

    const sId = typeof s === "object" ? s.id : s;
    const tId = typeof t === "object" ? t.id : t;
    const isAffectedEdge = hasScenario && affectedEdgeSet.has(`${sId}__${tId}`);
    const isDimmedEdge = hasScenario && !isAffectedEdge;

    const isHovered = hoveredLinkId === link.id;
    const color = edgeColor(link.relationship_type);
    const isEquivalent = type.includes("equivalent") || type.includes("arbitrage");

    const sLabel = typeof s === "object" ? s.label ?? s.id : s;
    const tLabel = typeof t === "object" ? t.label ?? t.id : t;
    const hasActiveAlert = activeAlertPairs.has(`${sLabel} / ${tLabel}`) || activeAlertPairs.has(`${tLabel} / ${sLabel}`);
    const isFlashing = flashingPairs.has(`${sLabel} / ${tLabel}`) || flashingPairs.has(`${tLabel} / ${sLabel}`);

    if (isDimmedEdge) {
      // Draw a very faint line for dimmed edges
      const midX = (s.x + t.x) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const cpX = midX - dy * 0.2;
      const cpY = (s.y + t.y) / 2 + dx * 0.2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(cpX, cpY, t.x, t.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.06;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Flashing glow effect for new alerts
    if (isFlashing) {
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const dist = Math.hypot(t.x - s.x, t.y - s.y);
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      const glowRadius = dist * 0.6;
      const grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, glowRadius);
      grad.addColorStop(0, `rgba(245, 158, 11, ${0.15 * pulse})`);
      grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.beginPath();
      ctx.arc(midX, midY, glowRadius, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (isEquivalent && !isFlashing) {
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const dist = Math.hypot(t.x - s.x, t.y - s.y);
      const auraRadius = dist * 0.55;
      const grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, auraRadius);
      grad.addColorStop(0, "rgba(245, 158, 11, 0.06)");
      grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.beginPath();
      ctx.arc(midX, midY, auraRadius, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    const midX = (s.x + t.x) / 2;
    const midY = (s.y + t.y) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const curvature = 0.2;
    const cpX = midX - dy * curvature;
    const cpY = midY + dx * curvature;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(cpX, cpY, t.x, t.y);
    ctx.strokeStyle = color;
    const isThick = isEquivalent || type.includes("exclusive") || type.includes("implied") || type.includes("conditional");
    const baseWidth = isEquivalent ? 2.5 : isThick ? 1.8 : 1;
    ctx.lineWidth = hasActiveAlert ? baseWidth * 3 : isAffectedEdge ? baseWidth * 2 : baseWidth;
    ctx.globalAlpha = isAffectedEdge ? 0.9 : isHovered || isFlashing ? 0.85 : hasActiveAlert ? 0.65 : 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Directional particles — scenario ripple gets high density
    const showParticles = isEquivalent || isHovered || hasActiveAlert || isAffectedEdge;
    if (showParticles) {
      const particleCount = isAffectedEdge ? 10 : hasActiveAlert ? 4 : isEquivalent ? 2 : 1;
      const speed = isAffectedEdge ? 600 : hasActiveAlert ? 1200 : 3000;
      for (let i = 0; i < particleCount; i++) {
        const time = Date.now() / speed;
        const progress = ((time + i * (1 / particleCount)) % 1);
        const dir = link.impact_direction?.toLowerCase();
        const t2 = dir !== "negative" ? progress : 1 - progress;
        const px = (1 - t2) * (1 - t2) * s.x + 2 * (1 - t2) * t2 * cpX + t2 * t2 * t.x;
        const py = (1 - t2) * (1 - t2) * s.y + 2 * (1 - t2) * t2 * cpY + t2 * t2 * t.y;
        ctx.beginPath();
        ctx.arc(px, py, isAffectedEdge ? 2.5 : hasActiveAlert ? 3 : isEquivalent ? 2 : 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = isAffectedEdge ? "#10B981" : color;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }, [hoveredLinkId, visibleTypes, flashingPairs, activeAlertPairs, hasScenario, affectedEdgeSet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="font-mono text-sm text-muted-foreground animate-pulse">Loading graph data…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="font-mono text-sm text-signal-red">Failed to load graph: {error}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-180px)] border border-border rounded-sm overflow-hidden" style={{ backgroundColor: "#09090b" }}>
      {/* Analysis drawer */}
      {showAnalysisDrawer && scenarioReport && (
        <ScenarioAnalysisDrawer report={scenarioReport} onClose={handleCloseScenario} />
      )}

      <GraphSidebar
        hubs={data.meta.hub_nodes}
        totalRels={data.meta.total_relationships}
        filteredRels={visibleLinkCount}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        visibleTypes={visibleTypes}
        onToggleType={handleToggleType}
        onShowAll={handleShowAll}
        onHideAll={handleHideAll}
      />

      {hoveredNode && tooltipPos && <NodeTooltip node={hoveredNode} pos={tooltipPos} />}
      

      <button
        onClick={handleCenterGraph}
        className="absolute bottom-16 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-card/90 backdrop-blur-sm border border-border rounded-sm font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <LocateFixed className="w-3 h-3" />
        Center
      </button>

      {selectedNode && <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
      {selectedLink && <AuditModal link={selectedLink} onClose={() => setSelectedLink(null)} />}

      <AlphaFeed alerts={alerts} />

      <ConvergeQueryBox onSubmit={submitScenario} loading={scenarioLoading} progress={scenarioProgress} />

      <ForceGraph2D
        ref={graphRef}
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeRelSize={2}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const r = nodeRadius(node.hub_link_count ?? 0);
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        linkPointerAreaPaint={(link: any, color, ctx) => {
          const s = link.source;
          const t = link.target;
          if (!s?.x || !t?.x) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = 8;
          ctx.stroke();
        }}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onNodeHover={handleNodeHover}
        onLinkHover={(link: any) => {
          setHoveredLinkId(link?.id ?? null);
        }}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={80}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.4}
        enableNodeDrag={true}
      />
    </div>
  );
};

export default IntelligenceGraph;
