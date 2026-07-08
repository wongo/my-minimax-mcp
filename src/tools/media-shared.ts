import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const MEDIA_BASE_URL = "https://api.minimax.io/v1";

/**
 * Per-call-type deadlines. A bare fetch() has no timeout, so a stalled socket
 * hangs the MCP tool forever. These are ceilings, not expectations — sized so a
 * healthy call never trips them.
 */
export const MEDIA_TIMEOUT_MS = {
  /** Synchronous generation: music and TTS render server-side and can run for minutes. */
  generation: 300_000,
  /** Short JSON round-trips: task submit, status poll, file retrieve. */
  control: 30_000,
  /** Pulling a rendered video or song off the CDN. */
  download: 300_000,
} as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() with a hard deadline. Converts the runtime's TimeoutError/AbortError
 * into a message that names the call that stalled.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  context: string,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`${context} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  }
}

/**
 * Write generated media to an absolute path chosen by the caller.
 *
 * These tools are invoked by the MCP client (Claude), not by the sandboxed
 * MiniMax agent, so `outputFile` is deliberately NOT confined to the working
 * directory the way `safeWriteFile` confines agent writes — the caller already
 * has whatever filesystem access the MCP process has, and pinning output to the
 * project root would break the documented "absolute path" contract.
 * Parent directories are created so callers can name a fresh folder.
 */
export async function writeMediaFile(outputFile: string, data: Buffer): Promise<number> {
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, data);
  return data.length;
}

export async function downloadToFile(url: string, outputFile: string): Promise<number> {
  const response = await fetchWithTimeout(url, {}, MEDIA_TIMEOUT_MS.download, `Download of ${url}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when downloading: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return writeMediaFile(outputFile, Buffer.from(arrayBuffer));
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
