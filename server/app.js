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
  getSessionTokenFromRequest,
  validateCredentials,
  validateSessionToken,
} from './authSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'data/uploads');
const DOCS_DIR = path.join(ROOT, 'data/documents');

export async function createApp() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const app = express();
  const upload = multer({ dest: UPLOAD_DIR });

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use('/downloads', express.static(DOCS_DIR));

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!validateCredentials(username, password)) {
      return res.status(401).json({ error: '账号或密码错误，请重试' });
    }
    const token = await createLoginSession(username);
    res.cookie(AUTH_COOKIE, token, cookieOptions());
    res.json({ ok: true });
  });

  app.get('/api/auth/session', async (req, res) => {
    const token = getSessionTokenFromRequest(req);
    if (await validateSessionToken(token)) {
      return res.json({ ok: true });
    }
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    res.status(401).json({
      error: 'SESSION_INVALID',
      message: '账号已在其他设备登录或登录已过期，请重新登录',
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    res.json({ ok: true });
  });

  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const token = getSessionTokenFromRequest(req);
    if (await validateSessionToken(token)) return next();
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    res.status(401).json({
      error: 'SESSION_INVALID',
      message: '账号已在其他设备登录或登录已过期，请重新登录',
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
      return res.status(400).json({ error: '?? path ??' });
    }

    const fullPath = resolveDocumentPath(relPath.trim());
    if (!fullPath || !existsSync(fullPath)) {
      return res.status(404).json({ error: '?????' });
    }

    res.download(fullPath, path.basename(fullPath), (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: '????' });
      }
    });
  });

  app.get('/api/openclaw/status', async (_req, res) => {
    const hasMoonshot = Boolean(process.env.MOONSHOT_API_KEY);
    if (!isOpenClawConfigured() && !hasMoonshot) {
      return res.json({
        ok: false,
        configured: false,
        error: '??? AI?MOONSHOT_API_KEY ? OpenClaw?',
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
      return res.status(400).json({ error: '??????' });
    }

    if (!AGENTS[agentId]) {
      return res.status(404).json({ error: '?????' });
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
        error: err.message || 'OpenClaw ???????',
        hint: '?????? openclaw gateway????? chatCompletions ??',
      });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '?????' });
    }
    res.json({
      name: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
    });
  });

  return app;
}
