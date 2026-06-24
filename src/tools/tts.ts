import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { Telemetry } from "../utils/telemetry.js";
import { MEDIA_BASE_URL } from "./media-shared.js";

export const ttsSchema = z.object({
  text: z.string().describe("Text to convert to speech"),
  voiceId: z.string().optional().describe("Voice ID (default: male-qn-qingse)"),
  speed: z.number().min(0.5).max(2.0).optional().describe("Speech speed 0.5-2.0 (default: 1.0)"),
  outputFile: z.string().optional().describe("Absolute file path to save the audio (mp3)"),
});

export type TtsInput = z.infer<typeof ttsSchema>;

interface TtsJsonResponse {
  data?: { audio?: string; status?: number };
  base_resp?: { status_code: number; status_msg?: string };
}

export async function tts(
  apiKey: string,
  costTracker: CostTracker,
  input: TtsInput,
  _telemetry?: Telemetry,
): Promise<string> {
  const voiceId = input.voiceId ?? "male-qn-qingse";
  const speed = input.speed ?? 1.0;

  const response = await fetch(`${MEDIA_BASE_URL}/t2a_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "speech-02-hd",
      text: input.text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`TTS API error ${response.status}: ${errorBody}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  let audioBuffer: Buffer;
  let outputFile: string | undefined;
  let audioSizeBytes: number;

  if (contentType.includes("application/json")) {
    const json = (await response.json()) as unknown;
    if (
      json !== null &&
      typeof json === "object" &&
      "base_resp" in json &&
      (json as { base_resp?: { status_code: number; status_msg?: string } }).base_resp
    ) {
      const br = (json as { base_resp: { status_code: number; status_msg?: string } }).base_resp;
      if (br.status_code !== 0) {
        throw new Error(`TTS API error: ${br.status_msg ?? "unknown"}`);
      }
    }
    const data = (json as TtsJsonResponse).data;
    const hexAudio = data?.audio ?? "";
    audioBuffer = Buffer.from(hexAudio, "hex");
  } else {
    // Direct binary audio response
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  }

  // Zero-byte guard
  if (audioBuffer.length === 0) {
    throw new Error("TTS returned empty audio");
  }

  audioSizeBytes = audioBuffer.length;

  if (input.outputFile) {
    await writeFile(input.outputFile, audioBuffer);
    outputFile = input.outputFile;
  }

  await costTracker.recordUnmetered("tts");

  return JSON.stringify({
    success: true,
    outputFile,
    audioSizeBytes,
    message: outputFile
      ? `Audio saved to ${outputFile} (${audioSizeBytes} bytes)`
      : `Audio generated (${audioSizeBytes} bytes)`,
  });
}
