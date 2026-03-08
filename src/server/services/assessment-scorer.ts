import { calculateScores, type ScoringInput, type ScoringOutput } from "@/lib/scoring";
import type { AssessmentScorer } from "@/server/types/contracts";

/**
 * Default scoring engine that delegates to the shared scoring module.
 */
export class DefaultAssessmentScorer implements AssessmentScorer {
  /**
   * Converts persisted assessment responses into ranked scoring output.
   */
  calculate(responses: ScoringInput[]): ScoringOutput {
    return calculateScores(responses);
  }
}
