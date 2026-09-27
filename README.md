# 社會議題辯論拆解儀 | DebateLens

輸入任何社會爭議議題，AI 自動拆解出**正方論點、反方論點、雙方盲點與共識結語**，幫助你用結構化思辨看透公共議題，而不是只看到單方面立場。

## 功能特色

- **一鍵 AI 拆解**：輸入議題後自動呼叫 AI，產生正反雙方各 3 個附證據的論證、潛在盲點，以及具體的折衷政策建議。
- **熱門議題內建資料**：數個預設議題（延後上學、必修體育、電子教科書等）內建高品質分析，離線也能立即檢視。
- **離線備援機制**：若 AI 服務無法使用，自動降級為「複製提示詞 → 貼到任一免費 AI → 貼回結果」的手動模式，不會卡死。
- **繁體中文輸出**：以台灣用語與社會脈絡進行分析。
- **回應式設計**：桌面與手機皆可使用。

## 技術架構

- 前端：單一 `index.html`，原生 HTML / CSS / JavaScript，無建置流程、無前端框架。
- 後端：Vercel Edge Function（`api/analyze.js`），負責呼叫 AI 模型並把回覆解析為結構化 JSON，避免 API 金鑰暴露在瀏覽器。
- AI 模型：預設使用 [Groq](https://groq.com) 免費額度的 OpenAI 相容介面（`qwen/qwen3.8-27b`，通義千問，中文表現佳），可透過環境變數切換其他相容服務。

## 專案結構

```
debate-lens/
├── index.html        # 前端單頁應用
├── api/
│   └── analyze.js    # Vercel Edge Function：議題 → 結構化辯論分析
├── package.json
└── README.md
```

## 本機使用

直接用瀏覽器打開 `index.html` 即可。本機版預設會呼叫已部署的線上 API；若要改用自己的後端，可在 `index.html` 中調整 `DEBATE_API_BASE`。

## 自行部署（Vercel，免費）

1. 把本專案匯入 [Vercel](https://vercel.com)（連結 GitHub 倉庫即可於每次 push 自動部署）。
2. 在 Vercel 專案設定加入環境變數：
   - `LLM_API_KEY`：你的 Groq API 金鑰（於 https://console.groq.com/keys 免費申請）。
   - （選用）`LLM_ENDPOINT`：OpenAI 相容的 chat completions 端點。
   - （選用）`MODEL_NAME`：模型名稱，預設 `qwen/qwen3.8-27b`。
3. 部署後，前端以同源路徑 `/api/analyze` 呼叫後端。

## 免費額度提醒

Groq 免費方案有每日呼叫次數上限，適合個人使用與教學演示；若大量使用，請參考 Groq 官方的額度說明或更換供應商。

---

本工具僅提供結構化思辨參考，不代表任何立場。
