import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/home";
import OpportunitiesDashboard from "@/pages/portal/opportunities";
import ClientsPage from "@/pages/portal/clients";
import CompetitorsPage from "@/pages/portal/competitors";
import ProspectsPage from "@/pages/portal/prospects";
import ProspectDetailPage from "@/pages/portal/prospect-detail";
import FederalAgenciesPage from "@/pages/portal/federal-agencies";
import StateAgenciesPage from "@/pages/portal/state-agencies";
import SettingsPage from "@/pages/portal/settings";
import { PortalLayout } from "@/components/portal-layout";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PortalRouter() {
  return (
    <PortalLayout>
      <Switch>
        <Route path="/portal/opportunities" component={OpportunitiesDashboard} />
        <Route path="/portal/clients" component={ClientsPage} />
        <Route path="/portal/competitors" component={CompetitorsPage} />
        <Route path="/portal/prospects" component={ProspectsPage} />
        <Route path="/portal/prospects/:id" component={ProspectDetailPage} />
        <Route path="/portal/federal-agencies" component={FederalAgenciesPage} />
        <Route path="/portal/state-agencies" component={StateAgenciesPage} />
        <Route path="/portal/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </PortalLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/portal/*" component={PortalRouter} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark"> {/* Force dark mode for this premium aesthetic */}
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
