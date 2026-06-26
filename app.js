/**
 * 张雪峰志愿填报助手 · 前端逻辑
 * 调用 /api/chat 后端代理，用户无需任何配置
 */

// ===== 状态 =====
const state = {
  messages: [],
  isLoading: false
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  state.messages = [];
  document.getElementById('userInput').focus();
});

// ===== 快捷问题 =====
function quickAsk(text) {
  const textarea = document.getElementById('userInput');
  textarea.value = text;
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

  textarea.value = '';
  appendMessage('user', userText);
  state.messages.push({ role: 'user', content: userText });

  setLoading(true);
  const typingId = appendTyping();

  try {
    const reply = await callBackend(state.messages);
    removeTyping(typingId);
    appendMessage('ai', reply);
    state.messages.push({ role: 'assistant', content: reply });

    // 保留最近 20 轮对话历史
    if (state.messages.length > 40) {
      state.messages = state.messages.slice(-40);
    }
  } catch (err) {
    removeTyping(typingId);
    appendMessage('ai', err.message || '出现错误，请稍后重试。');
  } finally {
    setLoading(false);
  }
}

// ===== 调用后端代理 =====
async function callBackend(messages) {
  // 构建带 system prompt 的消息列表
  const fullMessages = [
    { role: 'system', content: getSystemPrompt() },
    ...messages
  ];

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: fullMessages })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}），请稍后再试`);
  }

  return data.reply;
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
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
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
