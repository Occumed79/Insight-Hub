import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

// Animated background — slow drifting glowing orbs
const GlowBackground = () => (
  <>
    <style>{`
      @keyframes glow-drift-1 {
        0%   { transform: translate(0%, 0%)   scale(1);    opacity: 0.22; }
        33%  { transform: translate(6%, 8%)   scale(1.08); opacity: 0.30; }
        66%  { transform: translate(-4%, 5%)  scale(0.95); opacity: 0.18; }
        100% { transform: translate(0%, 0%)   scale(1);    opacity: 0.22; }
      }
      @keyframes glow-drift-2 {
        0%   { transform: translate(0%, 0%)   scale(1);    opacity: 0.14; }
        33%  { transform: translate(-7%, -5%) scale(1.1);  opacity: 0.22; }
        66%  { transform: translate(5%, -8%)  scale(0.92); opacity: 0.10; }
        100% { transform: translate(0%, 0%)   scale(1);    opacity: 0.14; }
      }
      @keyframes glow-drift-3 {
        0%   { transform: translate(0%, 0%)   scale(1);    opacity: 0.09; }
        50%  { transform: translate(8%, -6%)  scale(1.15); opacity: 0.16; }
        100% { transform: translate(0%, 0%)   scale(1);    opacity: 0.09; }
      }
      @keyframes glow-pulse {
        0%, 100% { opacity: 0.06; }
        50%       { opacity: 0.13; }
      }
    `}</style>
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Primary large orb — top left */}
      <div style={{
        position: "absolute",
        top: "-15%", left: "-8%",
        width: "55%", height: "55%",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
        filter: "blur(80px)",
        animation: "glow-drift-1 18s ease-in-out infinite",
      }} />
      {/* Secondary orb — bottom right */}
      <div style={{
        position: "absolute",
        bottom: "-14%", right: "-6%",
        width: "48%", height: "62%",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(var(--primary)) 0%, hsl(var(--accent)) 40%, transparent 70%)",
        filter: "blur(90px)",
        animation: "glow-drift-2 22s ease-in-out infinite",
        animationDelay: "-8s",
      }} />
      {/* Center accent orb */}
      <div style={{
        position: "absolute",
        top: "32%", left: "26%",
        width: "32%", height: "38%",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(var(--accent)) 0%, hsl(var(--primary)) 50%, transparent 70%)",
        filter: "blur(70px)",
        animation: "glow-drift-3 14s ease-in-out infinite",
        animationDelay: "-5s",
      }} />
      {/* Small sparkle orb — top right */}
      <div style={{
        position: "absolute",
        top: "8%", right: "12%",
        width: "18%", height: "20%",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
        filter: "blur(50px)",
        animation: "glow-pulse 9s ease-in-out infinite",
        animationDelay: "-3s",
      }} />
      {/* Subtle bottom left fill */}
      <div style={{
        position: "absolute",
        bottom: "5%", left: "10%",
        width: "22%", height: "28%",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)",
        filter: "blur(60px)",
        animation: "glow-pulse 12s ease-in-out infinite",
        animationDelay: "-6s",
      }} />
    </div>
  </>
);

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex min-h-screen w-full bg-background relative overflow-hidden">
        <GlowBackground />
        <AppSidebar />
        <div className="flex flex-col flex-1 relative z-10 w-full overflow-hidden">
          <header className="flex items-center h-16 px-4 shrink-0 border-b border-white/5 bg-background/40 backdrop-blur-md">
            <SidebarTrigger className="text-muted-foreground hover:text-white transition-colors" />
            <div className="ml-auto flex items-center space-x-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/40 to-primary/20 border border-white/10 flex items-center justify-center">
                <span className="text-xs font-bold text-white">IS</span>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-8">
            <div className="mx-auto max-w-7xl w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
