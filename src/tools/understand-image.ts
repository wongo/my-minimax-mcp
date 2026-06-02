import { CodingPlanClient } from "../client/coding-plan-client.js";
import type { ModelId } from "../client/types.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { Telemetry } from "../utils/telemetry.js";
import { classifyError } from "../utils/error-classifier.js";
import { toBase64DataUrl } from "../utils/image.js";
import { withRetry } from "../utils/retry.js";

export async function understandImage(
  client: CodingPlanClient,
  costTracker: CostTracker,
  input: { prompt: string; imageSource: string; model?: ModelId },
  telemetry?: Telemetry,
): Promise<string> {
  const model = input.model ?? client.getDefaultModel();
  const dataUrl = await toBase64DataUrl(input.imageSource);
  const result = await withRetry(() => client.understandImage(input.prompt, dataUrl, model), {
    onAttempt: telemetry
      ? async ({ attempt, succeeded, error }) => {
          if (!succeeded) {
            await telemetry.recordRetry({
              tool: "minimax_understand_image",
              attempt,
              succeeded,
              errorCategory: error !== undefined ? classifyError(error) : undefined,
              errorMessage: error instanceof Error ? error.message.slice(0, 200) : undefined,
            });
          }
        }
      : undefined,
  });
  await costTracker.recordUnmetered("understand_image");
  return JSON.stringify({ content: result.content, imageSource: input.imageSource });
}
