import test from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../src/utils/error-classifier.ts";

// ─── path_invalid ─────────────────────────────────────────────────────────────

test("classifyError: ENOENT → path_invalid", () => {
  assert.equal(classifyError(new Error("ENOENT: no such file or directory, open '/foo/bar'")), "path_invalid");
});

test("classifyError: path must be absolute → path_invalid", () => {
  assert.equal(classifyError(new Error("path must be absolute")), "path_invalid");
});

test("classifyError: ENOTDIR → path_invalid", () => {
  assert.equal(classifyError(new Error("ENOTDIR: not a directory")), "path_invalid");
});

// ─── sandbox_violation ───────────────────────────────────────────────────────

test("classifyError: path escapes working directory → sandbox_violation", () => {
  assert.equal(classifyError(new Error("Path escapes working directory: ../secret")), "sandbox_violation");
});

test("classifyError: outside working directory → sandbox_violation", () => {
  assert.equal(classifyError(new Error("Cannot write outside working directory")), "sandbox_violation");
});

// ─── edit_file_no_match ───────────────────────────────────────────────────────

test("classifyError: old_string not found → edit_file_no_match", () => {
  assert.equal(classifyError(new Error("old_string not found in file")), "edit_file_no_match");
});

test("classifyError: fuzzy match failed → edit_file_no_match", () => {
  assert.equal(classifyError(new Error("fuzzy match failed")), "edit_file_no_match");
});

test("classifyError: Closest matches hint → edit_file_no_match", () => {
  assert.equal(classifyError(new Error("Closest matches: Line 42: const x = 1;")), "edit_file_no_match");
});

// ─── iteration_limit ─────────────────────────────────────────────────────────

test("classifyError: maxIterations → iteration_limit", () => {
  assert.equal(classifyError(new Error("Reached maximum iterations (25)")), "iteration_limit");
});

test("classifyError: max iterations exceeded → iteration_limit", () => {
  assert.equal(classifyError(new Error("max iterations exceeded")), "iteration_limit");
});

// ─── api_5xx ─────────────────────────────────────────────────────────────────

test("classifyError: 500 internal server error → api_5xx", () => {
  assert.equal(classifyError(new Error("500 Internal Server Error")), "api_5xx");
});

test("classifyError: 529 → api_5xx", () => {
  assert.equal(classifyError(new Error("Request failed with status 529")), "api_5xx");
});

test("classifyError: service unavailable → api_5xx", () => {
  assert.equal(classifyError(new Error("Service Unavailable")), "api_5xx");
});

// ─── network_timeout ─────────────────────────────────────────────────────────

test("classifyError: ETIMEDOUT → network_timeout", () => {
  assert.equal(classifyError(new Error("ETIMEDOUT")), "network_timeout");
});

test("classifyError: AbortError → network_timeout", () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  assert.equal(classifyError(err), "network_timeout");
});

// ─── auth_error ───────────────────────────────────────────────────────────────

test("classifyError: 401 Unauthorized → auth_error", () => {
  assert.equal(classifyError(new Error("401 Unauthorized")), "auth_error");
});

test("classifyError: invalid api key → auth_error", () => {
  assert.equal(classifyError(new Error("invalid api key")), "auth_error");
});

test("classifyError: status 403 object → auth_error", () => {
  const err = Object.assign(new Error("Forbidden"), { status: 403 });
  assert.equal(classifyError(err), "auth_error");
});

// ─── unknown ─────────────────────────────────────────────────────────────────

test("classifyError: generic unknown error → unknown", () => {
  assert.equal(classifyError(new Error("something completely different")), "unknown");
});

test("classifyError: string error → unknown", () => {
  assert.equal(classifyError("oops"), "unknown");
});

test("classifyError: null → unknown", () => {
  assert.equal(classifyError(null), "unknown");
});
