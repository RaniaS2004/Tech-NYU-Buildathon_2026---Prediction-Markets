import ConvergeLogo from "./ConvergeLogo";

const Footer = () => {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ConvergeLogo className="w-4 h-4" />
          <span className="font-mono text-xs text-muted-foreground">
            © 2026 Converge. Institutional-grade prediction market intelligence.
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
          <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Status</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
