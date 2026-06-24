import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { Telemetry } from "../utils/telemetry.js";
import { MEDIA_BASE_URL, assertBaseResp } from "./media-shared.js";

export const generateMusicSchema = z
  .object({
    prompt: z
      .string()
      .optional()
      .describe("Music style/mood/scene description. Required for instrumental mode."),
    lyrics: z
      .string()
      .optional()
      .describe(
        "Song lyrics (lines separated by \\n, supports [Verse] [Chorus] tags). Required for vocal songs.",
      ),
    instrumental: z
      .boolean()
      .optional()
      .describe("If true, generate instrumental music (prompt required, lyrics ignored)"),
    outputFile: z
      .string()
      .optional()
      .describe("Absolute file path to save the music (mp3)"),
  })
  .refine(
    (data) => {
      // Vocal mode: lyrics must be present
      if (data.lyrics && data.lyrics.trim().length > 0) return true;
      // Instrumental mode: prompt is required
      if (data.instrumental || (!data.lyrics || data.lyrics.trim().length === 0)) {
        return !!(data.prompt && data.prompt.trim().length > 0);
      }
      return true;
    },
    {
      message:
        "Either `lyrics` (for vocal) or `prompt` (for instrumental) is required. If no lyrics are provided, `prompt` becomes mandatory for instrumental mode.",
    },
  );

export type GenerateMusicInput = z.infer<typeof generateMusicSchema>;

interface MusicResponse {
  data?: {
    status?: number;
    audio?: string;
  };
  extra_info?: unknown;
  base_resp?: { status_code: number; status_msg?: string };
}

export async function generateMusic(
  apiKey: string,
  costTracker: CostTracker,
  input: GenerateMusicInput,
  _telemetry?: Telemetry,
): Promise<string> {
  const isInstrumental =
    Boolean(input.instrumental) || !input.lyrics || input.lyrics.trim().length === 0;

  if (isInstrumental && (!input.prompt || input.prompt.trim().length === 0)) {
    throw new Error(
      "Instrumental mode requires `prompt` (style/mood description). Provide lyrics for vocal mode.",
    );
  }

  // ── Build request body ───────────────────────────────────────────────────────
  const requestBody: Record<string, unknown> = {
    model: "music-2.6",
    output_format: "hex",
  };

  if (isInstrumental) {
    requestBody.is_instrumental = true;
    requestBody.prompt = input.prompt;
  } else {
    requestBody.lyrics = input.lyrics;
  }

  // ── Submit (synchronous — no polling) ──────────────────────────────────────
  const response = await fetch(`${MEDIA_BASE_URL}/music_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Music API HTTP ${response.status}: ${errorBody}`);
  }

  const json = (await response.json()) as unknown;
  assertBaseResp(json, "Music generation");
  const data = (json as MusicResponse).data;

  // Guard: empty audio
  const hexAudio = data?.audio ?? "";
  if (!hexAudio || hexAudio.length === 0) {
    throw new Error("Music generation returned empty audio buffer");
  }

  // ── Decode hex → Buffer ─────────────────────────────────────────────────────
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(hexAudio, "hex");
  } catch {
    throw new Error("Music generation returned malformed hex audio");
  }

  if (audioBuffer.length === 0) {
    throw new Error("Music generation returned empty audio");
  }

  // ── Optional file write ──────────────────────────────────────────────────────
  let outputFile: string | undefined;
  const audioSizeBytes = audioBuffer.length;

  if (input.outputFile) {
    await writeFile(input.outputFile, audioBuffer);
    outputFile = input.outputFile;
  }

  await costTracker.recordUnmetered("generate_music");

  return JSON.stringify({
    success: true,
    audioSizeBytes,
    outputFile,
    message: outputFile
      ? `Music saved to ${outputFile} (${audioSizeBytes} bytes)`
      : `Music generated (${audioSizeBytes} bytes)`,
  });
}
