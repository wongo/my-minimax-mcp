import type { FunctionDefinition } from "../client/types.js";

export const AGENT_FUNCTIONS: FunctionDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Returns the file content as a string.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to working directory" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file and parent directories if they don't exist. Overwrites existing content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to working directory" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing an exact string match with new content. The old_string must appear exactly once in the file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to working directory" },
        old_string: { type: "string", description: "Exact string to find and replace" },
        new_string: { type: "string", description: "Replacement string" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "run_bash",
    description: "Execute a shell command. Only whitelisted commands are allowed (npm test, npm run, npx, node, tsc, eslint, pytest, go test, cargo test, etc.).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout_ms: { type: "number", description: "Optional timeout in milliseconds (default: 30000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "list_files",
    description: "List files matching a glob pattern in the working directory.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g., 'src/**/*.ts', '*.json')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "search_content",
    description: "Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in (default: working directory)" },
        glob: { type: "string", description: "Optional glob to filter files (e.g., '*.ts')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "task_complete",
    description: "Signal that the task is complete. Call this when you have finished the assigned task successfully.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Summary of what was accomplished" },
        files_changed: {
          type: "array",
          items: { type: "string" },
          description: "List of files that were created or modified",
        },
      },
      required: ["summary"],
    },
  },
  {
    name: "task_failed",
    description: "Signal that the task cannot be completed. Call this when you've exhausted reasonable approaches.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Explanation of why the task failed" },
      },
      required: ["reason"],
    },
  },
];
