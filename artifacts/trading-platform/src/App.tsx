import { Switch, Route, Router as WouterRouter } from "wouter";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/layout";
import { AuthProvider, isUnauthorizedError, notifyUnauthorized } from "@/lib/auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ThemeProvider } from "next-themes";

import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import Scanner from "@/pages/scanner";
import Gainers from "@/pages/gainers";
import Losers from "@/pages/losers";
import Signals from "@/pages/signals";
import OpenTrades from "@/pages/open-trades";
import TradeJournal from "@/pages/trade-journal";
import Analytics from "@/pages/analytics";
import LearningCenter from "@/pages/learning";
import Reports from "@/pages/reports";
import Watchlist from "@/pages/watchlist";
import Admin from "@/pages/admin";
import AIDashboard from "@/pages/ai-dashboard";
import AIMentorPage from "@/pages/ai-mentor";
import AITradeReviewPage from "@/pages/ai-trade-review";
import AIJournalPage from "@/pages/ai-journal";
import AIDailyReportPage from "@/pages/ai-daily-report";
import AIWeeklyReportPage from "@/pages/ai-weekly-report";
import AIMarketSummaryPage from "@/pages/ai-market-summary";
import AIStrategyReviewPage from "@/pages/ai-strategy-review";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error) {
      if (isUnauthorizedError(error)) notifyUnauthorized();
    },
  }),
  mutationCache: new MutationCache({
    onError(error) {
      if (isUnauthorizedError(error)) notifyUnauthorized();
    },
  }),
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <ProtectedRoute>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/scanner">
                <ProtectedRoute role="admin"><Scanner /></ProtectedRoute>
              </Route>
              <Route path="/gainers">
                <ProtectedRoute role="admin"><Gainers /></ProtectedRoute>
              </Route>
              <Route path="/losers">
                <ProtectedRoute role="admin"><Losers /></ProtectedRoute>
              </Route>
              <Route path="/signals">
                <ProtectedRoute role="admin"><Signals /></ProtectedRoute>
              </Route>
              <Route path="/trades/open">
                <ProtectedRoute role="admin"><OpenTrades /></ProtectedRoute>
              </Route>
              <Route path="/trades/journal">
                <ProtectedRoute role="admin"><TradeJournal /></ProtectedRoute>
              </Route>
              <Route path="/analytics" component={Analytics} />
              <Route path="/learning">
                <ProtectedRoute role="admin"><LearningCenter /></ProtectedRoute>
              </Route>
              <Route path="/reports" component={Reports} />
              <Route path="/watchlist" component={Watchlist} />
              <Route path="/ai/dashboard" component={AIDashboard} />
              <Route path="/ai/mentor" component={AIMentorPage} />
              <Route path="/ai/trade-review" component={AITradeReviewPage} />
              <Route path="/ai/journal" component={AIJournalPage} />
              <Route path="/ai/daily-report" component={AIDailyReportPage} />
              <Route path="/ai/weekly-report" component={AIWeeklyReportPage} />
              <Route path="/ai/market-summary" component={AIMarketSummaryPage} />
              <Route path="/ai/strategy-review" component={AIStrategyReviewPage} />
              <Route path="/admin">
                <ProtectedRoute role="admin"><Admin /></ProtectedRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="quantedge-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
