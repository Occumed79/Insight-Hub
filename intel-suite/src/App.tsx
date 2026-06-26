import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/home";
import OpportunitiesDashboard from "@/pages/portal/opportunities";
import EntitiesPage from "@/pages/portal/entities";
import CompetitorsPage from "@/pages/portal/competitors";
import ProspectDetailPage from "@/pages/portal/prospect-detail";
import FederalAgenciesPage from "@/pages/portal/federal-agencies";
import StateAgenciesPage from "@/pages/portal/state-agencies";
import SettingsPage from "@/pages/portal/settings";
import { PortalLayout } from "@/components/portal-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function EntityProspectsRoute() {
  return <EntitiesPage defaultTab="prospects" />;
}

function EntityClientsRoute() {
  return <EntitiesPage defaultTab="clients" />;
}

function PortalRouter() {
  return (
    <PortalLayout>
      <Switch>
        <Route path="/portal/opportunities" component={OpportunitiesDashboard} />
        <Route path="/portal/entities" component={EntityProspectsRoute} />
        <Route path="/portal/clients" component={EntityClientsRoute} />
        <Route path="/portal/competitors" component={CompetitorsPage} />
        <Route path="/portal/prospects/:id" component={ProspectDetailPage} />
        <Route path="/portal/prospects" component={EntityProspectsRoute} />
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
        <ErrorBoundary>
          <div className="dark">
            <WouterRouter>
              <Router />
            </WouterRouter>
            <Toaster />
          </div>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
