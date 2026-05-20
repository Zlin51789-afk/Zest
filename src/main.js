import { authFetch, initAuth, logout } from './auth.js';

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

/** \u8fdb\u884c\u4e2d\u7684\u804a\u5929\u8bf7\u6c42\uff08\u5207\u6362\u667a\u80fd\u4f53\u6216\u91cd\u65b0\u53d1\u9001\u65f6\u4e2d\u6b62\uff09 */
let activeChatController = null;
/** \u4e0e activeChatController \u5bf9\u5e94\u7684 agent\uff0c\u7528\u4e8e\u5207\u6362\u65f6\u64a4\u9500\u672a\u5b8c\u6210\u7684\u7528\u6237\u6d88\u606f */
let pendingChatAgentId = null;
let chatSendGeneration = 0;

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

  if (activeChatController && pendingChatAgentId) {
    const sess = getSession(pendingChatAgentId);
    const last = sess.messages[sess.messages.length - 1];
    if (last?.role === 'user') {
      sess.messages.pop();
    }
    try {
      activeChatController.abort();
    } catch {
      /* ignore */
    }
    activeChatController = null;
    pendingChatAgentId = null;
  }

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

function formatChatError(err) {
  let raw = err?.message ? String(err.message) : '未知错误';
  // 登录 / 会话失效（authFetch 抛出）不再套额外说明
  if (/登录|过期|失效|SESSION|设备|账号/i.test(raw)) {
    return raw;
  }
  // Kimi \u539f\u6587\u62a5\u9519\uff08\u672a\u90e8\u7f72\u65b0\u540e\u7aef\u65f6\u4ecd\u53ef\u80fd\u51fa\u73b0\uff09
  if (
    /overloaded|rate limit|try again later|\u7e41\u5fd9|\u9650\u6d41/i.test(raw)
  ) {
    return '暂时无法获取回复：Kimi（Moonshot）服务繁忙或限流，请稍后再试。';
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal) {
    return `暂时无法获取回复：${raw}\n\n若使用本机 OpenClaw，请确认 Gateway 已启动（openclaw gateway status），并已启用 chatCompletions 端点。`;
  }
  // 线上错误由服务端写明原因（含 hint）；不再追加固定「检查 Vercel」长段
  return `暂时无法获取回复：${raw}`;
}

function isChatAbortError(err) {
  const n = err?.name;
  return n === 'AbortError' || n === 'TimeoutError';
}

function buildChatFetchSignal(userController) {
  const u = userController.signal;
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return u;
  }
  const t = AbortSignal.timeout(95_000);
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([u, t]);
  }
  return u;
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentAgentId) return;

  if (activeChatController) {
    if (pendingChatAgentId === currentAgentId) {
      const prevSess = getSession(currentAgentId);
      const prevLast = prevSess.messages[prevSess.messages.length - 1];
      if (prevLast?.role === 'user') {
        prevSess.messages.pop();
      }
    }
    try {
      activeChatController.abort();
    } catch {
      /* ignore */
    }
    activeChatController = null;
    pendingChatAgentId = null;
  }

  chatSendGeneration += 1;
  const sendId = chatSendGeneration;
  const agentIdForRequest = currentAgentId;
  const session = getSession(agentIdForRequest);

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

  const userAc = new AbortController();
  activeChatController = userAc;
  pendingChatAgentId = agentIdForRequest;

  let chatTimeoutId;
  if (
    typeof AbortSignal === 'undefined' ||
    typeof AbortSignal.timeout !== 'function' ||
    typeof AbortSignal.any !== 'function'
  ) {
    chatTimeoutId = setTimeout(() => {
      try {
        userAc.abort();
      } catch {
        /* ignore */
      }
    }, 95_000);
  }

  try {
    const signal = buildChatFetchSignal(userAc);
    const res = await authFetch(`/api/chat/${agentIdForRequest}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
      signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const parts = [data.error, data.hint].filter(Boolean);
      throw new Error(parts.join('\n') || '\u8bf7\u6c42\u5931\u8d25');
    }

    if (sendId !== chatSendGeneration) {
      return;
    }

    session.messages.push({
      role: 'assistant',
      text: data.text,
      attachments: data.attachments || [],
      timestamp: data.timestamp || Date.now(),
    });
  } catch (err) {
    if (sendId !== chatSendGeneration) {
      return;
    }

    if (isChatAbortError(err)) {
      const last = session.messages[session.messages.length - 1];
      if (last?.role === 'user') {
        session.messages.push({
          role: 'assistant',
          text:
            '\u8bf7\u6c42\u8d85\u65f6\uff0890 \u79d2\uff09\u6216\u88ab\u4e2d\u65ad\u3002\u8bf7\u7f29\u77ed\u95ee\u9898\u6216\u7a0d\u540e\u518d\u8bd5\u3002',
          attachments: [],
          timestamp: Date.now(),
        });
      }
    } else {
      session.messages.push({
        role: 'assistant',
        text: formatChatError(err),
        attachments: [],
        timestamp: Date.now(),
      });
    }
  } finally {
    if (chatTimeoutId) clearTimeout(chatTimeoutId);
    if (activeChatController === userAc) {
      activeChatController = null;
      pendingChatAgentId = null;
    }
    removeTyping(typingEl);
    if (sendId === chatSendGeneration) {
      sendBtn.disabled = !messageInput.value.trim();
      renderMessages(currentAgentId);
    }
  }
}

async function refreshOpenClawStatus() {
  const footer = document.getElementById('openclawStatus');
  const textEl = footer?.querySelector('.status-text');
  if (!footer || !textEl) return;

  try {
    const res = await authFetch('/api/openclaw/status');
    const data = await res.json();
    footer.classList.remove('connected', 'error');

    if (data.ok) {
      footer.classList.add('connected');
      textEl.textContent =
        data.backend === 'moonshot'
          ? `Kimi 已连接 (${data.model || 'moonshot'})`
          : 'OpenClaw 已连接';
    } else {
      footer.classList.add('error');
      textEl.textContent = data.error || 'AI 未连接';
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
    const res = await authFetch('/api/agents');
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
      await authFetch('/api/upload', { method: 'POST', body: form });
      pendingFiles.push(file);
    } catch {
      pendingFiles.push(file);
    }
  }
  updatePendingFilesUI();
});

let userMenuInitialized = false;

function initUserMenu() {
  if (userMenuInitialized) return;
  userMenuInitialized = true;

  const btn = document.getElementById('userAvatarBtn');
  const menu = document.getElementById('userMenu');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!btn || !menu || !logoutBtn) return;

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function toggleMenu() {
    if (menu.hidden) openMenu();
    else closeMenu();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  logoutBtn.addEventListener('click', async () => {
    closeMenu();
    await logout();
  });

  document.addEventListener('click', (e) => {
    if (btn.contains(e.target) || menu.contains(e.target)) return;
    closeMenu();
  });
}

initAuth(() => {
  initUserMenu();
  loadAgents();
  refreshOpenClawStatus();
  setInterval(refreshOpenClawStatus, 15000);
});
