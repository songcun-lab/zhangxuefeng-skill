/**
 * 张雪峰志愿填报助手 · 主逻辑
 * 纯前端，调用 OpenAI API，API Key 存储在 localStorage
 */

// ===== 状态管理 =====
const state = {
  apiKey: '',
  messages: [],   // 对话历史（不含 system prompt）
  isLoading: false
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 读取已保存的 API Key
  const saved = localStorage.getItem('zxf_openai_key');
  if (saved) {
    state.apiKey = saved;
    document.getElementById('apiKey').value = saved;
    setApiStatus('ok', '✅ API Key 已配置，可以开始咨询');
  }

  // 初始化欢迎消息（已在 HTML 中，不重复添加）
  state.messages = [];
});

// ===== API Key 管理 =====
function saveApiKey() {
  const input = document.getElementById('apiKey').value.trim();
  if (!input) {
    setApiStatus('err', '❌ 请输入有效的 API Key');
    return;
  }
  if (!input.startsWith('sk-')) {
    setApiStatus('err', '❌ API Key 格式不对，应以 sk- 开头');
    return;
  }
  state.apiKey = input;
  localStorage.setItem('zxf_openai_key', input);
  setApiStatus('ok', '✅ API Key 已保存，可以开始咨询');
}

function setApiStatus(type, msg) {
  const el = document.getElementById('apiStatus');
  el.textContent = msg;
  el.className = 'api-hint ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
}

// ===== 快捷问题 =====
function quickAsk(text) {
  const textarea = document.getElementById('userInput');
  textarea.value = text;
  // 滚动到对话区
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => textarea.focus(), 400);
}

// ===== 键盘快捷键 =====
function handleKeydown(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }
}

// ===== 发送消息 =====
async function sendMessage() {
  if (state.isLoading) return;

  const textarea = document.getElementById('userInput');
  const userText = textarea.value.trim();

  if (!userText) {
    textarea.focus();
    return;
  }

  if (!state.apiKey) {
    setApiStatus('err', '❌ 请先填入 OpenAI API Key 并保存');
    document.getElementById('api-config').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // 清空输入框
  textarea.value = '';

  // 添加用户消息到界面
  appendMessage('user', userText);

  // 添加到历史
  state.messages.push({ role: 'user', content: userText });

  // 显示 loading
  setLoading(true);
  const typingId = appendTyping();

  try {
    const reply = await callOpenAI(state.messages);

    // 移除 typing indicator
    removeTyping(typingId);

    // 添加 AI 回复
    appendMessage('ai', reply);
    state.messages.push({ role: 'assistant', content: reply });

    // 限制历史长度（保留最近 20 轮）
    if (state.messages.length > 40) {
      state.messages = state.messages.slice(-40);
    }

  } catch (err) {
    removeTyping(typingId);
    const errMsg = formatError(err);
    appendMessage('ai', errMsg);
  } finally {
    setLoading(false);
  }
}

// ===== 调用 OpenAI API =====
async function callOpenAI(messages) {
  const payload = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt() },
      ...messages
    ],
    temperature: 0.85,
    max_tokens: 1200,
    stream: false
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { status: response.status, data: errData };
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ===== 错误处理 =====
function formatError(err) {
  if (err.status === 401) {
    return '❌ API Key 无效或已过期，请重新填入正确的 OpenAI API Key。';
  }
  if (err.status === 429) {
    return '⏳ 请求太频繁或余额不足，稍等一会儿再试。';
  }
  if (err.status === 500) {
    return '❌ OpenAI 服务器出错，稍后再试。';
  }
  if (err.message && err.message.includes('fetch')) {
    return '❌ 网络连接失败，请检查网络或 VPN 设置（OpenAI API 需要可访问外网）。';
  }
  return `❌ 出现错误：${err.message || JSON.stringify(err.data || err)}`;
}

// ===== DOM 操作 =====
function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const isAI = role === 'ai';

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg msg-${isAI ? 'ai' : 'user'}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = isAI ? renderMarkdown(text) : escapeHtml(text);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = isAI ? '张雪峰 AI' : '你';

  msgDiv.appendChild(bubble);
  msgDiv.appendChild(time);
  container.appendChild(msgDiv);

  scrollToBottom(container);
  return msgDiv;
}

function appendTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg msg-ai typing-indicator';
  msgDiv.id = id;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;

  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);
  scrollToBottom(container);
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function setLoading(loading) {
  state.isLoading = loading;
  const btn = document.getElementById('sendBtn');
  const btnText = document.getElementById('sendBtnText');
  const btnLoading = document.getElementById('sendBtnLoading');
  const textarea = document.getElementById('userInput');

  btn.disabled = loading;
  textarea.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoading.style.display = loading ? 'inline' : 'none';
}

// ===== 简易 Markdown 渲染 =====
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // 换行
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
