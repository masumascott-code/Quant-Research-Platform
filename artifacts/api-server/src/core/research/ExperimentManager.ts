import { ResearchRepository } from "./ResearchRepository";
import type { ParameterCandidate, WalkForwardSummary } from "./types";

export class ExperimentManager {
  constructor(private readonly repository = new ResearchRepository()) {}

  async registerStrategyVersion(params: {
    strategyId: string;
    version: string;
    name: string;
    description?: string;
    sourceHash?: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    return await this.repository.createStrategyVersion(params);
  }

  async registerParameterSet(params: ParameterCandidate & { strategyVersionId?: number; optimizer?: string; notes?: string }): Promise<number> {
    return await this.repository.createParameterSet(params);
  }

  async startExperiment(params: {
    experimentId: string;
    strategyVersionId?: number;
    name: string;
    marketRegime?: string;
    exchange?: string;
    periodStart?: Date;
    periodEnd?: Date;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    return await this.repository.createExperiment(params);
  }

  async completeWalkForwardExperiment(experimentId: number, summary: WalkForwardSummary): Promise<void> {
    await this.repository.completeExperiment(experimentId, summary);
  }
}
