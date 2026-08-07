import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { installStableFetch } from "@/lib/stable-fetch";
import "@/ui-hardening.css";

import Home from "@/pages/home";
import { PortalLayout } from "@/components/portal-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";

const OpportunitiesDashboard = lazy(() => import("@/pages/portal/opportunities"));
const ForecastsPage = lazy(() => import("@/pages/portal/forecasts"));
const RecompeteWatchPage = lazy(() => import("@/pages/portal/recompete-watch"));
const RelevantNewsPage = lazy(() => import("@/pages/portal/relevant-news"));
const SettingsPage = lazy(() => import("@/pages/portal/settings"));

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

function WorkspaceFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading workspace"
      className="space-y-5 py-2"
    >
      <span className="sr-only">Loading workspace…</span>
      <div aria-hidden="true" className="ui-skeleton h-4 w-40 rounded-full" />
      <div aria-hidden="true" className="ui-skeleton h-12 w-72 max-w-full rounded-xl" />
      <div aria-hidden="true" className="ui-skeleton h-28 w-full rounded-2xl" />
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
        <div className="ui-skeleton h-48 rounded-2xl" />
        <div className="ui-skeleton h-48 rounded-2xl" />
      </div>
    </div>
  );
}

function PortalRouter() {
  return (
    <PortalLayout>
      <Suspense fallback={<WorkspaceFallback />}>
        <Switch>
          <Route path="/portal/opportunities" component={OpportunitiesDashboard} />
          <Route path="/portal/forecasts" component={ForecastsPage} />
          <Route path="/portal/recompete-watch" component={RecompeteWatchPage} />
          <Route path="/portal/relevant-news" component={RelevantNewsPage} />
          <Route path="/portal/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <ErrorBoundary>
            <div className="dark min-h-dvh">
              <WouterRouter>
                <Router />
              </WouterRouter>
              <Toaster />
            </div>
          </ErrorBoundary>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

export default App;
