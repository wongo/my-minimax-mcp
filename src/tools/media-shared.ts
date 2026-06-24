import { writeFile } from "node:fs/promises";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { Telemetry } from "../utils/telemetry.js";

export const MEDIA_BASE_URL = "https://api.minimax.io/v1";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DownloadResult {
  bytesWritten: number;
}

export async function downloadToFile(url: string, outputFile: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when downloading: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(outputFile, buffer);
  return buffer.length;
}

export function assertBaseResp(
  json: unknown,
  context: string,
): asserts json is { base_resp?: { status_code: number; status_msg?: string } } {
  if (
    json !== null &&
    typeof json === "object" &&
    "base_resp" in json &&
    json.base_resp !== null &&
    typeof json.base_resp === "object"
  ) {
    const br = json.base_resp as { status_code: number; status_msg?: string };
    if (br.status_code !== 0) {
      throw new Error(`${context}: [${br.status_code}] ${br.status_msg ?? "unknown error"}`);
    }
  }
}
