import { 
  Users,
  Target,
  Plug,
  Landmark,
  Map,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import occuMedLogo from "@/assets/occu-med-logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const [location] = useLocation();

  const isEntities = location.startsWith('/portal/clients');
  const isCompetitors = location.startsWith('/portal/competitors');
  const isFederalAgencies = location.startsWith('/portal/federal-agencies');
  const isStateAgencies = location.startsWith('/portal/state-agencies');
  const isSettings = location.startsWith('/portal/settings');

  return (
    <Sidebar className="border-r border-white/10 bg-background/50 backdrop-blur-xl">
      <SidebarHeader className="px-3 pt-5 pb-3">
        <Link href="/portal/clients" className="flex flex-col items-center transition-opacity hover:opacity-85">
          <img
            src={occuMedLogo}
            alt="Occu-Med"
            className="h-14 w-auto max-w-full object-contain drop-shadow-[0_0_14px_rgba(255,255,255,0.25)]"
          />
          <span className="block text-[9px] text-muted-foreground uppercase tracking-widest text-center mt-2">Insight Hub</span>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Intelligence
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isEntities}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/clients" className="flex items-center gap-3">
                    <Users className="w-4 h-4" />
                    <span>Entities</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isCompetitors}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/competitors" className="flex items-center gap-3">
                    <Target className="w-4 h-4" />
                    <span>Competitors</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isFederalAgencies}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/federal-agencies" className="flex items-center gap-3">
                    <Landmark className="w-4 h-4" />
                    <span>Federal Agencies</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isStateAgencies}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/state-agencies" className="flex items-center gap-3">
                    <Map className="w-4 h-4" />
                    <span>State Agencies</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-white/5" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isSettings}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/settings" className="flex items-center gap-3">
                    <Plug className="w-4 h-4" />
                    <span>Integrations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
