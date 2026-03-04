import { Axis } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calculateScores } from "@/lib/scoring";

/**
 * Builds sample response payload for scoring tests.
 */
function buildResponses(axis: Axis, values: number[]) {
  return values.map((value) => ({
    question: { axis },
    choice: { value },
  }));
}

/**
 * Validates score engine output consistency.
 */
describe("calculateScores", () => {
  /**
   * Ensures strongest axis has highest normalized score.
   */
  it("ranks axes by score descending", () => {
    const responses = [
      ...buildResponses(Axis.ACTION, [5, 5, 5]),
      ...buildResponses(Axis.RISK, [1, 1, 1]),
      ...buildResponses(Axis.LEARNING, [3, 3, 3]),
      ...buildResponses(Axis.COLLABORATION, [2, 2, 2]),
      ...buildResponses(Axis.MARKET, [4, 4, 4]),
    ];

    const result = calculateScores(responses);

    expect(result.axisScores[0]?.axis).toBe(Axis.ACTION);
    expect(result.axisScores[result.axisScores.length - 1]?.axis).toBe(Axis.RISK);
    expect(result.recommendedNext.length).toBeGreaterThan(0);
  });

  /**
   * Ensures empty response set still returns deterministic shape.
   */
  it("handles empty response set", () => {
    const result = calculateScores([]);

    expect(result.axisScores.length).toBe(5);
    expect(result.axisScores.every((item) => item.score === 0)).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
