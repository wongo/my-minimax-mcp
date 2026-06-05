import { buildIterationLimitDiagnostics } from "../src/agent/loop.ts";

const result = buildIterationLimitDiagnostics(
  ["read_file → foo.ts", "list_files → src/", "search_content → bar"],
  ["src/baz.ts"],
  25,
);
console.log("stillProgressing:", result.stillProgressing);
console.log("suggestion:", result.suggestion);
console.log("lastActions:", result.lastActions);
console.log("filesModified:", result.filesModified);