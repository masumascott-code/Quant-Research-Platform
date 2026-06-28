import { configService } from "../config";
import type { ScannerSignalGrade } from "./types";

export class SignalQualityEngine {
  classify(finalScore: number, rejected: boolean): ScannerSignalGrade {
    if (rejected) return "Rejected";
    const config = configService.getSync().scannerDecision;
    if (finalScore >= config.gradeAPlusThreshold) return "A+";
    if (finalScore >= config.gradeAThreshold) return "A";
    if (finalScore >= config.gradeBThreshold) return "B";
    return "C";
  }
}
