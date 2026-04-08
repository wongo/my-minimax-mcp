# Repository Guidelines

## Project Structure & Module Organization
Core source lives in `src/`. `src/mcp-server.ts` is the stdio MCP entrypoint, `src/cli.ts` is the local debugging CLI, and feature code is grouped by concern: `src/client/` for MiniMax API access, `src/tools/` for MCP tool handlers, `src/agent/` for the autonomous loop and safety checks, `src/conversation/` for in-memory chat state, and `src/utils/` for shared helpers. Build output goes to `dist/`. Root files of note: `README.md`, `run-mcp.sh`, and `test-plan.md`.

## Build, Test, and Development Commands
Run `npm install` to install dependencies. Use `npm run build` to compile TypeScript into `dist/` with `tsc`. Use `npm run dev` to start the MCP server directly from source with `tsx src/mcp-server.ts`. Use `npm run cli` to exercise the local CLI during development. Example: `npx tsx src/cli.ts --mode agent --task "fix bug" --dir ./tmp-project`.

## Coding Style & Naming Conventions
This project uses strict TypeScript with ES modules and NodeNext resolution. Match the existing style: double quotes, semicolons, trailing commas where valid, and 2-space indentation. Prefer small, focused modules and named exports. Use `camelCase` for variables and functions, `PascalCase` for classes and types, and kebab-case for filenames such as `generate-code.ts` and `cost-tracker.ts`.

## Testing Guidelines
There is no automated test runner configured yet: `npm test` currently exits with an error by design. Before opening a PR, at minimum run `npm run build` and manually verify the affected flow through `npm run dev` or `npm run cli`. Keep any future tests near the code they validate or add a dedicated `tests/` directory, and name files with a clear `.test.ts` suffix.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:`. Keep commit subjects short and imperative, for example `fix: enforce working-directory validation`. PRs should explain the user-visible change, note config or env impacts, link the related issue when applicable, and include CLI or MCP usage examples when behavior changes.

## Security & Configuration Tips
Never hardcode credentials. Use `.env` for `MINIMAX_API_KEY` and related settings, and preserve the working-directory and command-whitelist protections in `src/agent/safety.ts`.
