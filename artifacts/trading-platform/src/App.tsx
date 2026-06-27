import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/layout";
import { useEffect } from "react";

import Dashboard from "@/pages/dashboard";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ForceDark() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);
  return null;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/scanner" component={Scanner} />
        <Route path="/gainers" component={Gainers} />
        <Route path="/losers" component={Losers} />
        <Route path="/signals" component={Signals} />
        <Route path="/trades/open" component={OpenTrades} />
        <Route path="/trades/journal" component={TradeJournal} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/learning" component={LearningCenter} />
        <Route path="/reports" component={Reports} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ForceDark />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
