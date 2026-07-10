import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const MAX_SIZE = 20 * 1024 * 1024;
const SUPPORTED_MIMES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_FETCH_TIMEOUT_MS = 30_000;

export function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image format: ${ext}. Supported: JPEG, PNG, WebP`);
  }
}

export async function toBase64DataUrl(input: string): Promise<string> {
  // Validate existing data URLs (format + size)
  if (input.startsWith("data:image/")) {
    const mimeMatch = input.match(/^data:(image\/[\w+.-]+);base64,/);
    if (!mimeMatch || !SUPPORTED_MIMES.includes(mimeMatch[1])) {
      const detected = mimeMatch?.[1] ?? "unknown";
      throw new Error(`Unsupported data URL format: ${detected}. Supported: JPEG, PNG, WebP`);
    }
    const base64Part = input.slice(input.indexOf(",") + 1);
    const byteSize = Math.ceil(base64Part.length * 3 / 4);
    if (byteSize > MAX_SIZE) {
      throw new Error("Image exceeds 20MB limit");
    }
    return input;
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    let response: Response;
    try {
      response = await fetch(input, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(`Image fetch timed out after ${IMAGE_FETCH_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch image: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
    if (!SUPPORTED_MIMES.includes(mimeType)) {
      throw new Error(`Unsupported image Content-Type: ${contentType || "missing"}. Supported: JPEG, PNG, WebP`);
    }

    const contentLength = response.headers.get("Content-Length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_SIZE) {
      throw new Error("Image exceeds 20MB limit");
    }

    const buffer = await readResponseWithLimit(response);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  }

  // Local file path (strip @ prefix if present, like official Python SDK)
  const filePath = input.startsWith("@") ? input.slice(1) : input;

  const buffer = await readFile(filePath);

  if (buffer.length > MAX_SIZE) {
    throw new Error("Image exceeds 20MB limit");
  }

  const mimeType = detectMimeType(filePath);
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function readResponseWithLimit(response: Response): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SIZE) throw new Error("Image exceeds 20MB limit");
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_SIZE) {
        await reader.cancel().catch(() => {});
        throw new Error("Image exceeds 20MB limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}
