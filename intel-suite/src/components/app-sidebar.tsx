import { 
  LayoutDashboard, 
  Users,
  Target,
  Home,
  Plug,
  UserSearch,
  Landmark,
  Map
} from "lucide-react";
import { Link, useLocation } from "wouter";
import occuMedLogo from "@assets/OM-logo-150dpi_1774901578920.png";
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

  const isHome = location === '/';
  const isOpps = location.startsWith('/portal/opportunities');
  const isClients = location.startsWith('/portal/clients');
  const isCompetitors = location.startsWith('/portal/competitors');
  const isProspects = location.startsWith('/portal/prospects');
  const isFederalAgencies = location.startsWith('/portal/federal-agencies');
  const isStateAgencies = location.startsWith('/portal/state-agencies');
  const isSettings = location.startsWith('/portal/settings');

  return (
    <Sidebar className="border-r border-white/10 bg-background/50 backdrop-blur-xl">
      <SidebarHeader className="p-4 pb-3">
        <Link href="/" className="flex flex-col gap-1.5 transition-opacity hover:opacity-85">
          <div className="bg-white rounded-xl px-3 py-2 shadow-lg shadow-black/20">
            <img src={occuMedLogo} alt="Occu-Med" className="h-8 w-auto object-contain" />
          </div>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest pl-1">Insight Hub</span>
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
                  isActive={isHome}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/" className="flex items-center gap-3">
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isOpps}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/opportunities" className="flex items-center gap-3">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Opportunities</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isClients}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/clients" className="flex items-center gap-3">
                    <Users className="w-4 h-4" />
                    <span>Clients</span>
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
                  isActive={isProspects}
                  className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all"
                >
                  <Link href="/portal/prospects" className="flex items-center gap-3">
                    <UserSearch className="w-4 h-4" />
                    <span>Prospects</span>
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
