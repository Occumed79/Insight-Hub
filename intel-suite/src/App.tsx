import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { installStableFetch } from "@/lib/stable-fetch";

import Home from "@/pages/home";
import OpportunitiesDashboard from "@/pages/portal/opportunities";
import ForecastsPage from "@/pages/portal/forecasts";
import RecompeteWatchPage from "@/pages/portal/recompete-watch";
import RelevantNewsPage from "@/pages/portal/relevant-news";
import SettingsPage from "@/pages/portal/settings";
import { PortalLayout } from "@/components/portal-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";

installStableFetch();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
      staleTime: 30_000,
      gcTime: 30 * 60 * 1000,
      placeholderData: (previousData: unknown) => previousData,
      refetchOnWindowFocus: false,
    },
  },
});

function PortalRouter() {
  return (
    <PortalLayout>
      <Switch>
        <Route path="/portal/opportunities" component={OpportunitiesDashboard} />
        <Route path="/portal/forecasts" component={ForecastsPage} />
        <Route path="/portal/recompete-watch" component={RecompeteWatchPage} />
        <Route path="/portal/relevant-news" component={RelevantNewsPage} />
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
