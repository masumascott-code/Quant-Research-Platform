import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export interface AIInsight {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskFactors: string[];
  suggestedImprovements: string[];
  alternativeScenarios: string[];
  confidenceExplanation: string;
  rawText: string;
}

export interface AIEnvelope {
  advisoryOnly: true;
  generatedAt: string;
}

export interface AITrade {
  id?: number;
  tradeId?: string;
  symbol: string;
  direction: string;
  setupType?: string | null;
  status: string;
  result?: string | null;
  entryPrice: number;
  stopLoss: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  quantity?: number;
  signalScore?: number;
  signalGrade?: string | null;
  exitPrice?: number | null;
  exitReason?: string | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  openedAt?: string;
  closedAt?: string | null;
}

export interface AIDashboardResponse extends AIEnvelope {
  widgets: {
    todayPerformance: {
      date: string;
      trades: number;
      winRate: number;
      pnl: number;
    };
    winRate: number;
    pnl: number;
    risk: {
      grade: string;
      usagePercent: number;
      marketRisk: string;
    };
    bestTrade: AITrade | null;
    worstTrade: AITrade | null;
    currentMarketRegime: string;
    topOpportunities: Array<{
      symbol: string;
      direction: string;
      decision: string;
      strategy: string;
      score: number;
      confidence: number;
      riskGrade: string;
      createdAt: string;
    }>;
    journalSummary: {
      notes: string[];
      lessons: string[];
      recurringProblems: string[];
    };
  };
  recommendations: string[];
  insight: AIInsight;
}

export interface AIMentorResponse extends AIEnvelope {
  question: string;
  symbol?: string;
  insight: AIInsight;
}

export interface AITradeReviewResponse extends AIEnvelope {
  trade: AITrade;
  explain: {
    entry: number;
    exit: string;
    risk: number;
    strengths: string[];
    weaknesses: string[];
    mistakes: string[];
    alternativeScenario: string;
  };
  insight: AIInsight;
}

export interface AIReportResponse extends AIEnvelope {
  reportType: "daily" | "weekly";
  insight: AIInsight;
}

export interface AIJournalResponse extends AIEnvelope {
  journal: {
    timeline: Array<{
      id: number;
      tradeId: string;
      symbol: string;
      direction: string;
      result: string;
      setupQuality: string | null;
      createdAt: string;
    }>;
    mistakes: string[];
    lessons: string[];
    recurringProblems: string[];
    dailySummary: string;
    weeklySummary: string;
  };
  insight: AIInsight;
}

export interface AIMarketSummaryResponse extends AIEnvelope {
  market: {
    currentRegime: string;
    session: string;
    trend: number;
    liquidity: number;
    topMovers: Array<{
      symbol: string;
      regime: string;
      trendScore: number;
      liquidityScore: number;
      riskGrade: string;
    }>;
    marketRisk: string;
  };
  insight: AIInsight;
}

export interface AIStrategyReviewResponse extends AIEnvelope {
  comparison: {
    strategies: Array<{
      setupType: string;
      direction: string;
      totalTrades: number;
      wins: number;
      losses: number;
      winRate: number;
      avgPnl: number;
      avgScore: number;
      ranking: number | null;
    }>;
    bestStrategy: string | null;
    weakestStrategy: string | null;
  };
  insight: AIInsight;
}

export function useAIDashboard() {
  return useQuery({
    queryKey: ["ai", "dashboard"],
    queryFn: () => apiFetch<AIDashboardResponse>("/api/ai/dashboard"),
  });
}

export function useAIMentor(question: string, symbol?: string, enabled = false) {
  return useQuery({
    queryKey: ["ai", "mentor", question, symbol],
    queryFn: () => apiFetch<AIMentorResponse>(`/api/ai/mentor?${query({ question, symbol })}`),
    enabled,
  });
}

export function useAITradeReview(tradeId?: string) {
  return useQuery({
    queryKey: ["ai", "trade-review", tradeId],
    queryFn: () => apiFetch<AITradeReviewResponse>(`/api/ai/trade-review?${query({ tradeId })}`),
  });
}

export function useAIDailyReport() {
  return useQuery({
    queryKey: ["ai", "daily-report"],
    queryFn: () => apiFetch<AIReportResponse>("/api/ai/daily-report"),
  });
}

export function useAIWeeklyReport() {
  return useQuery({
    queryKey: ["ai", "weekly-report"],
    queryFn: () => apiFetch<AIReportResponse>("/api/ai/weekly-report"),
  });
}

export function useAIJournal() {
  return useQuery({
    queryKey: ["ai", "journal"],
    queryFn: () => apiFetch<AIJournalResponse>("/api/ai/journal"),
  });
}

export function useAIMarketSummary(symbol?: string) {
  return useQuery({
    queryKey: ["ai", "market-summary", symbol],
    queryFn: () => apiFetch<AIMarketSummaryResponse>(`/api/ai/market-summary?${query({ symbol })}`),
  });
}

export function useAIStrategyReview() {
  return useQuery({
    queryKey: ["ai", "strategy-review"],
    queryFn: () => apiFetch<AIStrategyReviewResponse>("/api/ai/strategy-review"),
  });
}

function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}
