# my-minimax-mcp

[English](README.md) | [繁體中文](README.zh-TW.md)

MCP 伺服器，包裝 [MiniMax AI](https://platform.minimax.io) 作為 Claude Code 的自主程式碼執行器。

**用途**：程式碼任務的大部分 Claude 訂閱額度消耗在執行（寫入、測試、除錯）。此 MCP 伺服器將這些工作卸載到 MiniMax API（每任務約 $0.04），讓你的 Claude 訂閱能處理更多任務。內建的節省量追蹤用真實數據證明效果。

## 架構

```
Claude Code (Opus) ─── orchestrator
    │
    ├── minimax_generate_code    → 簡單的程式碼生成
    ├── minimax_agent_task       → 自主代理迴圈 (讀取 → 寫入 → 測試 → 偵錯)
    ├── minimax_chat             → 多輪對話
    ├── minimax_plan             → 結構化 JSON 實作計畫
    ├── minimax_cost_report      → 工作階段費用追蹤
    ├── minimax_session_tracker  → 跨 session 使用率追蹤（關閉時自動持久化）
    ├── minimax_web_search       → 透過 MiniMax Coding Plan API 搜尋網頁
    └── minimax_understand_image → 透過 MiniMax VLM 分析圖片
```

主要特色是**代理迴圈**：MiniMax 使用函式呼叫來自主讀取檔案、寫入程式碼、執行測試並進行偵錯 — 相當於 Sonnet 子代理，但不會消耗 Claude 訂閱權杖。

## 工具

| 工具 | 描述 | 預設模型 |
|------|-------------|---------------|
| `minimax_agent_task` | 自主程式碼開發：讀取檔案、寫入程式碼、執行測試、偵錯迴圈 | `MINIMAX_DEFAULT_MODEL` |
| `minimax_generate_code` | 生成程式碼，可選擇寫入檔案 | `MINIMAX_DEFAULT_MODEL` |
| `minimax_chat` | 多輪對話，保留上下文 | `MINIMAX_DEFAULT_MODEL` |
| `minimax_plan` | 結構化實作計畫 (JSON 格式) | `MINIMAX_DEFAULT_MODEL` |
| `minimax_cost_report` | 工作階段權杖使用量和費用明細 | — |
| `minimax_session_tracker` | 跨 session 使用率追蹤，自我改善模式 | — |
| `minimax_web_search` | 使用 MiniMax AI 搜尋網頁 | — |
| `minimax_understand_image` | 使用 MiniMax VLM 分析圖片（JPEG/PNG/WebP，上限 20MB） | — |

## 安裝

```bash
npm install my-minimax-mcp
```

## 設定

### 1. 取得 MiniMax API 金鑰

在 [platform.minimax.io](https://platform.minimax.io) 註冊並建立 API 金鑰。

### 2. 安裝與設定

**選項 A：透過 npm（推薦）**

```bash
npm install my-minimax-mcp
```

**選項 B：從原始碼**

```bash
git clone https://github.com/wongo/my-minimax-mcp.git
cd my-minimax-mcp
npm install
npm run build
```

### 3. 建立 `.env`

```
MINIMAX_API_KEY=your_api_key_here
```

### 4. 在 Claude Code 中註冊

```bash
claude mcp add --transport stdio --scope user minimax -- bash /path/to/my-minimax-mcp/run-mcp.sh
```

或手動編輯 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "minimax": {
      "command": "npx",
      "args": ["my-minimax-mcp"],
      "env": {
        "MINIMAX_API_KEY": "your-api-key",
        "MINIMAX_DEFAULT_MODEL": "MiniMax-M2.7"
      }
    }
  }
}
```

> **注意**：使用 `claude mcp add` 是最簡單的設定方式，或直接編輯 `~/.claude/settings.json`。

重新啟動 Claude Code。8 個工具將會自動出現。使用 `claude mcp list` 驗證。

### 5. 啟用自我改善迴路（選用）

```bash
npx my-minimax-mcp --init
```

這會顯示 CLAUDE.md 模板並建立使用率記錄檔。將模板複製到 `~/.claude/CLAUDE.md` 即可啟用執行器路由規則。Session 追蹤是自動的 — MCP 伺服器關閉時會自動持久化使用數據。詳見 `templates/setup-guide.md`。

## CLI（用於除錯）

```bash
# 程式碼生成
npx tsx src/cli.ts --task "fibonacci in Python" --language python

# 對話
npx tsx src/cli.ts --mode chat --task "explain async/await"

# 自主代理
npx tsx src/cli.ts --mode agent --task "fix the failing tests" --dir ./my-project
```

CLI 執行現在也會寫入 `MINIMAX_COST_LOG`，因此 `--end-session` 與 `--savings-report` 會納入一般 CLI 使用，而不只 MCP 伺服器流量。

## 設定

所有設定透過環境變數：

| 變數 | 描述 | 預設值 |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | API 金鑰（必填） | — |
| `MINIMAX_DEFAULT_MODEL` | 所有 MiniMax chat/plan/code/agent 工具的預設模型；若單次呼叫有明確指定 `model` 則以該值為準 | `MiniMax-M2.7` |
| `MINIMAX_MAX_ITERATIONS` | 代理迴圈最大迭代次數 | `25` |
| `MINIMAX_TIMEOUT_MS` | 每任務超時時間 | `300000` (5分鐘) |
| `MINIMAX_BASH_WHITELIST` | 允許的額外 bash 命令（逗號分隔） | — |
| `MINIMAX_WORKING_DIR` | 檔案操作的基底工作目錄；`minimax_agent_task` 只能使用此目錄或其子目錄 | `process.cwd()` |
| `MINIMAX_COST_LOG` | 費用日誌檔案路徑 | `~/.claude/minimax-costs.log` |
| `MINIMAX_USAGE_LOG` | Session 使用率記錄檔路徑 | `~/.claude/minimax-usage.jsonl` |
| `MINIMAX_SESSION_TARGET` | 每 session 最低 MiniMax 呼叫數 | `5` |

## 自我改善迴路

使用率追蹤是**自動的** — MCP 伺服器關閉時（SIGTERM/SIGINT）會自動將 session 數據持久化到 `~/.claude/minimax-usage.jsonl`。無需手動呼叫 `start`/`end`。

**可選命令**（透過 `minimax_session_tracker`）：
- `"start"` — 查看當前模式和最近趨勢
- `"status"` — 中途進度，含趨勢分析和連續達標記錄
- `"end"` — 明確結束 session，可附帶未達標根因

**模式：**
- **Normal**：預設。目標為 `MINIMAX_SESSION_TARGET` 次呼叫（預設：5）
- **Warning**：上次 session 未達標 — 優先使用 MiniMax
- **Forced**：連續 2 次未達標 — 所有程式碼修改必須使用 MiniMax

**趨勢分析**：`status` 命令回傳趨勢方向（improving/declining/stable）、連續達標次數和可行的洞察建議。

**SessionEnd Hook**（選用，完全自動化追蹤）：

```bash
npx my-minimax-mcp --end-session
```

加入 `~/.claude/settings.json` hooks：

```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "npx my-minimax-mcp --end-session",
        "timeout": 10
      }]
    }]
  }
}
```

將 `MINIMAX_DEFAULT_MODEL` 設為你的 Token Plan 支援的最高模型。所有 MiniMax 工具現在都會預設繼承這個值；不在你 plan 範圍的模型，API 會自動拒絕。

## Token 節省追蹤

每次 MiniMax 呼叫都會被追蹤，節省量自動計算。這包含一般 CLI 執行與 MCP 伺服器使用。使用 `minimax_cost_report` 查看即時 session 節省量，或用 CLI 查看歷史累計報告。

### 即時（每個 session）

`minimax_cost_report` 現在包含 `savings` 區塊：
- **tokensOffloaded**：MiniMax 替代 Claude 處理的精確 token 數
- **equivalentSonnetCalls**：相當於多少次 Sonnet sub-agent 呼叫
- **avgTokensPerCall**：自適應指標（隨數據累積自動提升精度）

### 歷史累計

```bash
npx my-minimax-mcp --savings-report
```

顯示全時間、每月和每日的明細，含工具級分析：

```
=== MiniMax Token Savings Report ===

Tokens offloaded to MiniMax: 426,040 in + 161,496 out = 587,536 total
Equivalent Sonnet calls saved: ~68 (avg 8,635 tokens/call)
MiniMax API cost: $0.2468 (billed separately, not your subscription)

--- By Tool ---
  agent_task           400,254 tokens (68.1%) | 8 calls
  generate_code        144,290 tokens (24.6%) | 37 calls
  chat                  28,142 tokens (4.8%)  | 20 calls
```

### 自適應精度

`avgTokensPerCall` 根據你的使用模式自動調整：
- **< 10 筆數據**：使用保守預設值（8,000 tokens/call）
- **10-100 筆**：從所有有 token 數據的呼叫計算平均值
- **100+ 筆**：使用最近 100 筆的滾動平均

報告中包含信心等級（LOW/MEDIUM/HIGH），讓你知道估算的可靠程度。MiniMax 用得越多，節省報告越精確。

## 網頁搜尋 & 圖片辨識

這些工具使用 MiniMax 的 Coding Plan API（獨立於 chat completions 端點）。包含在你的 Token Plan 訂閱中，無額外費用。

### 網頁搜尋

```
minimax_web_search { query: "TypeScript MCP server 教學" }
```

回傳搜尋結果（標題、連結、摘要、日期）和相關搜尋建議。

### 圖片辨識

```
minimax_understand_image {
  prompt: "從這張圖片提取營業時間",
  imageSource: "https://example.com/schedule.png"
}
```

接受三種輸入：
- **HTTP/HTTPS URL**：自動下載並轉換為 base64
- **本地檔案路徑**：從磁碟讀取（支援 `@` 前綴）
- **Base64 data URL**：直接傳遞

支援格式：JPEG、PNG、WebP（上限 20MB）。

## 功能

- **最大輸出**：每次回應 65,536 個權杖（約 10,000 中文字 / 約 50,000 英文單字）
- **思考標籤清除**：MiniMax 的 `<think>...</think>` 推理標籤會自動從所有回應中移除

## 安全性

代理迴圈以嚴格的沙盒執行：

- **Bash 白名單**：僅允許 `npm test`、`npx`、`node`、`tsc`、`eslint`、`pytest`、`go test`、`cargo test` 等
- **阻擋命令連結**：拒絕 `&&`、`;`、`|` 運算子
- **路徑隔離**：所有檔案操作限制在工作目錄內
- **代理工作目錄邊界**：`minimax_agent_task` 只能在 `MINIMAX_WORKING_DIR` 或其子目錄內運作
- **迭代上限**：每任務最多 25 次迭代（可設定）
- **超時**：每任務 5 分鐘（可設定）
- **權杖預算**：每任務最多 500K 輸入權杖

## 費用

MiniMax API 定價（每 1M 權杖）：

| 模型 | 輸入 | 輸出 | 適用場景 |
|-------|-------|--------|----------|
| M2.5 | $0.118 | $0.99 | 常規程式碼生成 |
| M2.7 | $0.30 | $1.20 | 複雜推理 |

典型任務費用：**約 $0.04**（10 次迭代的代理迴圈）。

### 已驗證的測試結果

完整整合測試（14 次 MCP 呼叫，13 項測試）：

```
總費用：   $0.012 (1.2 分)
輸入權杖： 38,913
輸出權杖： 7,228
```

| 測試 | 結果 |
|------|--------|
| API 連線 | 通過 |
| 程式碼生成 | 通過 |
| 代理迴圈（自主錯誤修復） | 通過 |
| 結構化規劃 (JSON) | 通過 |
| 多輪對話 | 通過 |
| 費用追蹤 | 通過 |
| 多檔案任務（待辦事項模組） | 通過 |
| 安全性（危險命令被阻擋） | 通過 |
| 路由（Opus → MiniMax，非 Sonnet） | 通過 |
| 優雅失敗（最大迭代次數） | 通過 |
| 網頁搜尋（日文查詢） | 通過 |
| 圖片辨識（URL 圖片） | 通過 |
| 圖片辨識（本地檔案） | 通過 |

## 測試

```bash
# 執行所有測試（80 項測試）
npm test

# 產生覆蓋率報告
npm run coverage
```

單元測試涵蓋安全驗證、費用追蹤、檔案寫入、伺服器初始化、session 追蹤、圖片工具、Coding Plan 客戶端和節省量計算器（自適應平均、累計分組、工具分析）。覆蓋率報告使用 Node.js 內建的測試覆蓋率（`--experimental-test-coverage`）。

## 專案結構

```
src/
├── mcp-server.ts           # MCP 伺服器入口（stdio 傳輸）
├── cli.ts                  # CLI 除錯工具
├── client/
│   ├── minimax-client.ts   # MiniMax Chat API 的 OpenAI SDK 包裝
│   ├── coding-plan-client.ts # Coding Plan API 原生 fetch 客戶端（網頁搜尋、VLM）
│   └── types.ts            # 共用類型和定價
├── agent/
│   ├── loop.ts             # 代理迴圈核心邏輯
│   ├── functions.ts        # MiniMax 函式定義
│   ├── executor.ts         # 函式呼叫執行器
│   └── safety.ts           # 白名單、路徑驗證、限制
├── tools/
│   ├── agent-task.ts       # minimax_agent_task
│   ├── generate-code.ts    # minimax_generate_code
│   ├── chat.ts             # minimax_chat
│   ├── plan.ts             # minimax_plan
│   ├── web-search.ts       # minimax_web_search
│   ├── understand-image.ts # minimax_understand_image
│   └── index.ts            # 工具註冊
├── conversation/
│   └── store.ts            # 記憶體對話儲存
└── utils/
    ├── cost-tracker.ts     # 權杖使用量和費用追蹤（含 session ID）
    ├── session-tracker.ts  # 跨 session 使用率追蹤和趨勢分析
    ├── file-writer.ts      # 安全檔案寫入
    ├── image.ts            # 圖片轉 base64 data URL
    ├── savings-calculator.ts # Token 節省量計算（自適應）
    └── retry.ts            # 指數退避重試
```

## 授權

MIT
