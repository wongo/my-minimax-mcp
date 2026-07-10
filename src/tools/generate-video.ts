import { z } from "zod";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { Telemetry } from "../utils/telemetry.js";
import { MEDIA_BASE_URL, MEDIA_TIMEOUT_MS, sleep, downloadToFile, assertBaseResp, fetchWithTimeout } from "./media-shared.js";

export const generateVideoSchema = z.object({
  prompt: z.string().describe("Text description of the video to generate"),
  duration: z.union([z.literal(6), z.literal(10)]).optional().describe("Video duration in seconds: 6 or 10 (default: 6)"),
  resolution: z.enum(["768P", "1080P"]).optional().describe("Resolution: '768P' or '1080P' (default: '1080P')"),
  model: z.enum(["MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast"]).optional().describe("Video generation model (default: 'MiniMax-Hailuo-2.3')"),
  outputFile: z.string().optional().describe("Absolute file path to save the video (mp4)"),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;

interface VideoSubmitResponse {
  task_id?: string;
  base_resp?: { status_code: number; status_msg?: string };
}

interface VideoQueryResponse {
  task_id: string;
  status: string;
  file_id?: string;
  video_width?: number;
  video_height?: number;
  video_duration?: number;
  base_resp?: { status_code: number; status_msg?: string };
}

interface FileRetrieveResponse {
  file?: { file_id: string; bytes?: number; download_url?: string; created_at?: string };
  base_resp?: { status_code: number; status_msg?: string };
}

export async function generateVideo(
  apiKey: string,
  costTracker: CostTracker,
  input: GenerateVideoInput,
  _telemetry?: Telemetry,
): Promise<string> {
  input = generateVideoSchema.parse(input);
  const model = input.model ?? "MiniMax-Hailuo-2.3";
  const duration = input.duration ?? 6;
  const resolution = input.resolution ?? "1080P";
  const pollIntervalMs = Number(process.env.MINIMAX_MEDIA_POLL_MS ?? 10_000); // overridable for tests
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(`MINIMAX_MEDIA_POLL_MS must be a positive integer; received ${JSON.stringify(process.env.MINIMAX_MEDIA_POLL_MS)}`);
  }

  // ── Step 1: Submit ──────────────────────────────────────────────────────────
  const submitResponse = await fetchWithTimeout(`${MEDIA_BASE_URL}/video_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      duration,
      resolution,
      prompt_optimizer: true,
    }),
  }, MEDIA_TIMEOUT_MS.control, "Video submission");

  if (!submitResponse.ok) {
    const errorBody = await submitResponse.text().catch(() => "");
    throw new Error(`Video API HTTP ${submitResponse.status}: ${errorBody}`);
  }

  const submitJson = (await submitResponse.json()) as unknown;
  assertBaseResp(submitJson, "Video submission");

  const submitData = submitJson as VideoSubmitResponse;
  const taskId = submitData.task_id;
  if (!taskId) {
    throw new Error("Video submission returned no task_id");
  }

  // ── Step 2: Poll for completion ─────────────────────────────────────────────
  const maxPolls = 30; // 30 × 10 s = 5 min at the default interval
  let fileId: string | undefined;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollIntervalMs);

    const pollResponse = await fetchWithTimeout(
      `${MEDIA_BASE_URL}/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      MEDIA_TIMEOUT_MS.control,
      "Video status poll",
    );

    if (!pollResponse.ok) {
      throw new Error(`Video poll HTTP ${pollResponse.status}`);
    }

    const pollJson = (await pollResponse.json()) as unknown;
    assertBaseResp(pollJson, "Video poll");

    const pollData = pollJson as VideoQueryResponse;

    if (pollData.status === "Success") {
      fileId = pollData.file_id;
      if (!fileId) {
        // Distinguish this from a genuine timeout — the task finished, the response was malformed.
        throw new Error("Video poll reported Success but returned no file_id");
      }
      break;
    }

    if (pollData.status === "Fail") {
      const br = pollData.base_resp;
      throw new Error(`Video generation failed: ${br?.status_msg ?? "unknown"}`);
    }

    // "Preparing" | "Queueing" | "Processing" — keep polling
  }

  if (!fileId) {
    throw new Error(`Video generation timed out after ${Math.round((maxPolls * pollIntervalMs) / 1000)} seconds`);
  }

  // ── Step 3: Retrieve download URL ───────────────────────────────────────────
  const retrieveResponse = await fetchWithTimeout(
    `${MEDIA_BASE_URL}/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    MEDIA_TIMEOUT_MS.control,
    "Video file retrieve",
  );

  if (!retrieveResponse.ok) {
    throw new Error(`Video retrieve HTTP ${retrieveResponse.status}`);
  }

  const retrieveJson = (await retrieveResponse.json()) as unknown;
  assertBaseResp(retrieveJson, "Video retrieve");

  const retrieveData = retrieveJson as FileRetrieveResponse;
  const downloadUrl = retrieveData.file?.download_url;
  if (!downloadUrl) {
    throw new Error("Video retrieve returned no download_url");
  }

  // ── Step 4: Optional file download ───────────────────────────────────────────
  let outputFile: string | undefined;
  let videoSizeBytes: number | undefined;

  if (input.outputFile) {
    videoSizeBytes = await downloadToFile(downloadUrl, input.outputFile);
    outputFile = input.outputFile;
  }

  await costTracker.recordUnmetered("generate_video");

  return JSON.stringify({
    success: true,
    taskId,
    fileId,
    videoUrl: downloadUrl,
    outputFile,
    videoSizeBytes,
    message: outputFile
      ? `Video saved to ${outputFile} (${videoSizeBytes} bytes)`
      : `Video generated: ${downloadUrl}`,
  });
}
