import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

const GlowBackground = () => (
  <>
    <style>{`
      @keyframes orb1 {
        0%   { transform: translate(0px, 0px) scale(1); }
        25%  { transform: translate(60px, 80px) scale(1.12); }
        50%  { transform: translate(20px, 140px) scale(0.92); }
        75%  { transform: translate(-40px, 60px) scale(1.06); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      @keyframes orb2 {
        0%   { transform: translate(0px, 0px) scale(1); }
        25%  { transform: translate(-80px, -60px) scale(1.15); }
        50%  { transform: translate(-30px, -120px) scale(0.88); }
        75%  { transform: translate(50px, -50px) scale(1.08); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      @keyframes orb3 {
        0%   { transform: translate(0px, 0px) scale(1); }
        33%  { transform: translate(100px, -80px) scale(1.2); }
        66%  { transform: translate(-60px, 60px) scale(0.85); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      @keyframes orb-pulse {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50%       { opacity: 0.85; transform: scale(1.15); }
      }
    `}</style>

    {/* Fixed-position so it truly covers the whole viewport behind everything */}
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      overflow: "hidden",
    }}>
      {/* Big primary orb — top left */}
      <div style={{
        position: "absolute",
        top: "-10%",
        left: "-5%",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle at center, rgba(56,182,255,0.55) 0%, rgba(56,182,255,0.25) 35%, transparent 70%)",
        filter: "blur(40px)",
        animation: "orb1 20s ease-in-out infinite",
      }} />

      {/* Vivid cyan orb — bottom right */}
      <div style={{
        position: "absolute",
        bottom: "-8%",
        right: "-5%",
        width: "700px",
        height: "700px",
        borderRadius: "50%",
        background: "radial-gradient(circle at center, rgba(30,140,255,0.60) 0%, rgba(80,200,255,0.28) 35%, transparent 70%)",
        filter: "blur(45px)",
        animation: "orb2 26s ease-in-out infinite",
        animationDelay: "-10s",
      }} />

      {/* Accent teal orb — center */}
      <div style={{
        position: "absolute",
        top: "30%",
        left: "35%",
        width: "450px",
        height: "450px",
        borderRadius: "50%",
        background: "radial-gradient(circle at center, rgba(0,200,220,0.45) 0%, rgba(56,182,255,0.20) 40%, transparent 70%)",
        filter: "blur(35px)",
        animation: "orb3 16s ease-in-out infinite",
        animationDelay: "-6s",
      }} />

      {/* Small intense sparkle — top right */}
      <div style={{
        position: "absolute",
        top: "5%",
        right: "10%",
        width: "280px",
        height: "280px",
        borderRadius: "50%",
        background: "radial-gradient(circle at center, rgba(100,210,255,0.70) 0%, rgba(56,182,255,0.30) 40%, transparent 70%)",
        filter: "blur(25px)",
        animation: "orb-pulse 8s ease-in-out infinite",
        animationDelay: "-3s",
      }} />

      {/* Bottom left warm fill */}
      <div style={{
        position: "absolute",
        bottom: "10%",
        left: "8%",
        width: "350px",
        height: "350px",
        borderRadius: "50%",
        background: "radial-gradient(circle at center, rgba(30,100,255,0.50) 0%, rgba(56,182,255,0.22) 40%, transparent 70%)",
        filter: "blur(30px)",
        animation: "orb-pulse 13s ease-in-out infinite",
        animationDelay: "-7s",
      }} />
    </div>
  </>
);

export function PortalLayout({ children }: { children: ReactNode }) {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      {/* z-0 base so GlowBackground (fixed, z-0) sits behind everything */}
      <div className="flex min-h-screen w-full bg-background relative" style={{ isolation: "isolate" }}>
        <GlowBackground />

        {/* Sidebar needs z above glow */}
        <div style={{ position: "relative", zIndex: 10 }}>
          <AppSidebar />
        </div>

        <div className="flex flex-col flex-1 w-full overflow-hidden" style={{ position: "relative", zIndex: 10 }}>
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
