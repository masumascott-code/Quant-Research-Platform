import { configService } from "../config";
import { FeeEngine } from "./FeeEngine";
import { FundingEngine } from "./FundingEngine";
import { OrderBookSimulator } from "./OrderBookSimulator";
import { SlippageEngine } from "./SlippageEngine";
import type { ExecutionOrderRequest, ExecutionResult, FillResult } from "./types";
import type { ManagedOrder } from "./types";

export class ExecutionEngine {
  constructor(
    private readonly orderBook = new OrderBookSimulator(),
    private readonly slippageEngine = new SlippageEngine(),
    private readonly feeEngine = new FeeEngine(),
    private readonly fundingEngine = new FundingEngine()
  ) {}

  async execute(order: ManagedOrder, portfolioApproval: ExecutionResult["portfolioApproval"]): Promise<ExecutionResult> {
    const config = await configService.get();
    const request = order.request;
    const referencePrice = this.referencePrice(request);
    const slippage = this.slippageEngine.estimate({
      market: request.market,
      orderSize: request.requestedQuantity,
      referencePrice,
    });
    const adjustedPrice = this.adjustedPrice(request, referencePrice, slippage.entrySlippage);
    const simulated = this.orderBook.simulate({ order: request, referencePrice, adjustedPrice });

    const fills: FillResult[] = simulated.fills.map((fill) => {
      const notional = fill.price * fill.quantity;
      const fee = this.feeEngine.calculate({
        notional,
        liquidityRole: fill.liquidityRole,
        makerFeeRate: config.paperTrading.makerFeeRate || config.paperTrading.tradingFeeRate,
        takerFeeRate: config.paperTrading.takerFeeRate || config.paperTrading.tradingFeeRate,
        commissionRate: config.paperTrading.commissionRate,
      }).totalFee;
      return { ...fill, fee };
    });

    const filledQuantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
    const averageFillPrice = filledQuantity > 0
      ? fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0) / filledQuantity
      : referencePrice;
    const notional = fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0);
    const liquidityRole = fills[0]?.liquidityRole ?? "TAKER";
    const funding = this.fundingEngine.calculate({
      notional,
      fundingRate: config.paperTrading.fundingRate,
      intervalHours: config.paperTrading.fundingIntervalHours,
    });
    const fees = this.feeEngine.calculate({
      notional,
      liquidityRole,
      makerFeeRate: config.paperTrading.makerFeeRate || config.paperTrading.tradingFeeRate,
      takerFeeRate: config.paperTrading.takerFeeRate || config.paperTrading.tradingFeeRate,
      commissionRate: config.paperTrading.commissionRate,
      fundingFee: funding.fundingFee,
    });

    return {
      order: {
        ...order,
        state: filledQuantity >= request.requestedQuantity ? "FILLED" : "PARTIALLY_FILLED",
        filledQuantity,
        remainingQuantity: Math.max(request.requestedQuantity - filledQuantity, 0),
        averageFillPrice,
        executionDelayMs: simulated.executionDelayMs,
      },
      fills,
      fees,
      funding,
      entryPrice: averageFillPrice,
      averageFillPrice,
      executionDelayMs: simulated.executionDelayMs,
      fillRatio: request.requestedQuantity > 0 ? filledQuantity / request.requestedQuantity : 0,
      entrySlippage: slippage.entrySlippage,
      exitSlippage: slippage.exitSlippage,
      portfolioApproval,
    };
  }

  private referencePrice(request: ExecutionOrderRequest): number {
    return request.limitPrice ?? request.analysis.entryPrice;
  }

  private adjustedPrice(request: ExecutionOrderRequest, referencePrice: number, slippage: number): number {
    if (request.side === "BUY") return referencePrice + slippage;
    return referencePrice - slippage;
  }
}
