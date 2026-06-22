# MiniMax Coding Plan 作為 Agent 網路搜尋替代方案

> 給開發 `my-minimax-mcp` 的 session：說明在 Agent 環境下，這個 MCP 套件如何被當作 firecrawl / tavily 的替代品，以及它的定位與限制。

## 1. 背景

在 Pi 這類 agent 環境中，常見的網路工具是：

- **firecrawl** — 主要的 web 爬取 / 搜尋工具，能力強但 credits 計費。
- **tavily** — LLM-optimized 搜尋，方案有上限。
- **MiniMax Coding Plan web search**（`POST /v1/coding_plan/search`）— 由 `my-minimax-mcp` 提供，月額制。

這次 2026-06-22 早上，Pi 環境中 firecrawl 額度歸 0、tavily 也超出方案上限，整個 web research 流程被迫中斷。後來發現 `my-minimax-mcp` 的 `CodingPlanClient.webSearch()` 可以直接打 `https://api.minimax.io/v1/coding_plan/search`，回傳 LLM 友善的搜尋結果（標題、連結、摘要、日期），剛好可以填補這個缺口。

## 2. 為什麼可以當替代品

### 能力對照

| 任務 | firecrawl | tavily | MiniMax web search |
|---|---|---|---|
| 快速搜尋 / 多源 snippet | ✅ | ✅ | ✅ |
| 公司調查、人物資料 | ✅ | ✅ | ✅ |
| 即時新聞 / 事件查證 | ✅ | ✅ | ✅ |
| 完整原文擷取 | ✅ | ❌ | ❌ |
| PDF / 公告 / 圖表 | ✅ | ❌ | ❌ |
| 全站 map / crawl | ✅ | ❌ | ❌ |
| 計費模型 | credit-based | plan cap | monthly coding plan |

### 成本 / 穩定性

- **firecrawl** 額度用完就停。
- **tavily** 方案到達上限就報錯。
- **MiniMax Coding Plan** 是月額，$19 / $69 之類，屬於訂閱型。對個人或小團隊而言比較穩定。

### 在 Agent 內的整合簡單

`my-minimax-mcp` 的 source code 已經提供完整的 `CodingPlanClient`：

```ts
// src/client/coding-plan-client.ts
constructor(apiKey: string, baseUrl: string = "https://api.minimax.io", defaultModel: ModelId = "MiniMax-M2.7")
async webSearch(query: string): Promise<WebSearchResponse>
async understandImage(prompt: string, imageDataUrl: string, model?: ModelId): Promise<ImageUnderstandResponse>
```

只要 API key 與 `BASE_URL` 沒變，agent 不需要 MCP 註冊或 stdio 傳輸，只要能呼叫 Node/TS 即可。意味著其他 agent 環境（不只是 Claude Code）也能輕鬆整合。

## 3. 在 Pi 環境的實作方式

我們在 `~/.agents/skills/minimax-search/` 建了一個 skill，內容包含：

- `SKILL.md` — 觸發條件、決策規則、API key 來源順序、安全提醒
- `scripts/search.mjs` — 一個 stdlib-only 的 Node.js 腳本，呼叫 `Coding Plan Search` API，回傳 JSON 到 stdout

### 設計重點

- **不需要 MCP stdio 介面** — 對 Pi 之類 agent 環境，只需要 Node 即可呼叫。
- **API key 自動搜尋** — 從 `~/Projects/minimax/.env` 或 `~/.config/minimax-search/.env` 或環境變數讀，不需每次問使用者。
- **stdlib-only** — 沒有額外 npm dependency（不依賴 `dotenv`），可移植性高。
- **decision rules** — Skill 內含「何時該用 MiniMax vs firecrawl vs tavily」對照表，給 agent 自動決策。

## 4. 給 `my-minimax-mcp` 開發 session 的建議

1. **考慮在 README 加一節 "Use as a web search fallback"**
   描述 firecrawl / tavily 用完時如何以純 HTTP 呼叫 web search endpoint，無需 MCP 介面。

2. **提供單一 function call 範例**
   例如一個 curl 範例 + 最簡 Node.js 範例，方便其他 agent 環境快速整合。

3. **說明 `webSearch` 與 `understandImage` 是「coding plan endpoints」**
   與 chat completions 是分開的計費；強調月額制對個人開發者更友善。

4. **保留 tsx / CLI 入口**
   目前 `npx tsx src/cli.ts` 已能跑，但若能再提供一個 `--mode web-search` 直接讀 stdin query、輸出 JSON 會更方便 agent 串接。

5. **可考慮加一個 `minimax_search.json --output` 模式**
   支援批次查詢或多 query JSON 檔輸入，這樣 agent 可以一次發 5–10 個查詢，再用 jq / python 一次彙整。

## 5. 限制與注意事項

- **不是 1:1 取代 firecrawl**。`webSearch` 只回傳 snippet，沒有原文擷取、PDF、表格細節。
- **每次呼叫都會消耗 Coding Plan 額度**，agent 不應無限制濫用。
- **回傳的 snippet 是「提示」，不是引用來源**。Agent 在產出正式報告時仍需自行驗證。
- **API key 安全** — 不要把 key commit 到公開 repo，agent 環境只從本地 `.env` 讀取。
- **預期回傳速度** — 單次查詢 < 1 秒，適合 agent 在搜尋階段多次串接。

## 6. 範例：agent 工作流

1. Agent 收到「幫我查 MiniMax 公司最新狀況」的需求。
2. firecrawl credits 用完 → 自動 fallback 到 `minimax-search` skill。
3. Skill 跑 3 個查詢：
   - `MiniMax Group latest news 2026`
   - `MiniMax Group revenue 2025 financial results`
   - `MiniMax Group MiniMax-M3 release`
4. Agent 用 jq 抽出 organic snippets，整理成中文摘要 + 來源連結。
5. 對每個關鍵數字（營收、估值、產品發布）再各自跑 1 個 cross-check query。

## 7. 相關檔案

- Skill 根目錄：`~/.agents/skills/minimax-search/`
- Skill 描述：`SKILL.md`
- 搜尋腳本：`scripts/search.mjs`
- MCP 原始碼：`~/Projects/minimax/`
- MCP README：<https://www.npmjs.com/package/my-minimax-mcp>
- Coding Plan API 文件：<https://platform.minimax.io/docs/pricing/overview>
