import { configService } from "../config";
import type { ScannerSignalGrade, ScannerTradeGrade } from "./types";

export class SignalQualityEngine {
  classify(finalScore: number, rejected: boolean): ScannerSignalGrade {
    if (rejected) return "Rejected";
    return this.tradeGrade(finalScore);
  }

  tradeGrade(finalScore: number): ScannerTradeGrade {
    const config = configService.getSync().scannerDecision;
    if (configService.getSync().scanner.mode === "conservative_v2") {
      if (finalScore >= 90) return "A+";
      if (finalScore >= 85) return "A";
      if (finalScore >= 80) return "B";
      return "C";
    }

    if (finalScore >= config.gradeAPlusThreshold) return "A+";
    if (finalScore >= config.gradeAThreshold) return "A";
    if (finalScore >= config.gradeBThreshold) return "B";
    return "C";
  }
}
