import test from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../src/utils/retry.ts";

test("withRetry: onAttempt is called on success (attempt 1)", async () => {
  const calls: Array<{ attempt: number; succeeded: boolean }> = [];

  const result = await withRetry(
    async () => "done",
    {
      onAttempt: (info) => {
        calls.push({ attempt: info.attempt, succeeded: info.succeeded });
      },
    },
  );

  assert.equal(result, "done");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attempt, 1);
  assert.equal(calls[0].succeeded, true);
});

test("withRetry: onAttempt is called with succeeded=false on each retry failure", async () => {
  const calls: Array<{ attempt: number; succeeded: boolean; error?: unknown }> = [];
  let attemptCount = 0;

  await withRetry(
    async () => {
      attemptCount++;
      if (attemptCount < 3) throw new Error("transient error");
      return "ok";
    },
    {
      maxAttempts: 3,
      initialDelayMs: 0,
      onAttempt: (info) => {
        calls.push({ attempt: info.attempt, succeeded: info.succeeded, error: info.error });
      },
    },
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0].succeeded, false);
  assert.ok(calls[0].error instanceof Error, "error should be included on failure");
  assert.equal(calls[1].succeeded, false);
  assert.equal(calls[2].succeeded, true);
  assert.equal(calls[2].error, undefined);
});

test("withRetry: onAttempt callback throw does not affect retry flow", async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts++;
      return "success";
    },
    {
      onAttempt: () => {
        throw new Error("callback error — should be swallowed");
      },
    },
  );

  assert.equal(result, "success");
  assert.equal(attempts, 1);
});

test("withRetry: onAttempt is called on every attempt when all fail", async () => {
  const calls: number[] = [];

  await assert.rejects(
    async () => {
      await withRetry(
        async () => {
          throw new Error("always fails");
        },
        {
          maxAttempts: 3,
          initialDelayMs: 0,
          onAttempt: (info) => {
            calls.push(info.attempt);
          },
        },
      );
    },
    /always fails/,
  );

  assert.deepEqual(calls, [1, 2, 3]);
});

test("withRetry: onAttempt not required (backward compat)", async () => {
  const result = await withRetry(async () => 42, { maxAttempts: 1 });
  assert.equal(result, 42);
});

test("withRetry: async onAttempt callback is awaited without blocking retry", async () => {
  const log: string[] = [];

  const result = await withRetry(
    async () => "value",
    {
      onAttempt: async (info) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        log.push(`attempt=${info.attempt},ok=${info.succeeded}`);
      },
    },
  );

  assert.equal(result, "value");
  assert.deepEqual(log, ["attempt=1,ok=true"]);
});
