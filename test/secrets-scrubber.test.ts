import test from "node:test";
import assert from "node:assert/strict";
import { scrubSecrets, truncate } from "../src/utils/secrets-scrubber.ts";

// ─── sk- API keys ─────────────────────────────────────────────────────────────

test("scrubSecrets: redacts sk- API key", () => {
  const input = "using key sk-abcDEF1234567890abcd for auth";
  const result = scrubSecrets(input);
  assert.ok(!result.includes("sk-abcDEF1234567890abcd"), "sk- key should be redacted");
  assert.ok(result.includes("sk-***REDACTED***"), "should contain redaction marker");
});

test("scrubSecrets: does not redact short sk- strings (< 20 chars)", () => {
  const input = "sk-short";
  const result = scrubSecrets(input);
  // Too short — not 20+ chars after "sk-"
  assert.equal(result, input);
});

// ─── Bearer tokens ────────────────────────────────────────────────────────────

test("scrubSecrets: redacts Bearer token", () => {
  const input = "Authorization: Bearer eyJsomeLongToken1234567890";
  const result = scrubSecrets(input);
  assert.ok(!result.includes("eyJsomeLongToken1234567890"), "Bearer token should be redacted");
  assert.ok(result.includes("Bearer ***REDACTED***"), "should contain Bearer redaction");
});

// ─── JWT tokens ───────────────────────────────────────────────────────────────

test("scrubSecrets: redacts JWT token", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const input = `Token: ${jwt}`;
  const result = scrubSecrets(input);
  assert.ok(!result.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "JWT should be redacted");
  assert.ok(result.includes("***JWT_REDACTED***"), "should contain JWT redaction marker");
});

// ─── MINIMAX_API_KEY ──────────────────────────────────────────────────────────

test("scrubSecrets: redacts MINIMAX_API_KEY= assignment", () => {
  const input = "MINIMAX_API_KEY=some-secret-value-here";
  const result = scrubSecrets(input);
  assert.ok(!result.includes("some-secret-value-here"), "key value should be redacted");
  assert.ok(result.includes("MINIMAX_API_KEY=***REDACTED***"), "should have redacted form");
});

test("scrubSecrets: redacts MINIMAX_API_KEY: form", () => {
  const input = "MINIMAX_API_KEY: my-api-key-here";
  const result = scrubSecrets(input);
  assert.ok(!result.includes("my-api-key-here"), "key value should be redacted");
});

// ─── null / undefined / non-string safety ────────────────────────────────────

test("scrubSecrets: returns empty string for null", () => {
  assert.equal(scrubSecrets(null), "");
});

test("scrubSecrets: returns empty string for undefined", () => {
  assert.equal(scrubSecrets(undefined), "");
});

test("scrubSecrets: returns empty string for number", () => {
  assert.equal(scrubSecrets(42), "");
});

test("scrubSecrets: passes through normal text unchanged", () => {
  const input = "No secrets here, just a plain message about a file at /home/user/file.ts";
  assert.equal(scrubSecrets(input), input);
});

// ─── truncate ─────────────────────────────────────────────────────────────────

test("truncate: short string passes through unchanged", () => {
  const s = "hello world";
  assert.equal(truncate(s, 100), s);
});

test("truncate: long string is truncated with trailer", () => {
  const s = "a".repeat(2100);
  const result = truncate(s, 2000);
  assert.equal(result.length < s.length, true, "result should be shorter");
  assert.ok(result.includes("truncated"), "should contain truncation marker");
  assert.ok(result.includes("100 chars"), "should show chars truncated");
});

test("truncate: default max is 2000", () => {
  const s = "b".repeat(2100);
  const result = truncate(s);
  assert.ok(result.startsWith("b".repeat(2000)));
  assert.ok(result.includes("truncated"));
});
