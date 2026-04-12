import { CodingPlanClient } from "../client/coding-plan-client.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { withRetry } from "../utils/retry.js";

export async function webSearch(
  client: CodingPlanClient,
  costTracker: CostTracker,
  input: { query: string },
): Promise<string> {
  const result = await withRetry(() => client.webSearch(input.query));
  await costTracker.recordUnmetered("web_search");
  return JSON.stringify(result);
}
