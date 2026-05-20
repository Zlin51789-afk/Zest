import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { AGENTS, handleAgent } from './agents.js';
import {
  buildDocumentContext,
  documentDownloadUrl,
  isJfm9Document,
  listDocuments,
  resolveDocumentPath,
} from './context.js';
import { checkAiHealth } from './llm.js';
import { isOpenClawConfigured } from './openclaw.js';
import {
  AUTH_COOKIE,
  cookieOptions,
  createLoginSession,
  getLoginFailureMessage,
  getSessionTokenFromRequest,
  getSessionUsernameFromToken,
  validateSessionToken,
} from './authSession.js';
import {
  checkAdminSecret,
  extendAccount,
  listAccountsPublic,
  updateAccount,
} from './authAccounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'data/uploads');
const DOCS_DIR = path.join(ROOT, 'data/documents');

export async function createApp() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const app = express();
  app.set('trust proxy', 1);
  const upload = multer({ dest: UPLOAD_DIR });

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use('/downloads', express.static(DOCS_DIR));

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    const errMsg = await getLoginFailureMessage(username, password);
    if (errMsg) {
      return res.status(401).json({ error: errMsg });
    }
    const token = await createLoginSession(username);
    res.cookie(AUTH_COOKIE, token, cookieOptions(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/session', async (req, res) => {
    const token = getSessionTokenFromRequest(req);
    const username = await getSessionUsernameFromToken(token);
    if (username) {
      return res.json({ ok: true, username });
    }
    res.clearCookie(AUTH_COOKIE, cookieOptions(req));
    res.status(401).json({
      error: 'SESSION_INVALID',
      message:
        '\u767b\u5f55\u5df2\u5931\u6548\u6216\u8d26\u53f7\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE, cookieOptions(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/admin/accounts', async (req, res) => {
    if (!checkAdminSecret(req)) {
      return res.status(403).json({ error: '\u65e0\u7ba1\u7406\u6743\u9650' });
    }
    const accounts = await listAccountsPublic();
    res.json({ accounts });
  });

  app.patch('/api/auth/admin/accounts/:username', async (req, res) => {
    if (!checkAdminSecret(req)) {
      return res.status(403).json({ error: '\u65e0\u7ba1\u7406\u6743\u9650' });
    }
    try {
      const { extendDays = 30 } = req.body || {};
      const account = await extendAccount(req.params.username, extendDays);
      res.json({
        ok: true,
        username: req.params.username,
        expiresAt: account.expiresAt,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/auth/admin/accounts/:username', async (req, res) => {
    if (!checkAdminSecret(req)) {
      return res.status(403).json({ error: '\u65e0\u7ba1\u7406\u6743\u9650' });
    }
    try {
      const account = await updateAccount(req.params.username, req.body || {});
      res.json({
        ok: true,
        username: req.params.username,
        expiresAt: account.expiresAt,
        note: account.note || '',
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/api/auth/admin/')) return next();
    if (
      req.path === '/api/auth/login' ||
      req.path === '/api/auth/session' ||
      req.path === '/api/auth/logout'
    ) {
      return next();
    }
    const token = getSessionTokenFromRequest(req);
    if (await validateSessionToken(token)) return next();
    res.clearCookie(AUTH_COOKIE, cookieOptions(req));
    res.status(401).json({
      error: 'SESSION_INVALID',
      message:
        '\u767b\u5f55\u5df2\u5931\u6548\u6216\u8d26\u53f7\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55',
    });
  });


  app.get('/api/agents', (_req, res) => {
    const list = Object.values(AGENTS).map(({ id, name, subtitle }) => ({
      id,
      name,
      subtitle,
    }));
    res.json(list);
  });

  app.get('/api/documents', async (_req, res) => {
    try {
      const files = await listDocuments();
      const ctx = await buildDocumentContext();
      const folders = {};

      for (const rel of files) {
        const dir = path.dirname(rel);
        const folder = dir === '.' ? '' : `${dir}/`;
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push({
          name: path.basename(rel),
          path: rel,
          url: documentDownloadUrl(rel),
        });
      }

      res.json({
        total: files.length,
        folders,
        jfm9: {
          folder: ctx.jfm9Folder,
          count: ctx.jfm9Count,
          files: files.filter(isJfm9Document),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/download', async (req, res) => {
    const relPath = req.query.path;
    if (typeof relPath !== 'string' || !relPath.trim()) {
      return res.status(400).json({
        error: '\u7f3a\u5c11 path \u53c2\u6570\u6216\u8def\u5f84\u65e0\u6548',
      });
    }

    const fullPath = resolveDocumentPath(relPath.trim());
    if (!fullPath || !existsSync(fullPath)) {
      return res.status(404).json({ error: '\u6587\u4ef6\u4e0d\u5b58\u5728\u6216\u65e0\u6743\u8bbf\u95ee' });
    }

    res.download(fullPath, path.basename(fullPath), (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: '\u4e0b\u8f7d\u5931\u8d25' });
      }
    });
  });

  app.get('/api/openclaw/status', async (_req, res) => {
    const hasMoonshot = Boolean(process.env.MOONSHOT_API_KEY);
    if (!isOpenClawConfigured() && !hasMoonshot) {
      return res.json({
        ok: false,
        configured: false,
        error:
          '\u672a\u914d\u7f6e AI\uff1a\u8bf7\u8bbe\u7f6e MOONSHOT_API_KEY\uff08\u7ebf\u4e0a\uff09\u6216\u914d\u7f6e OpenClaw Gateway\u3002',
      });
    }
    const health = await checkAiHealth();
    res.json({
      configured: true,
      ...health,
    });
  });

  app.post('/api/chat/:agentId', async (req, res) => {
    const { agentId } = req.params;
    const { message, history = [] } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: '\u6d88\u606f\u4e0d\u80fd\u4e3a\u7a7a' });
    }

    if (!AGENTS[agentId]) {
      return res.status(404).json({ error: '\u672a\u77e5\u667a\u80fd\u4f53' });
    }

    try {
      const result = await handleAgent(agentId, message.trim(), { history });
      res.json({
        role: 'assistant',
        text: result.text,
        attachments: result.attachments || [],
        timestamp: Date.now(),
        source: 'openclaw',
      });
    } catch (err) {
      console.error('[openclaw]', err.message);
      res.status(502).json({
        error:
          err.message ||
          '\u804a\u5929\u670d\u52a1\u6682\u65f6\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
        hint: '\u82e5\u5728 Vercel \u90e8\u7f72\uff0c\u8bf7\u786e\u8ba4\u5df2\u914d\u7f6e MOONSHOT_API_KEY\uff08\u53ca\u53ef\u9009 MOONSHOT_MODEL\uff09\u5e76\u91cd\u65b0\u90e8\u7f72\u3002',
      });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '\u672a\u4e0a\u4f20\u6587\u4ef6' });
    }
    res.json({
      name: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
    });
  });

  return app;
}
