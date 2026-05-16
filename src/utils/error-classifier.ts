export type ErrorCategory =
  | "path_invalid"
  | "sandbox_violation"
  | "edit_file_no_match"
  | "iteration_limit"
  | "api_5xx"
  | "network_timeout"
  | "auth_error"
  | "unknown";

const PATTERNS: Array<{ category: ErrorCategory; pattern: RegExp }> = [
  {
    category: "sandbox_violation",
    pattern: /path escapes working directory|outside working directory|path escapes|sandbox violation/i,
  },
  {
    category: "edit_file_no_match",
    pattern: /old_string not found|fuzzy match failed|edit failed.*not match|string.*not found.*file|closest matches|no match found for edit/i,
  },
  {
    category: "iteration_limit",
    pattern: /maxIterations|iteration limit|max iterations exceeded|reached maximum iterations/i,
  },
  {
    category: "api_5xx",
    pattern: /\b5\d{2}\b|server error|service unavailable|529|internal server error|bad gateway|gateway timeout/i,
  },
  {
    category: "network_timeout",
    pattern: /ETIMEDOUT|AbortError|timeout|ECONNRESET|ECONNREFUSED|network.*timeout|fetch.*timeout/i,
  },
  {
    category: "auth_error",
    pattern: /\b401\b|\b403\b|unauthorized|forbidden|invalid api key|invalid_api_key|authentication.*failed/i,
  },
  {
    category: "path_invalid",
    pattern: /ENOENT|no such file|path must be absolute|not a directory|invalid path|file not found|directory not found|ENOTDIR/i,
  },
];

export function classifyError(err: unknown): ErrorCategory {
  const message = err instanceof Error
    ? `${err.name} ${err.message}`.trim()
    : String(err);

  for (const { category, pattern } of PATTERNS) {
    if (pattern.test(message)) {
      return category;
    }
  }

  // Also check numeric status codes if the error has a status property
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    const status = (err as { status: number }).status;
    if (status === 401 || status === 403) return "auth_error";
    if (status >= 500 || status === 529) return "api_5xx";
  }

  return "unknown";
}
