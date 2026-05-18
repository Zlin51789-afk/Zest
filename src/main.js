const ICONS = {
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg>`,
  qa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>`,
  progress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  general: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
};

const HINTS = {
  document: '例如：请提供产品白皮书 / README',
  qa: '例如：价格是多少？技术架构如何部署？',
  progress: '例如：查询 Alpha 项目进度',
  general: '自由输入，与通用智能体对话',
};

const WELCOME = {
  document: {
    title: '文档下载',
    desc: '可下载单个或多个文档，支持按系列、分类批量获取。',
    chips: ['JFM9系列FPGA', '所有技术手册', 'JFM9KU6P技术手册和引脚说明'],
  },
  qa: {
    title: '智能问答',
    desc: '基于本地知识库，为您解答价格、技术与服务问题。',
    chips: ['价格是多少', '技术架构', '交付周期'],
  },
  progress: {
    title: '进度查询',
    desc: '我将读取项目状态文件，为您汇总最新进度。',
    chips: ['Alpha 项目进度', '查看里程碑'],
  },
  general: {
    title: '其他功能',
    desc: '通用 AI 入口，支持自由对话与能力扩展。',
    chips: ['你好', '帮我整理需求'],
  },
};

const sessions = {};
let agents = [];
let currentAgentId = null;
let pendingFiles = [];

const $ = (sel) => document.querySelector(sel);

const agentNav = $('#agentNav');
const messagesEl = $('#messages');
const agentTitle = $('#agentTitle');
const agentDesc = $('#agentDesc');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');
const attachBtn = $('#attachBtn');
const fileInput = $('#fileInput');
const composerHint = $('#composerHint');

function getSession(agentId) {
  if (!sessions[agentId]) {
    sessions[agentId] = { messages: [] };
  }
  return sessions[agentId];
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderMarkdownLight(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function renderWelcome(agentId) {
  const w = WELCOME[agentId];
  if (!w) return '';

  const chips = w.chips
    .map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`)
    .join('');

  return `
    <div class="welcome">
      <h3>${w.title}</h3>
      <p>${w.desc}</p>
      <div class="chips">${chips}</div>
    </div>`;
}

function renderMessage(msg) {
  const isUser = msg.role === 'user';
  const avatar = isUser ? '我' : 'AI';
  const files = (msg.attachments || [])
    .map((a) => {
      if (a.type === 'file' && a.url) {
        return `<a class="file-pill download" href="${a.url}" download="${a.name}" target="_blank" rel="noopener">↓ ${a.name}</a>`;
      }
      return `<span class="file-pill">${a.name}</span>`;
    })
    .join('');

  const filesHtml = files ? `<div class="message-files">${files}</div>` : '';

  return `
    <article class="message ${msg.role}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">
        <div class="message-bubble">${renderMarkdownLight(msg.text)}</div>
        ${filesHtml}
        <time class="message-time">${formatTime(msg.timestamp)}</time>
      </div>
    </article>`;
}

function renderMessages(agentId) {
  const session = getSession(agentId);
  if (session.messages.length === 0) {
    messagesEl.innerHTML = renderWelcome(agentId);
    messagesEl.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        messageInput.value = btn.dataset.chip;
        messageInput.dispatchEvent(new Event('input'));
        sendMessage();
      });
    });
  } else {
    messagesEl.innerHTML = session.messages.map(renderMessage).join('');
  }
  scrollToBottom();
}

function renderAgentNav() {
  agentNav.innerHTML = agents
    .map(
      (a) => `
    <button
      type="button"
      class="agent-item${a.id === currentAgentId ? ' active' : ''}"
      role="tab"
      aria-selected="${a.id === currentAgentId}"
      data-id="${a.id}"
    >
      <span class="agent-icon">${ICONS[a.id] || ICONS.general}</span>
      <span class="agent-meta">
        <span class="agent-name">${a.name}</span>
        <span class="agent-subtitle">${a.subtitle}</span>
      </span>
    </button>`
    )
    .join('');

  agentNav.querySelectorAll('.agent-item').forEach((btn) => {
    btn.addEventListener('click', () => switchAgent(btn.dataset.id));
  });
}

function switchAgent(agentId) {
  if (currentAgentId === agentId) return;
  currentAgentId = agentId;

  const agent = agents.find((a) => a.id === agentId);
  agentTitle.textContent = agent?.name || '—';
  agentDesc.textContent = agent?.subtitle || '';
  composerHint.textContent = HINTS[agentId] || '';

  renderAgentNav();
  renderMessages(agentId);
  messageInput.focus();
}

function showTyping() {
  const el = document.createElement('article');
  el.className = 'message assistant typing-msg';
  el.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-body">
      <div class="message-bubble typing"><span></span><span></span><span></span></div>
    </div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function removeTyping(el) {
  el?.remove();
}

function buildHistory(session) {
  return session.messages.map((m) => ({
    role: m.role,
    content: m.text,
  }));
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentAgentId) return;

  const session = getSession(currentAgentId);
  const userMsg = {
    role: 'user',
    text,
    attachments: pendingFiles.map((f) => ({ name: f.name, type: 'upload' })),
    timestamp: Date.now(),
  };
  session.messages.push(userMsg);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;
  pendingFiles = [];
  updatePendingFilesUI();
  renderMessages(currentAgentId);

  const typingEl = showTyping();
  const history = buildHistory(session).slice(0, -1);

  try {
    const res = await fetch(`/api/chat/${currentAgentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || '请求失败');
    }

    session.messages.push({
      role: 'assistant',
      text: data.text,
      attachments: data.attachments || [],
      timestamp: data.timestamp || Date.now(),
    });
  } catch (err) {
    session.messages.push({
      role: 'assistant',
      text: `OpenClaw 暂时不可用：${err.message || '未知错误'}\n\n请确认 Gateway 已启动（openclaw gateway status），并已启用 chatCompletions 端点。`,
      attachments: [],
      timestamp: Date.now(),
    });
  }

  removeTyping(typingEl);
  renderMessages(currentAgentId);
}

async function refreshOpenClawStatus() {
  const footer = document.getElementById('openclawStatus');
  const textEl = footer?.querySelector('.status-text');
  if (!footer || !textEl) return;

  try {
    const res = await fetch('/api/openclaw/status');
    const data = await res.json();
    footer.classList.remove('connected', 'error');

    if (data.ok) {
      footer.classList.add('connected');
      textEl.textContent = 'OpenClaw 已连接';
    } else {
      footer.classList.add('error');
      textEl.textContent = data.error || 'OpenClaw 未连接';
    }
  } catch {
    footer.classList.add('error');
    textEl.textContent = '后端服务未启动';
  }
}

function updatePendingFilesUI() {
  let bar = document.querySelector('.pending-files');
  if (!pendingFiles.length) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'pending-files';
    document.querySelector('.composer').before(bar);
  }
  bar.innerHTML = pendingFiles
    .map((f) => `<span class="pending-file">${f.name}</span>`)
    .join('');
}

async function loadAgents() {
  try {
    const res = await fetch('/api/agents');
    agents = await res.json();
  } catch {
    agents = [
      { id: 'document', name: '文档下载', subtitle: '按名称获取文件' },
      { id: 'qa', name: '智能问答', subtitle: '本地知识库检索' },
      { id: 'progress', name: '进度查询', subtitle: '读取项目状态' },
      { id: 'general', name: '其他功能', subtitle: '自由对话与扩展' },
    ];
  }

  renderAgentNav();
  if (agents.length) switchAgent(agents[0].id);
}

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  sendBtn.disabled = !messageInput.value.trim();
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files];
  fileInput.value = '';

  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    try {
      await fetch('/api/upload', { method: 'POST', body: form });
      pendingFiles.push(file);
    } catch {
      pendingFiles.push(file);
    }
  }
  updatePendingFilesUI();
});

loadAgents();
refreshOpenClawStatus();
setInterval(refreshOpenClawStatus, 15000);
