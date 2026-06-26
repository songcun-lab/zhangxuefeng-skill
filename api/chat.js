/**
 * 张雪峰志愿助手 · 后端代理
 * Vercel Serverless Function
 * 接入 DeepSeek API，对外屏蔽 API Key
 */

// ===== 简单限流（基于 IP，内存级，重启清零）=====
const rateMap = new Map();
const RATE_LIMIT = 20;        // 每个 IP 每小时最多 20 次请求
const RATE_WINDOW = 60 * 60 * 1000; // 1小时窗口

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateMap.get(ip);

  if (!record || now - record.windowStart > RATE_WINDOW) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// ===== 主处理函数 =====
export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  // 获取客户端 IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  // 限流检查
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: '请求太频繁，每小时最多咨询20次，请稍后再试。'
    });
  }

  // 解析请求体
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: '请求格式错误' });
  }

  const { messages } = body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '消息内容不能为空' });
  }

  // 消息长度限制（防止滥用）
  if (messages.length > 40) {
    return res.status(400).json({ error: '对话轮数过多，请刷新页面重新开始' });
  }

  // 获取 DeepSeek API Key（从 Vercel 环境变量读取）
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY 未配置');
    return res.status(500).json({ error: '服务配置错误，请联系管理员' });
  }

  // 调用 DeepSeek API
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.85,
        max_tokens: 1200,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);

      if (response.status === 429) {
        return res.status(429).json({ error: '当前访问人数较多，请稍等片刻再试。' });
      }
      if (response.status === 401) {
        return res.status(500).json({ error: '服务配置错误，请联系管理员' });
      }
      return res.status(500).json({ error: 'AI 服务暂时不可用，请稍后再试' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: 'AI 返回内容为空，请重试' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: '网络请求失败，请稍后再试' });
  }
}
