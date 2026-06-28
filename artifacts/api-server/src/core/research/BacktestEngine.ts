import { executionService } from "../execution";
import { portfolioService } from "../portfolio";
import { tradeService, type PaperTradeRecord } from "../trading";
import { DatasetManager } from "./DatasetManager";
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import { ResearchRepository } from "./ResearchRepository";
import type { BacktestOrderIntent, BacktestRequest, BacktestResult, ResearchTrade, StrategyRuntimeContext, TickData } from "./types";

export class BacktestEngine {
  constructor(
    private readonly datasetManager = new DatasetManager(),
    private readonly analyzer = new PerformanceAnalyzer(),
    private readonly repository = new ResearchRepository(),
  ) {}

  async run(request: BacktestRequest): Promise<BacktestResult> {
    const startedAt = new Date();
    const runId = this.generateRunId(request.strategy.id);
    const frames = this.datasetManager.replay(request.dataset);
    const firstBar = request.dataset.bars[0];
    const lastBar = request.dataset.bars.at(-1);
    let backtestId: number | null = null;

    if (!firstBar || !lastBar) {
      throw new Error("Backtest requires at least one OHLCV bar");
    }

    if (request.persistResults !== false) {
      backtestId = await this.repository.createBacktest({
        runId,
        strategyVersionId: request.strategyVersionId,
        parameterSetId: request.parameterSetId,
        symbol: request.dataset.symbol,
        exchange: request.dataset.exchange,
        timeframe: request.dataset.timeframe,
        startAt: firstBar.timestamp,
        endAt: lastBar.timestamp,
        initialEquity: request.initialEquity,
        marketRegime: request.marketRegime,
        notes: request.notes,
        config: request.parameters,
      });
    }

    const trades: ResearchTrade[] = [];
    let openTrade: PaperTradeRecord | null = null;
    const context: StrategyRuntimeContext = {
      parameters: request.parameters ?? {},
      openTrade,
      equity: request.initialEquity,
      services: { tradeService, executionService, portfolioService },
    };

    try {
      await request.strategy.onStart?.(context);

      let tickCursor = 0;
      const ticks = request.dataset.ticks ? [...request.dataset.ticks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) : [];

      for (const frame of frames) {
        context.openTrade = openTrade;
        const autoClosed = openTrade ? await tradeService.processPriceTick(openTrade, frame.primary.close) : null;
        if (autoClosed) {
          trades.push(this.toResearchTrade(autoClosed));
          context.equity += Number(autoClosed.pnl ?? 0);
          openTrade = null;
          context.openTrade = null;
        }

        while (request.strategy.onTick && tickCursor < ticks.length && ticks[tickCursor]!.timestamp <= frame.timestamp) {
          const tick = ticks[tickCursor]!;
          const tickClosed = await this.processTick(openTrade, tick, trades, context);
          openTrade = tickClosed.openTrade;
          const tickIntent = await request.strategy.onTick(tick, context);
          openTrade = await this.applyIntent(tickIntent, openTrade, trades, context);
          tickCursor += 1;
        }

        const intent = await request.strategy.onBar(frame, context);
        openTrade = await this.applyIntent(intent, openTrade, trades, context);
      }

      await request.strategy.onComplete?.(context);
      const completedAt = new Date();
      const metrics = this.analyzer.analyze(trades, request.initialEquity);
      const result: BacktestResult = { runId, status: "COMPLETED", trades, metrics, startedAt, completedAt };
      if (backtestId != null) {
        await this.repository.completeBacktest(backtestId, result);
      }
      return result;
    } catch (error) {
      if (backtestId != null) {
        await this.repository.failBacktest(backtestId);
      }
      return {
        runId,
        status: "FAILED",
        trades,
        metrics: this.analyzer.analyze(trades, request.initialEquity),
        startedAt,
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown backtest error",
      };
    }
  }

  private async processTick(
    openTrade: PaperTradeRecord | null,
    tick: TickData,
    trades: ResearchTrade[],
    context: StrategyRuntimeContext,
  ): Promise<{ openTrade: PaperTradeRecord | null }> {
    context.openTrade = openTrade;
    if (!openTrade) return { openTrade };
    const closed = await tradeService.processPriceTick(openTrade, tick.price);
    if (!closed) return { openTrade };
    trades.push(this.toResearchTrade(closed));
    context.equity += Number(closed.pnl ?? 0);
    context.openTrade = null;
    return { openTrade: null };
  }

  private async applyIntent(
    intent: BacktestOrderIntent,
    openTrade: PaperTradeRecord | null,
    trades: ResearchTrade[],
    context: StrategyRuntimeContext,
  ): Promise<PaperTradeRecord | null> {
    context.openTrade = openTrade;
    if (intent.type === "ENTER" && !openTrade) {
      const approval = await portfolioService.validateTrade(intent.signal, intent.analysis);
      if (approval.approved) {
        return await tradeService.openPaperTrade(intent.signal, intent.analysis);
      }
    }

    if (intent.type === "EXIT" && openTrade) {
      const closed = await tradeService.closeTrade(openTrade, {
        exitPrice: intent.exitPrice,
        exitReason: intent.exitReason,
        trigger: "MANUAL",
      });
      trades.push(this.toResearchTrade(closed));
      context.equity += Number(closed.pnl ?? 0);
      context.openTrade = null;
      return null;
    }

    return openTrade;
  }

  private toResearchTrade(trade: PaperTradeRecord): ResearchTrade {
    const entryPrice = Number(trade.entryPrice);
    const exitPrice = trade.exitPrice == null ? entryPrice : Number(trade.exitPrice);
    const quantity = Number(trade.quantity);
    const stopLoss = Number(trade.stopLoss);
    const riskAmount = Math.abs(entryPrice - stopLoss) * quantity;
    const pnl = Number(trade.pnl ?? 0);
    return {
      symbol: trade.symbol,
      direction: trade.direction,
      entryAt: trade.openedAt,
      exitAt: trade.closedAt,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPercent: Number(trade.pnlPercent ?? 0),
      rMultiple: riskAmount > 0 ? pnl / riskAmount : 0,
      riskAmount,
      holdMinutes: trade.holdingDurationMinutes ?? 0,
      fees: 0,
      sourceTradeId: trade.id,
    };
  }

  private generateRunId(strategyId: string): string {
    return `BT-${strategyId}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
}
