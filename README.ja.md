# my-minimax-mcp

[![npm version](https://img.shields.io/npm/v/my-minimax-mcp.svg)](https://www.npmjs.com/package/my-minimax-mcp)
[![npm downloads](https://img.shields.io/npm/dm/my-minimax-mcp.svg)](https://www.npmjs.com/package/my-minimax-mcp)
[![license](https://img.shields.io/npm/l/my-minimax-mcp.svg)](https://github.com/wongo/my-minimax-mcp/blob/main/LICENSE)
[![CI](https://github.com/wongo/my-minimax-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/wongo/my-minimax-mcp/actions/workflows/ci.yml)

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/wongo/my-minimax-mcp/main/assets/banner.png" alt="Token costs burning vs MiniMax workflow efficiency" width="600">
</p>

[MiniMax AI](https://platform.minimax.io) を Claude Code の自律コード実行エンジンとしてラップした MCP サーバーです。

**目的**：コーディングタスクは書き込み・テスト・デバッグの実行フェーズで Claude サブスクリプションのトークン割当を大量消費します。この MCP サーバーはその作業を MiniMax API（タスクあたり約 $0.04）にオフロードし、1 日により多くのタスクを処理できるようにします。内蔵の節約量トラッカーが実データで効果を証明します。

## アーキテクチャ

```
Claude Code (Opus) ─── オーケストレーター
    │
    ├── minimax_generate_code    → シンプルなコード生成
    ├── minimax_agent_task       → 自律エージェントループ (読み取り → 書き込み → テスト → デバッグ)
    ├── minimax_chat             → マルチターン会話
    ├── minimax_plan             → 構造化 JSON 実装プラン
    ├── minimax_cost_report      → セッションコスト追跡
    ├── minimax_session_tracker  → クロスセッション使用量追跡（シャットダウン時自動保存）
    ├── minimax_web_search       → MiniMax Coding Plan API 経由のウェブ検索
    └── minimax_understand_image → MiniMax VLM による画像解析
```

主要機能は**エージェントループ**です。MiniMax がファンクションコールを使ってファイルの読み取り、コードの書き込み、テストの実行、デバッグを自律的に行います。Claude サブスクリプションのトークンを消費しない Sonnet サブエージェントと同等の働きをします。

## ツール一覧

| ツール | 説明 | デフォルトモデル |
|--------|------|------------------|
| `minimax_agent_task` | 自律コーディング：ファイル読み取り・コード書き込み・テスト実行・デバッグループ。対応ツール：`read_file`、`write_file`、`edit_file`、`edit_file_batch`、`run_bash`、`list_files`、`search_content` | `MINIMAX_DEFAULT_MODEL` |
| `minimax_generate_code` | コード生成（オプションでファイルへの書き込みも可能） | `MINIMAX_DEFAULT_MODEL` |
| `minimax_chat` | コンテキストを保持するマルチターン会話 | `MINIMAX_DEFAULT_MODEL` |
| `minimax_plan` | JSON 形式の構造化実装プラン | `MINIMAX_DEFAULT_MODEL` |
| `minimax_cost_report` | セッションのトークン使用量とコスト内訳 | — |
| `minimax_session_tracker` | 自己改善モード付きのクロスセッション使用量追跡 | — |
| `minimax_web_search` | MiniMax AI を使ったウェブ検索 | — |
| `minimax_understand_image` | MiniMax VLM による画像解析（JPEG/PNG/WebP、最大 20MB） | — |

## インストール

```bash
npm install my-minimax-mcp
```

## セットアップ

### 1. MiniMax API キーの取得

[platform.minimax.io](https://platform.minimax.io) でサインアップして API キーを作成します。

### 2. インストールと設定

**オプション A：npm 経由（推奨）**

```bash
npm install my-minimax-mcp
```

**オプション B：ソースから**

```bash
git clone https://github.com/wongo/my-minimax-mcp.git
cd my-minimax-mcp
npm install
npm run build
```

### 3. `.env` の作成

```
MINIMAX_API_KEY=your_api_key_here
```

### 4. Claude Code への登録

```bash
claude mcp add --transport stdio --scope user minimax -- bash /path/to/my-minimax-mcp/run-mcp.sh
```

または `~/.claude/settings.json` を直接編集：

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

> **注意**：最もシンプルなセットアップには `claude mcp add` を使用するか、`~/.claude/settings.json` を直接編集してください。

Claude Code を再起動すると 8 つのツールが自動的に表示されます。`claude mcp list` で確認できます。

### 5. 自己改善ループの有効化（任意）

```bash
npx my-minimax-mcp --init
```

CLAUDE.md テンプレートを表示し、使用量ログを作成します。テンプレートを `~/.claude/CLAUDE.md` にコピーすることで、エグゼキューターのルーティングルールが有効になります。セッション追跡は自動です。詳細は `templates/setup-guide.md` を参照してください。

## CLI（デバッグ用）

```bash
# コード生成
npx tsx src/cli.ts --task "fibonacci in Python" --language python

# チャット
npx tsx src/cli.ts --mode chat --task "explain async/await"

# 自律エージェント
npx tsx src/cli.ts --mode agent --task "fix the failing tests" --dir ./my-project
```

CLI の実行も `MINIMAX_COST_LOG` に記録されるため、`--end-session` と `--savings-report` には MCP 使用分に加えて通常の CLI 使用分も含まれます。

## 設定

すべての設定は環境変数で行います：

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `MINIMAX_API_KEY` | API キー（必須） | — |
| `MINIMAX_DEFAULT_MODEL` | すべての MiniMax ツールのデフォルトモデル（呼び出し単位での上書きが可能） | `MiniMax-M2.7` |
| `MINIMAX_MAX_ITERATIONS` | エージェントループの最大イテレーション数 | `25` |
| `MINIMAX_TIMEOUT_MS` | タスクごとのタイムアウト | `300000`（5分） |
| `MINIMAX_BASH_WHITELIST` | 追加で許可する bash コマンド（カンマ区切り） | — |
| `MINIMAX_WORKING_DIR` | ファイル操作のベース作業ディレクトリ。`minimax_agent_task` はこのディレクトリまたはそのサブディレクトリのみ使用可能 | `process.cwd()` |
| `MINIMAX_COST_LOG` | コストログのファイルパス | `~/.claude/minimax-costs.log` |
| `MINIMAX_USAGE_LOG` | セッション使用量ログのパス | `~/.claude/minimax-usage.jsonl` |
| `MINIMAX_SESSION_TARGET` | セッションあたりの最低 MiniMax 呼び出し回数 | `5` |

## 自己改善ループ

使用量追跡は**自動**です。MCP サーバーはシャットダウン時（SIGTERM/SIGINT）にセッションデータを `~/.claude/minimax-usage.jsonl` に保存します。手動での `start`/`end` 呼び出しは不要です。

**任意コマンド**（`minimax_session_tracker` 経由）：
- `"start"` — 現在のモードと最近のトレンドを確認
- `"status"` — セッション中の進捗、トレンド分析、連続達成回数
- `"end"` — 明示的な終了（目標未達の場合は根本原因メモを付加可能）

**モード：**
- **Normal**：デフォルト。`MINIMAX_SESSION_TARGET` 回の呼び出しが目標（デフォルト：5）
- **Warning**：前回のセッションで目標未達 — MiniMax を優先使用
- **Forced**：2 回連続で未達 — すべてのコード変更で MiniMax を使用必須

**トレンド分析**：`status` コマンドはトレンド方向（improving/declining/stable）、連続達成回数、実行可能なインサイトを返します。

**SessionEnd フック**（任意、完全自動追跡用）：

```bash
npx my-minimax-mcp --end-session
```

`~/.claude/settings.json` のフックに追加：

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

`MINIMAX_DEFAULT_MODEL` には Token Plan でサポートされている最高のモデルを設定してください。すべての MiniMax ツールはデフォルトでこの値を継承し、プランで利用できないモデルは API が自動的に拒否します。

## 失敗ログとテレメトリ

すべてのツール呼び出しの結果（成功・失敗・リトライ）は `logs/` ディレクトリに自動的に記録されます。設定は不要です。

### ログファイル

| ファイル | 内容 |
|----------|------|
| `logs/failures-YYYY-MM.jsonl` | 失敗レコード（エラーカテゴリ、フィンガープリント、呼び出し元プロジェクト） |
| `logs/success-YYYY-MM.jsonl` | 成功レコード（ツール、所要時間、モデル、イテレーション数） |
| `logs/retries-YYYY-MM.jsonl` | リトライレコード（試行回数、最終結果） |

ファイルは月次でローテーションされます。`logs/` ディレクトリは gitignore 設定済みです。

### エラーカテゴリ（8種類）

`path_invalid` · `sandbox_violation` · `edit_file_no_match` · `iteration_limit` · `api_5xx` · `network_timeout` · `auth_error` · `unknown`

### ダイジェスト分析

```bash
# 今月のダイジェスト（7セクション）
node scripts/analyze-failures.mjs

# 特定の月を指定
node scripts/analyze-failures.mjs --month 2026-05

# カスタム日付範囲
node scripts/analyze-failures.mjs --from 2026-05-01 --to 2026-05-15

# JSON 出力（機械処理用）
node scripts/analyze-failures.mjs --json
```

出力セクション：**Summary**（総呼び出し数/成功率）、**Top categories**、**Top fingerprints**（重複排除済みバグ）、**Per-tool**、**Per-caller**（呼び出し元プロジェクト）、**Retry effectiveness**、**Quick wins**（成功率 80% 未満の高頻度問題）。

### 環境変数による上書き

| 変数 | 説明 |
|------|------|
| `MINIMAX_FAILURE_LOG_DIR` | カスタムログディレクトリ（デフォルト：`<project-root>/logs`） |

## トークン節約量の追跡

すべての MiniMax 呼び出しが追跡され、節約量が自動計算されます。通常の CLI 実行と MCP サーバー使用の両方が対象です。`minimax_cost_report` でセッションごとのリアルタイム節約量を確認、または CLI で累積レポートを表示できます。

### リアルタイム（セッションごと）

`minimax_cost_report` には `savings` セクションが含まれます：
- **tokensOffloaded**：MiniMax が Claude の代わりに処理した正確なトークン数
- **equivalentSonnetCalls**：それが何回分の Sonnet サブエージェント呼び出しに相当するか
- **avgTokensPerCall**：自己適応型メトリクス（データが増えるほど精度が向上）

### 累積（履歴）

```bash
npx my-minimax-mcp --savings-report
```

ツールレベルの分析を含む全期間・月次・日次の内訳を表示：

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

### 自己適応型の精度

`avgTokensPerCall` メトリクスはあなたの使用パターンに適応します：
- **データ 10 件未満**：保守的なデフォルト値を使用（8,000 トークン/呼び出し）
- **10〜100 件**：計測済みのすべての呼び出しから平均を計算
- **100 件以上**：直近 100 件のローリングウィンドウを使用

信頼度レベル（LOW/MEDIUM/HIGH）が報告されるため、推定値の信頼性を確認できます。MiniMax を使えば使うほど、節約量レポートの精度が上がります。

## ウェブ検索と画像理解

これらのツールは MiniMax の Coding Plan API（チャット補完エンドポイントとは別）を使用します。Token Plan サブスクリプションに含まれており、追加費用はかかりません。

### ウェブ検索

```
minimax_web_search { query: "TypeScript MCP サーバー チュートリアル" }
```

オーガニック検索結果（タイトル、リンク、スニペット、日付）と関連検索候補を返します。

### 画像理解

```
minimax_understand_image {
  prompt: "この画像から営業時間を抽出してください",
  imageSource: "https://example.com/schedule.png"
}
```

3 種類の入力形式に対応：
- **HTTP/HTTPS URL**：自動的にフェッチして base64 に変換
- **ローカルファイルパス**：ディスクから読み取り（`@` プレフィックスに対応）
- **Base64 data URL**：そのまま渡す

対応フォーマット：JPEG、PNG、WebP（最大 20MB）。

## 機能

- **最大出力**：レスポンスあたり 65,536 トークン（日本語約 3 万文字 / 英語約 5 万語）
- **Think タグの削除**：MiniMax の `<think>...</think>` 推論タグはすべてのレスポンスから自動削除

## セキュリティ

エージェントループは厳格なサンドボックス環境で実行されます：

- **Bash ホワイトリスト**：`npm test`、`npx`、`node`、`tsc`、`eslint`、`pytest`、`go test`、`cargo test` などのみ許可
- **コマンド連結のブロック**：`&&`、`;`、`|` 演算子は拒否
- **パス隔離**：すべてのファイル操作は作業ディレクトリ内に制限
- **エージェント作業ディレクトリ境界**：`minimax_agent_task` は `MINIMAX_WORKING_DIR` またはそのサブディレクトリ内でのみ動作可能
- **イテレーション上限**：タスクあたり最大 25 回（設定変更可能）
- **タイムアウト**：タスクあたり 5 分（設定変更可能）
- **トークン予算**：タスクあたり入力トークン最大 50 万

## コスト

MiniMax API 料金（100 万トークンあたり）：

| モデル | 入力 | 出力 | 用途 |
|--------|------|------|------|
| M2.5 | $0.118 | $0.99 | 通常のコード生成 |
| M2.7 | $0.30 | $1.20 | 複雑な推論 |

典型的なタスクコスト：**約 $0.04**（10 イテレーションのエージェントループ）。

### 検証済みテスト結果

完全統合テスト（14 MCP 呼び出し、13 テスト）：

```
総コスト：   $0.012（1.2 セント）
入力トークン： 38,913
出力トークン： 7,228
```

| テスト | 結果 |
|--------|------|
| API 接続 | PASS |
| コード生成 | PASS |
| エージェントループ（自律バグ修正） | PASS |
| 構造化プランニング（JSON） | PASS |
| マルチターン会話 | PASS |
| コスト追跡 | PASS |
| マルチファイルタスク（Todo モジュール） | PASS |
| セキュリティ（危険なコマンドのブロック） | PASS |
| ルーティング（Opus → MiniMax、Sonnet ではない） | PASS |
| グレースフル失敗（最大イテレーション数） | PASS |
| ウェブ検索（日本語クエリ） | PASS |
| 画像理解（URL） | PASS |
| 画像理解（ローカルファイル） | PASS |

## テスト

```bash
# 全テストを実行（148 テスト）
npm test

# カバレッジレポートを生成
npm run coverage
```

ユニットテストはセーフティバリデーション、コスト追跡、ファイル書き込み、サーバー初期化、セッション追跡、画像ユーティリティ、Coding Plan クライアント、節約量計算機、および失敗ログシステム（エラー分類、シークレットスクラビング、テレメトリ、リトライ追跡）をカバーしています。カバレッジレポートは Node.js 組み込みのテストカバレッジ（`--experimental-test-coverage`）を使用します。

## プロジェクト構造

```
src/
├── mcp-server.ts           # MCP サーバーエントリ（stdio トランスポート）
├── cli.ts                  # デバッグ用 CLI
├── client/
│   ├── minimax-client.ts   # MiniMax チャット API 用 OpenAI SDK ラッパー
│   ├── coding-plan-client.ts # Coding Plan API 用ネイティブ fetch クライアント（ウェブ検索、VLM）
│   └── types.ts            # 共有型と料金
├── agent/
│   ├── loop.ts             # エージェントループのコアロジック
│   ├── functions.ts        # MiniMax 用ファンクション定義
│   ├── executor.ts         # ファンクションコール実行エンジン
│   └── safety.ts           # ホワイトリスト、パス検証、制限
├── tools/
│   ├── agent-task.ts       # minimax_agent_task
│   ├── generate-code.ts    # minimax_generate_code
│   ├── chat.ts             # minimax_chat
│   ├── plan.ts             # minimax_plan
│   ├── web-search.ts       # minimax_web_search
│   ├── understand-image.ts # minimax_understand_image
│   └── index.ts            # ツールレジストリ
├── conversation/
│   └── store.ts            # インメモリ会話ストア
└── utils/
    ├── cost-tracker.ts     # トークン使用量とコスト追跡（セッション ID 付き）
    ├── session-tracker.ts  # クロスセッション使用量追跡とトレンド分析
    ├── file-writer.ts      # 安全なファイル書き込み
    ├── image.ts            # 画像を base64 data URL に変換
    ├── savings-calculator.ts # トークン節約量計算（自己適応型）
    ├── failure-logger.ts   # 失敗 JSONL ログ（スクラビング、フィンガープリント、月次ローテーション）
    ├── telemetry.ts        # 成功・リトライのテレメトリ記録
    ├── error-classifier.ts # エラー分類（8 カテゴリ）
    ├── secrets-scrubber.ts # 機密データの削除
    └── retry.ts            # 指数バックオフリトライ（onAttempt コールバック付き）
scripts/
└── analyze-failures.mjs    # 月次失敗・テレメトリダイジェスト分析ツール
logs/                       # 実行時 JSONL ファイル（gitignore 設定済み）
```

## 更新履歴

### v1.4.0（2026-05-17）

**失敗ログとテレメトリ**
- すべてのツール呼び出し（成功・失敗・リトライ）が `logs/` に月次 JSONL ログとして記録されるようになりました
- 8 つのエラーカテゴリ：`path_invalid`、`sandbox_violation`、`edit_file_no_match`、`iteration_limit`、`api_5xx`、`network_timeout`、`auth_error`、`unknown`
- シークレットスクラビング — API キー、Bearer トークン、JWT はログに記録されません
- 重複排除フィンガープリント — 同一バグは 1 件に集約
- 呼び出し元帰属 — 作業ディレクトリから呼び出し元プロジェクトを特定
- 7 セクションのダイジェストを出力する `scripts/analyze-failures.mjs` を新規追加

**バグ修正**
- `sandbox_violation` が failure logger に捕捉されない問題を修正（バリデーションを try ブロック内に移動）
- sandbox violation 時に `callerProject` が `(unknown)` になる問題を修正 — 生の入力パスにフォールバック
- `MINIMAX_WORKING_DIR` が minimax プロジェクトディレクトリをデフォルトとしていたため、クロスプロジェクトの `agent_task` 呼び出しがすべてブロックされていた問題を修正；`run-mcp.sh` が `~/Projects` を設定するように変更

**内部変更**
- `retry.ts`：リトライテレメトリ用の `onAttempt` コールバックを追加
- `agent/loop.ts`：`AgentTaskResult` に `reason` フィールドを追加（`iteration_limit`、`timeout`、`task_complete`、`task_failed`、`no_tool_calls`）
- テスト数：96 → 148

### v1.3.8

- セッションコストレポートで `tokensOffloaded` を常に保証
- `--diagnose` フラグと日付範囲フラグを追加した節約量分析ツール（`scripts/analyze-savings.mjs`）
- ランチャースクリプトの強化、失敗ログの基盤整備

### v1.3.6 – v1.3.7

- `edit_file` のファジーマッチ（CRLF / 末尾スペース許容）、失敗時に最近 3 行のヒントを提供
- `edit_file_batch` による 1 回のイテレーションでの原子的多点編集
- ルーティング調整：Sonnet のトリガー閾値を 5 ファイルからクロスカット リファクタリングのみに引き上げ
- `minimax_session_tracker` がシャットダウン時に自動保存（手動 `end` 呼び出し不要）

## ライセンス

MIT
