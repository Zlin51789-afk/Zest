import path from 'path';
import {
  buildDocumentContext,
  buildProgressContext,
  buildQaContext,
  buildJfm9FolderCatalog,
  documentDownloadUrl,
  isJfm9FolderQuery,
  matchDocuments,
  SYSTEM_PROMPTS,
} from './context.js';
import { chatWithOpenClaw, isOpenClawConfigured } from './openclaw.js';

function sessionUser(agentId) {
  return `web2:${agentId}`;
}

function toHistory(messages = []) {
  return messages
    .slice(-16)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.text || '',
    }));
}

async function runOpenClawAgent(agentId, message, { history = [] } = {}) {
  let systemPrompt;
  let attachments = [];

  switch (agentId) {
    case 'document': {
      const ctx = await buildDocumentContext();
      systemPrompt = SYSTEM_PROMPTS.document(ctx);
      const docs = await matchDocuments(message, ctx.files);
      if (docs.length > 0) {
        attachments = docs.map((doc) => ({
          type: 'file',
          name: path.basename(doc),
          path: doc,
          url: documentDownloadUrl(doc),
        }));

        if (isJfm9FolderQuery(message)) {
          return {
            text: buildJfm9FolderCatalog(docs),
            attachments,
          };
        }

        let aiText = '';
        try {
          aiText = await chatWithOpenClaw({
            sessionUser: sessionUser(agentId),
            systemPrompt,
            history: toHistory(history),
            message,
          });
        } catch {
          aiText = '';
        }
        const names = docs.map((d) => path.basename(d)).join('、');
        const downloadHint =
          docs.length === 1
            ? `已找到文档 **${names}**，请点击下方 **↓ 下载** 按钮获取文件。\n\n路径：\`${docs[0]}\``
            : `已找到 **${docs.length}** 个文档，请分别点击下方按钮下载：\n${names}`;
        const text =
          aiText && !/未找到|无法找到|不存在|抱歉/i.test(aiText)
            ? `${downloadHint}\n\n${aiText}`
            : downloadHint;
        return { text, attachments };
      }
      break;
    }
    case 'qa': {
      const ctx = await buildQaContext();
      systemPrompt = SYSTEM_PROMPTS.qa(ctx);
      break;
    }
    case 'progress': {
      const ctx = await buildProgressContext(message);
      systemPrompt = SYSTEM_PROMPTS.progress(ctx);
      break;
    }
    case 'general':
    default:
      systemPrompt = SYSTEM_PROMPTS.general();
  }

  const text = await chatWithOpenClaw({
    sessionUser: sessionUser(agentId),
    systemPrompt,
    history: toHistory(history),
    message,
  });

  return { text, attachments };
}

export async function handleAgent(agentId, message, options = {}) {
  if (!isOpenClawConfigured()) {
    throw new Error(
      'OpenClaw 未配置。请启动 Gateway 并设置 OPENCLAW_GATEWAY_TOKEN，或确保 ~/.openclaw/openclaw.json 存在。'
    );
  }

  return runOpenClawAgent(agentId, message, options);
}

export const AGENTS = {
  document: {
    id: 'document',
    name: '文档下载',
    subtitle: 'OpenClaw · 按名称获取文件',
  },
  qa: {
    id: 'qa',
    name: '智能问答',
    subtitle: 'OpenClaw · 本地知识库',
  },
  progress: {
    id: 'progress',
    name: '进度查询',
    subtitle: 'OpenClaw · 项目状态',
  },
  general: {
    id: 'general',
    name: '其他功能',
    subtitle: 'OpenClaw · 自由对话',
  },
};
