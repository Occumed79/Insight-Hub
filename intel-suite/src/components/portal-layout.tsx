import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export function PortalLayout({ children }: { children: ReactNode }) {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex min-h-screen w-full bg-background relative overflow-hidden">
        {/* Abstract background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-15%] left-[-8%]  w-[50%] h-[50%] rounded-full bg-primary/22 blur-[140px]" />
          <div className="absolute bottom-[-12%] right-[-6%] w-[42%] h-[60%] rounded-full bg-primary/14 blur-[140px]" />
          <div className="absolute top-[35%]  left-[28%]  w-[30%] h-[35%] rounded-full bg-primary/9  blur-[110px]" />
        </div>

        <AppSidebar />
        
        <div className="flex flex-col flex-1 relative z-10 w-full overflow-hidden">
          <header className="flex items-center h-16 px-4 shrink-0 border-b border-white/5 bg-background/40 backdrop-blur-md">
            <SidebarTrigger className="text-muted-foreground hover:text-white transition-colors" />
            <div className="ml-auto flex items-center space-x-4">
              {/* Optional top right user avatar or actions could go here */}
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
