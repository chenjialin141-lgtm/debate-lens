// DebateLens — 辯論分析 API（Vercel Edge Function）
// 輸入社會議題，AI 回傳正反方論點結構化 JSON
// 環境變數：LLM_API_KEY（Groq 免費申請）

export const config = { runtime: 'edge' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

const SYS_PROMPT = `你是一位社會議題辯論分析專家，專門做結構化的正反方論點拆解。
你的分析必須：
1. 基於事實、數據、學術研究或國際案例，不編造數字
2. 正反雙方各給 3 個論證，每個論證 50-80 字，附證據類型標籤
3. 盲點要真正點出該方論述的弱點，不寫空話
4. 共識結語要給具體的折衷政策建議，3-5 句
5. 全部使用繁體中文（台灣用語）
只回覆純 JSON，不要有 markdown 標記或任何額外文字。`;

function buildUserPrompt(topic) {
  return `請針對以下議題進行結構化正反方論點拆解：

議題：「${topic}」

回覆以下 JSON 格式：
{
  "affirmative": {
    "coreClaim": "正方核心主張（2-3句話）",
    "arguments": [
      {"text": "論證1（含具體事實、數據或案例，50-80字）", "evidence": "證據類型（4-6字）"},
      {"text": "論證2", "evidence": "證據類型"},
      {"text": "論證3", "evidence": "證據類型"}
    ],
    "blindspot": "正方論述的潛在盲點（1-2句話）"
  },
  "negative": {
    "coreClaim": "反方核心主張（2-3句話）",
    "arguments": [
      {"text": "論證1（含具體事實、數據或案例，50-80字）", "evidence": "證據類型（4-6字）"},
      {"text": "論證2", "evidence": "證據類型"},
      {"text": "論證3", "evidence": "證據類型"}
    ],
    "blindspot": "反方論述的潛在盲點（1-2句話）"
  },
  "consensus": "思辨共識結語：雙方交集、折衷建議、務實行動方向（3-5句話）"
}`;
}

// 從 LLM 回覆中提取 JSON
function extractJSON(text) {
  if (!text) return null;
  // 直接解析
  try { return JSON.parse(text.trim()); } catch (_) {}
  // markdown 程式碼區塊
  const m1 = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch (_) {} }
  // 找含 affirmative/negative/consensus 的 JSON
  const m2 = text.match(/\{[\s\S]*"affirmative"[\s\S]*"negative"[\s\S]*"consensus"[\s\S]*\}/);
  if (m2) {
    try { return JSON.parse(m2[0]); } catch (_) {
      const fixed = m2[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try { return JSON.parse(fixed); } catch (_) {}
    }
  }
  // 逐括號配對
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const c = JSON.parse(text.substring(start, i + 1));
          if (c.affirmative && c.negative) return c;
        } catch (_) {}
      }
    }
  }
  return null;
}

function validate(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.affirmative || !data.negative) return false;
  if (!data.affirmative.coreClaim || !data.negative.coreClaim) return false;
  if (!Array.isArray(data.affirmative.arguments) || !Array.isArray(data.negative.arguments)) return false;
  if (data.affirmative.arguments.length < 1 || data.negative.arguments.length < 1) return false;
  return true;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }});
  }
  if (req.method !== 'POST') return json({ error: '僅接受 POST 請求' }, 405);
  if (!process.env.LLM_API_KEY) return json({ error: '後端尚未設定 LLM_API_KEY' }, 500);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: '請求格式錯誤' }, 400); }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic || topic.length < 2) return json({ error: '請輸入至少 2 個字的議題' }, 400);
  if (topic.length > 200) return json({ error: '議題太長，請控制在 200 字以內' }, 400);

  const endpoint = process.env.LLM_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
  const model = process.env.MODEL_NAME || 'qwen/qwen3.8-27b';

  try {
    const llmRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.LLM_API_KEY
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.5,
        max_tokens: 2500,
        messages: [
          { role: 'system', content: SYS_PROMPT },
          { role: 'user', content: buildUserPrompt(topic) }
        ]
      })
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => '');
      return json({ error: 'AI 服務回應錯誤（' + llmRes.status + '）：' + errText.slice(0, 200) }, 502);
    }

    const data = await llmRes.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = extractJSON(content);

    if (!validate(parsed)) {
      return json({ error: 'AI 回覆格式無法解析，請重試一次', raw: content.slice(0, 300) }, 502);
    }

    // 補齊缺失欄位
    if (!parsed.consensus) parsed.consensus = '雙方各有合理關切，建議透過漸進式試點與充分社會對話，尋找兼顧各方利益的平衡方案。';
    if (!parsed.affirmative.blindspot) parsed.affirmative.blindspot = '正方論述仍需更多實證支持與配套措施考量。';
    if (!parsed.negative.blindspot) parsed.negative.blindspot = '反方論述仍需更多實證支持與配套措施考量。';
    [parsed.affirmative, parsed.negative].forEach(side => {
      side.arguments.forEach(arg => {
        if (!arg.evidence) arg.evidence = '論證依據';
      });
    });

    return json({ ok: true, result: parsed });
  } catch (e) {
    return json({ error: 'AI 服務暫時無法回應：' + e.message }, 502);
  }
}
