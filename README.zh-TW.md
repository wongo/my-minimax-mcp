# my-minimax-mcp

[English](README.md) | [繁體中文](README.zh-TW.md)

MCP 伺服器，包裝 [MiniMax AI](https://platform.minimax.io) 作為 Claude Code 的自主程式碼執行器。

**用途**：一個典型的程式碼任務中，85% 的 Token 消耗在執行（寫入、測試、除錯），僅 15% 用於規劃。此 MCP 伺服器將那 85% 轉移到 MiniMax API（每任務約 $0.04），讓你的 Claude 訂閱每天可處理 5-7 倍的任務。

## 架構

```
Claude Code (Opus) ─── orchestrator
    │
    ├── minimax_generate_code    → 簡單的程式碼生成
    ├── minimax_agent_task       → 自主代理迴圈 (讀取 → 寫入 → 測試 → 偵錯)
    ├── minimax_chat             → 多輪對話
    ├── minimax_plan             → 結構化 JSON 實作計畫
    └── minimax_cost_report      → 工作階段費用追蹤
```

主要特色是**代理迴圈**：MiniMax 使用函式呼叫來自主讀取檔案、寫入程式碼、執行測試並進行偵錯 — 相當於 Sonnet 子代理，但不會消耗 Claude 訂閱權杖。

## 工具

| 工具 | 描述 | 預設模型 |
|------|-------------|---------------|
| `minimax_agent_task` | 自主程式碼開發：讀取檔案、寫入程式碼、執行測試、偵錯迴圈 | M2.5 |
| `minimax_generate_code` | 生成程式碼，可選擇寫入檔案 | M2.5 |
| `minimax_chat` | 多輪對話，保留上下文 | M2.7 |
| `minimax_plan` | 結構化實作計畫 (JSON 格式) | M2.7 |
| `minimax_cost_report` | 工作階段權杖使用量和費用明細 | — |

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

或手動編輯 `~/.claude.json`：

```json
{
  "mcpServers": {
    "minimax": {
      "command": "bash",
      "args": ["/path/to/my-minimax-mcp/run-mcp.sh"]
    }
  }
}
```

> **注意**：MCP 伺服器必須註冊在 `~/.claude.json`（不是 `~/.claude/settings.json`）。請使用 `claude mcp add` 進行正確的設定。

重新啟動 Claude Code。5 個工具將會自動出現。使用 `claude mcp list` 驗證。

## CLI（用於除錯）

```bash
# 程式碼生成
npx tsx src/cli.ts --task "fibonacci in Python" --language python

# 對話
npx tsx src/cli.ts --mode chat --task "explain async/await"

# 自主代理
npx tsx src/cli.ts --mode agent --task "fix the failing tests" --dir ./my-project
```

## 設定

所有設定透過環境變數：

| 變數 | 描述 | 預設值 |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | API 金鑰（必填） | — |
| `MINIMAX_DEFAULT_MODEL` | 預設模型 | `MiniMax-M2.5` |
| `MINIMAX_MAX_ITERATIONS` | 代理迴圈最大迭代次數 | `25` |
| `MINIMAX_TIMEOUT_MS` | 每任務超時時間 | `300000` (5分鐘) |
| `MINIMAX_BASH_WHITELIST` | 允許的額外 bash 命令（逗號分隔） | — |
| `MINIMAX_WORKING_DIR` | 檔案操作的工作目錄 | `process.cwd()` |
| `MINIMAX_COST_LOG` | 費用日誌檔案路徑 | `~/.claude/minimax-costs.log` |

## 功能

- **最大輸出**：每次回應 65,536 個權杖（約 10,000 中文字 / 約 50,000 英文單字）
- **思考標籤清除**：MiniMax 的 `<think>...</think>` 推理標籤會自動從所有回應中移除

## 安全性

代理迴圈以嚴格的沙盒執行：

- **Bash 白名單**：僅允許 `npm test`、`npx`、`node`、`tsc`、`eslint`、`pytest`、`go test`、`cargo test` 等
- **阻擋命令連結**：拒絕 `&&`、`;`、`|` 運算子
- **路徑隔離**：所有檔案操作限制在工作目錄內
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

完整整合測試（11 次 MCP 呼叫，10 項測試）：

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

## 測試

```bash
# 執行所有測試（15 項測試）
npm test

# 產生覆蓋率報告
npm run coverage
```

單元測試涵蓋安全驗證、費用追蹤、檔案寫入和伺服器初始化。覆蓋率報告使用 Node.js 內建的測試覆蓋率（`--experimental-test-coverage`）。

## 專案結構

```
src/
├── mcp-server.ts           # MCP 伺服器入口（stdio 傳輸）
├── cli.ts                  # CLI 除錯工具
├── client/
│   ├── minimax-client.ts   # MiniMax API 的 OpenAI SDK 包裝
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
│   └── index.ts            # 工具註冊
├── conversation/
│   └── store.ts            # 記憶體對話儲存
└── utils/
    ├── cost-tracker.ts     # 權杖使用量和費用追蹤
    ├── file-writer.ts      # 安全檔案寫入
    └── retry.ts            # 指數退避重試
```

## 授權

MIT