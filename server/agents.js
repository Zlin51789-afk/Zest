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
import { chatWithAI } from './llm.js';
import { isOpenClawConfigured } from './openclaw.js';

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
          aiText = await chatWithAI({
            sessionUser: sessionUser(agentId),
            systemPrompt,
            history: toHistory(history),
            message,
          });
        } catch {
          aiText = '';
        }
        const trimmed = typeof aiText === 'string' ? aiText.trim() : '';
        const hasUsefulAi =
          trimmed.length > 0 && !/未找到|无法找到|不存在|抱歉/i.test(trimmed);

        if (hasUsefulAi) {
          return { text: trimmed, attachments };
        }

        const fallback =
          docs.length === 1
            ? `请点击下方 **↓ 下载** 获取 \`${path.basename(docs[0])}\`。`
            : '已在下方附上可下载文件，请逐一点击 **↓ 下载** 获取。';
        return { text: fallback, attachments };
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

  const text = await chatWithAI({
    sessionUser: sessionUser(agentId),
    systemPrompt,
    history: toHistory(history),
    message,
  });

  return { text, attachments };
}

export async function handleAgent(agentId, message, options = {}) {
  const hasMoonshot = Boolean(process.env.MOONSHOT_API_KEY);
  if (!isOpenClawConfigured() && !hasMoonshot) {
    throw new Error(
      'AI 未配置。云端请设置 MOONSHOT_API_KEY；本地请启动 OpenClaw Gateway。'
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
