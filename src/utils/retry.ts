export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onAttempt?: (info: { attempt: number; succeeded: boolean; error?: unknown }) => void | Promise<void>;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10_000,
    backoffMultiplier = 2,
    onAttempt,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  const fireOnAttempt = async (info: { attempt: number; succeeded: boolean; error?: unknown }) => {
    if (!onAttempt) return;
    try {
      await Promise.resolve(onAttempt(info));
    } catch {
      // callback errors must never affect the retry flow
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      await fireOnAttempt({ attempt, succeeded: true });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      await fireOnAttempt({ attempt, succeeded: false, error: err });

      // Don't retry on 4xx errors (except 429 rate limit)
      if (isHttpError(err) && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw lastError;
      }

      if (attempt < maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isHttpError(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}
