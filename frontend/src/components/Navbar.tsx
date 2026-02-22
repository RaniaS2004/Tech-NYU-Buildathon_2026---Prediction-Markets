import ConvergeLogo from "./ConvergeLogo";

const Navbar = () => {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <ConvergeLogo className="w-5 h-5" />
            <span className="font-mono text-sm font-semibold tracking-wider uppercase">Converge</span>
          </div>
          <div className="hidden sm:flex items-center gap-5">
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Product</a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Docs</a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </div>
        </div>
        <button className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors">
          Get Access
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
