import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');

/** 支持环境变量指向本机隐私目录，无需把文件放进 Git 仓库 */
function resolveDataPath(envKey, defaultRel) {
  const raw = process.env[envKey];
  if (raw != null && String(raw).trim()) {
    return path.resolve(String(raw).trim());
  }
  return path.join(ROOT, defaultRel);
}

export const DOCS_DIR = resolveDataPath('DOCUMENTS_DIR', 'data/documents');
export const KNOWLEDGE_PATH = resolveDataPath('KNOWLEDGE_PATH', 'data/knowledge/faq.json');
export const PROGRESS_DIR = resolveDataPath('PROGRESS_DIR', 'data/progress');
export const ACCOUNTS_FILE = resolveDataPath('ACCOUNTS_FILE', 'data/accounts.json');
export const UPLOAD_DIR = resolveDataPath('UPLOAD_DIR', 'data/uploads');
