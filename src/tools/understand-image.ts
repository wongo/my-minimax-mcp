import { CodingPlanClient } from "../client/coding-plan-client.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { toBase64DataUrl } from "../utils/image.js";
import { withRetry } from "../utils/retry.js";

export async function understandImage(
  client: CodingPlanClient,
  costTracker: CostTracker,
  input: { prompt: string; imageSource: string },
): Promise<string> {
  const dataUrl = await toBase64DataUrl(input.imageSource);
  const result = await withRetry(() => client.understandImage(input.prompt, dataUrl));
  await costTracker.recordUnmetered("understand_image");
  return JSON.stringify({ content: result.content, imageSource: input.imageSource });
}
