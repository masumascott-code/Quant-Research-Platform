import { portfolioService } from "../portfolio";
import type { ExecutionOrderRequest } from "./types";

export class ExecutionValidator {
  async validateEntryOrder(request: ExecutionOrderRequest) {
    if (request.requestedQuantity <= 0) {
      return {
        approved: false as const,
        reason: "Order quantity must be greater than zero",
        portfolioApproval: null,
      };
    }

    const portfolioApproval = await portfolioService.validateTrade(request.signal, request.analysis);
    if (!portfolioApproval.approved || !portfolioApproval.sizing) {
      return {
        approved: false as const,
        reason: portfolioApproval.reason ?? "Portfolio validation rejected order",
        portfolioApproval,
      };
    }

    return {
      approved: true as const,
      reason: null,
      portfolioApproval,
    };
  }
}
