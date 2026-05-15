const SCRUB_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // MiniMax / generic API keys starting with sk-
  {
    pattern: /sk-[a-zA-Z0-9_-]{20,}/g,
    replacement: "sk-***REDACTED***",
  },
  // Bearer tokens in Authorization headers
  {
    pattern: /Bearer\s+[A-Za-z0-9._\-]{8,}/g,
    replacement: "Bearer ***REDACTED***",
  },
  // JWT tokens (header.payload.signature pattern)
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "***JWT_REDACTED***",
  },
  // MINIMAX_API_KEY assignment patterns
  {
    pattern: /MINIMAX_API_KEY[=:]\s*[^\s"'\r\n]+/gi,
    replacement: "MINIMAX_API_KEY=***REDACTED***",
  },
];

export function scrubSecrets(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input !== "string") return "";

  let result = input;
  for (const { pattern, replacement } of SCRUB_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function truncate(s: string, max: number = 2000): string {
  if (s.length <= max) return s;
  const truncated = s.slice(0, max);
  const remaining = s.length - max;
  return `${truncated}...[truncated ${remaining} chars]`;
}
