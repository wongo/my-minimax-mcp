# MiniMax 音影生成研究 — Handoff Document

> 日期：2026-06-24  
> 來源 session：主工作區（nickw home）  
> 目的：交接給 MiniMax MCP 專案 session，評估是否擴充影音生成工具支援

---

## 背景：短影音生成的三種方法

在 Claude Code 環境下生成短影音，目前主流有三條路：

### 方法一：Remotion（程式碼渲染）
- 用 React/TypeScript 寫動畫，`npx remotion render` 輸出 MP4
- 適合：字卡、motion graphics、data visualization
- 成本：完全免費（本地執行）
- 安裝：`npx skills add remotion`
- 2026 年初推出 Agent Skills，一週 25k+ 安裝

### 方法二：HyperFrames + ElevenLabs
- HyperFrames 生成 AI 動態視覺，ElevenLabs 配音，Claude Code orchestration
- Claude Code 環境已有 `/hyperframes` skill
- 成本：每支短影音 < $1 USD

### 方法三：直接呼叫 AI 影片模型 API（本文重點）
- 呼叫 Kling / Veo / Seedance / **MiniMax Hailuo** 等模型
- FFmpeg 後製拼接
- 成本：約 $1.50 / 10 秒（Seedance 2.0）

---

## MiniMax 音影生成能力總覽

MiniMax 是目前少數**全模態**覆蓋的 AI 公司（文字、語音、音樂、影片、圖片）。

### 影片：Hailuo（海螺 AI）

| 版本 | 特色 | 費用 |
|------|------|------|
| Hailuo 2.3 | 電影感，最高 1080p，最長 10 秒 | $0.08 / 秒 |
| Hailuo 02 | text-to-video + image-to-video | 按秒計費 |
| Hailuo 2.3 Fast | 快速版，適合批量生成 | 較低 |

可透過以下第三方平台取得 API：PiAPI、fal.ai、Atlas Cloud、OpenRouter

### 語音：Speech 2.8（T2A 系列）
- 超擬人 TTS，最長 10,000 字元輸入
- 支援聲音克隆（Voice Cloning）

### 音樂：MiniMax Music 2.6
- 含人聲 + 樂器編曲的完整歌曲
- 成本：$0.15 / 5 分鐘

---

## Token Plan 現況

### 用戶已有 Token Plan
用戶的 `my-minimax-mcp@1.4.0+` CLAUDE.md 標注「user's Token Plan is all-M2.7」，代表**已訂閱 Token Plan**。

### Token Plan 包含什麼
Token Plan（2026-03 推出）是全球首個全模態訂閱，**文字、語音、音樂、影片、圖片共用同一 token 池**：

| 方案 | 月費 | 適用場景 |
|------|------|---------|
| Starter | $20 / 月 | 個人專案、原型 |
| Standard | $50 / 月 | 日常 coding + 多模態工作 |
| Pro | $120 / 月 | 重度 Agent 工作流 |

### 關鍵問題
**Token Plan 配額已有，但缺少呼叫入口。**

`my-minimax-mcp@1.4.0+` 目前只暴露 agent/coding 工具：
- `minimax_agent_task`
- `minimax_chat`
- `minimax_web_search`
- `minimax_generate_code`
- `minimax_plan`
- `minimax_understand_image`
- `minimax_cost_report`
- `minimax_session_tracker`

**沒有**影片、音樂、語音生成工具。

---

## 建議的擴充方向

### 選項 A：加裝官方 MiniMax MCP（最快）

```bash
# 在 ~/.claude/settings.json 加入
{
  "mcpServers": {
    "minimax-official": {
      "command": "npx",
      "args": ["-y", "@minimax-ai/mcp"],
      "env": {
        "MINIMAX_API_KEY": "your_key"
      }
    }
  }
}
```

官方 MCP repo：https://github.com/minimax-ai/minimax-mcp  
支援：TTS、Image generation、**Video generation（Hailuo）**

### 選項 B：在 my-minimax-mcp 內新增影音工具

在現有的 `my-minimax-mcp` 專案中新增工具，讓影音生成與現有 agent 工具統一管理：

建議新增的工具：
- `minimax_generate_video` — 呼叫 Hailuo API，返回影片 URL
- `minimax_generate_music` — 呼叫 Music 2.6 API
- `minimax_tts` — 呼叫 Speech 2.8 API

### 選項 C：Claude Code 腳本直接呼叫 API

不改 MCP，由 Claude Code 生成 Python/Node 腳本，直接使用 Token Plan API Key 呼叫影片 API。

---

## Hailuo API 基本流程（非同步）

```python
import requests, time

API_KEY = "your_minimax_api_key"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# 1. 提交影片生成任務
res = requests.post(
    "https://api.minimax.io/v1/video/generation",
    headers=HEADERS,
    json={
        "prompt": "A cat walking on a beach at sunset",
        "duration": 6,      # 秒數（最長 10 秒）
        "resolution": "1080p",
        "model": "hailuo-2.3"
    }
)
task_id = res.json()["task_id"]

# 2. 輪詢結果（約等 1–3 分鐘）
while True:
    result = requests.get(
        f"https://api.minimax.io/v1/tasks/{task_id}",
        headers=HEADERS
    ).json()
    if result["status"] == "completed":
        video_url = result["video_url"]
        break
    time.sleep(10)

# 3. 下載影片（連結 24 小時有效）
video = requests.get(video_url).content
with open("output.mp4", "wb") as f:
    f.write(video)
```

---

## 完整短影音流水線（目標架構）

```
Claude Code orchestration
  ├── minimax_tts          → 旁白音訊 (.mp3)
  ├── minimax_generate_music → 背景音樂 (.mp3)
  ├── minimax_generate_video → 影像素材 (.mp4 × N 段)
  └── FFmpeg 合成
        → 拼接多段影片
        → 混音（旁白 + 背景樂）
        → 壓縮輸出 → final.mp4
```

---

## 待決策事項

1. **選哪個選項？**（A 官方 MCP / B 擴充 my-minimax-mcp / C 腳本）
   - 建議 B，統一在現有 MCP 管理，符合 CLAUDE.md 的使用習慣
2. **Token Plan 的影音額度是否足夠？** 建議先查 `minimax_cost_report` 確認剩餘配額
3. **影片 API endpoint 確認**：需查 MiniMax 官方文件確認 Hailuo 2.3 的正確 endpoint（上方腳本為示意，需驗證）

---

## 參考資料

- [MiniMax 官方 MCP](https://github.com/minimax-ai/minimax-mcp)
- [Token Plan 定價文件](https://platform.minimax.io/docs/guides/pricing-token-plan)
- [Hailuo 2.3 API Guide — Atlas Cloud](https://www.atlascloud.ai/blog/guides/hailuo-2-3-api-guide)
- [MiniMax API Pricing Jun 2026](https://developer.puter.com/tutorials/minimax-api-pricing/)
- [How to Generate AI Videos in Claude Code](https://ryandoser.com/claude-code-ai-video/)
