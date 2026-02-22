import { useState } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LiveTicker from "@/components/LiveTicker";
import TerminalPreview from "@/components/TerminalPreview";
import ValuePillars from "@/components/ValuePillars";
import Footer from "@/components/Footer";
import TerminalDashboard from "@/components/terminal/TerminalDashboard";

const Index = () => {
  const [isTerminalLaunched, setIsTerminalLaunched] = useState(false);

  if (isTerminalLaunched) {
    return <TerminalDashboard onExit={() => setIsTerminalLaunched(false)} />;
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navbar />
      <LiveTicker />
      <Hero onLaunchTerminal={() => setIsTerminalLaunched(true)} />
      <TerminalPreview />
      <ValuePillars />
      <Footer />
    </div>
  );
};

export default Index;
