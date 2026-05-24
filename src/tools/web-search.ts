import { CodingPlanClient } from "../client/coding-plan-client.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { Telemetry } from "../utils/telemetry.js";
import { classifyError } from "../utils/error-classifier.js";
import { withRetry } from "../utils/retry.js";

export async function webSearch(
  client: CodingPlanClient,
  costTracker: CostTracker,
  input: { query: string },
  telemetry?: Telemetry,
): Promise<string> {
  const result = await withRetry(() => client.webSearch(input.query), {
    onAttempt: telemetry
      ? async ({ attempt, succeeded, error }) => {
          if (!succeeded) {
            await telemetry.recordRetry({
              tool: "minimax_web_search",
              attempt,
              succeeded,
              errorCategory: error !== undefined ? classifyError(error) : undefined,
              errorMessage: error instanceof Error ? error.message.slice(0, 200) : undefined,
            });
          }
        }
      : undefined,
  });
  await costTracker.recordUnmetered("web_search");
  return JSON.stringify(result);
}
