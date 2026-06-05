import { MiniMaxClient } from "../client/minimax-client.js";
import type { ChatMessage, ModelId, TokenUsage } from "../client/types.js";
import { calculateCost } from "../client/types.js";
import { AGENT_FUNCTIONS } from "./functions.js";
import { FunctionExecutor } from "./executor.js";
import { type SafetyConfig, getDefaultSafetyConfig } from "./safety.js";

export interface ProgressInfo {
  iteration: number;
  maxIterations: number;
  lastAction: string;
  message: string;
}

export type OnProgressCallback = (info: ProgressInfo) => Promise<void>;

export interface AgentTaskOptions {
  task: string;
  workingDirectory: string;
  model?: ModelId;
  maxIterations?: number;
  systemPrompt?: string;
  onProgress?: OnProgressCallback;
}

export interface AgentTaskResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  iterations: number;
  tokensUsed: TokenUsage;
  cost: number;
  reason?: "iteration_limit" | "timeout" | "task_complete" | "task_failed" | "no_tool_calls";
  diagnostics?: {
    lastActions: string[];
    filesModified: string[];
    stillProgressing: boolean;
    suggestion: string;
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert software engineer executing a coding task. You have access to tools for reading files, writing files, editing files, running shell commands, listing files, and searching code.

Work autonomously to complete the assigned task:
1. First understand the codebase by reading relevant files
2. Plan your approach
3. Implement changes by writing/editing files
4. Test your changes by running appropriate test commands
5. If tests fail, read the errors, fix the code, and re-test
6. When done, call task_complete with a summary

If you cannot complete the task after reasonable attempts, call task_failed with an explanation.

Important:
- Always test your changes before calling task_complete
- Make minimal, focused changes
- Do not modify files unrelated to the task`;

function describeToolCall(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    switch (name) {
      case "read_file":
      case "write_file":
      case "edit_file":
      case "edit_file_batch":
        return `${name} → ${args.path}`;
      case "run_bash":
        return `${name} → ${(args.command as string).slice(0, 80)}`;
      case "list_files":
        return `${name} → ${args.pattern ?? args.path ?? "."}`;
      case "search_content":
        return `${name} → ${args.pattern}`;
      case "task_complete":
        return "task_complete";
      case "task_failed":
        return "task_failed";
      default:
        return name;
    }
  } catch {
    return name;
  }
}

export function buildIterationLimitDiagnostics(
  lastActions: string[],
  filesModified: string[],
  maxIterations: number,
): NonNullable<AgentTaskResult["diagnostics"]> {
  const stillProgressing = lastActions.some(
    a => a.startsWith("write_file") || a.startsWith("edit_file") || a.startsWith("edit_file_batch"),
  );
  const suggested = Math.ceil(maxIterations * 1.5);
  const suggestion = stillProgressing
    ? `Retry with maxIterations=${suggested} — agent was still modifying files in final iterations`
    : `Agent was not modifying files in final iterations (likely stuck in info-gathering or thrashing). Consider decomposing the task into smaller agent_task calls instead of just raising maxIterations.`;
  return {
    lastActions,
    filesModified,
    stillProgressing,
    suggestion,
  };
}

export async function runAgentLoop(
  client: MiniMaxClient,
  options: AgentTaskOptions,
): Promise<AgentTaskResult> {
  const config: SafetyConfig = {
    ...getDefaultSafetyConfig(options.workingDirectory),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
  };

  const executor = new FunctionExecutor(config);
  const model = options.model ?? client.getDefaultModel();
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let iterations = 0;
  const filesModified = new Set<string>();
  const recentActions: string[] = [];

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: options.task },
  ];

  const timeoutAt = Date.now() + config.timeoutMs;

  while (iterations < config.maxIterations) {
    if (Date.now() > timeoutAt) {
      return {
        success: false,
        summary: `Timeout after ${iterations} iterations`,
        filesChanged: [],
        iterations,
        tokensUsed: totalUsage,
        cost: calculateCost(totalUsage, model),
        reason: "timeout",
      };
    }

    const response = await client.chatWithTools(messages, {
      model,
      tools: AGENT_FUNCTIONS,
      // M3 caps at 8192 (error 2013 otherwise). The client has the same
      // default; lower here to avoid the agent path overriding it.
      maxTokens: 8192,
    });

    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;
    iterations++;

    // Report iteration start
    if (options.onProgress) {
      await options.onProgress({
        iteration: iterations,
        maxIterations: config.maxIterations,
        lastAction: "thinking",
        message: `Iteration ${iterations}/${config.maxIterations}: executing ${response.toolCalls.length} tool call(s)`,
      });
    }

    // Check token budget
    if (totalUsage.inputTokens > config.maxInputTokens) {
      return {
        success: false,
        summary: `Token budget exceeded after ${iterations} iterations (${totalUsage.inputTokens} input tokens)`,
        filesChanged: Array.from(filesModified),
        iterations,
        tokensUsed: totalUsage,
        cost: calculateCost(totalUsage, model),
        reason: "iteration_limit",
        diagnostics: buildIterationLimitDiagnostics(
          [...recentActions],
          Array.from(filesModified),
          config.maxIterations,
        ),
      };
    }

    // No tool calls — model responded with text without calling task_complete.
    // This is NOT a successful completion; the model may be asking for
    // clarification or gave up without explicitly signaling task_failed.
    if (response.toolCalls.length === 0) {
      return {
        success: false,
        summary: response.content ?? "Model responded without completing the task",
        filesChanged: [],
        iterations,
        tokensUsed: totalUsage,
        cost: calculateCost(totalUsage, model),
        reason: "no_tool_calls",
      };
    }

    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.toolCalls,
    });

    // Execute each tool call
    for (const toolCall of response.toolCalls) {
      const stepDesc = describeToolCall(toolCall.function.name, toolCall.function.arguments);
      if (options.onProgress) {
        await options.onProgress({
          iteration: iterations,
          maxIterations: config.maxIterations,
          lastAction: stepDesc,
          message: `Iteration ${iterations}/${config.maxIterations}: ${stepDesc}`,
        });
      }

      let result: string;
      try {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        result = await executor.execute(toolCall.function.name, args);

        // Track recent actions (last 3)
        if (stepDesc) {
          recentActions.push(stepDesc);
          if (recentActions.length > 3) recentActions.shift();
        }

        // Track file modifications — all three tools take a single `path` arg
        if (
          toolCall.function.name === "write_file" ||
          toolCall.function.name === "edit_file" ||
          toolCall.function.name === "edit_file_batch"
        ) {
          const pathVal = (args as { path?: string }).path;
          if (typeof pathVal === "string" && pathVal) filesModified.add(pathVal);
        }

        // Check for task_complete / task_failed
        if (toolCall.function.name === "task_complete") {
          const parsed = JSON.parse(result) as { summary: string; files_changed?: string[] };
          return {
            success: true,
            summary: parsed.summary,
            filesChanged: parsed.files_changed ?? [],
            iterations,
            tokensUsed: totalUsage,
            cost: calculateCost(totalUsage, model),
            reason: "task_complete",
          };
        }
        if (toolCall.function.name === "task_failed") {
          const parsed = JSON.parse(result) as { reason: string };
          return {
            success: false,
            summary: parsed.reason,
            filesChanged: [],
            iterations,
            tokensUsed: totalUsage,
            cost: calculateCost(totalUsage, model),
            reason: "task_failed",
          };
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  return {
    success: false,
    summary: `Reached maximum iterations (${config.maxIterations})`,
    filesChanged: Array.from(filesModified),
    iterations,
    tokensUsed: totalUsage,
    cost: calculateCost(totalUsage, model),
    reason: "iteration_limit",
    diagnostics: buildIterationLimitDiagnostics(
      [...recentActions],
      Array.from(filesModified),
      config.maxIterations,
    ),
  };
}
