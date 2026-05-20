import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'data/documents');
const KNOWLEDGE_PATH = path.join(ROOT, 'data/knowledge/faq.json');
const PROGRESS_DIR = path.join(ROOT, 'data/progress');

/** 可选子目录；JFM9 文件也可直接放在 data/documents/ 根目录 */
export const DOCUMENT_FOLDERS = ['JFM9系列FPGA'];

export function isJfm9Document(relPath) {
  return (
    relPath.startsWith('JFM9系列FPGA/') ||
    (!relPath.includes('/') && /^JFM9/i.test(path.basename(relPath)))
  );
}

function getDocumentGroupKey(relPath) {
  if (relPath.includes('/')) {
    return `${path.dirname(relPath)}/`;
  }
  if (isJfm9Document(relPath)) return 'JFM9系列/';
  return '（其他）/';
}

export async function listDocuments() {
  const files = [];

  async function walk(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else {
        files.push(rel);
      }
    }
  }

  await walk(DOCS_DIR);
  return files.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function documentDownloadUrl(relPath) {
  return `/api/download?path=${encodeURIComponent(relPath)}`;
}

export function resolveDocumentPath(relPath) {
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalized.includes('..')) return null;
  const root = path.resolve(DOCS_DIR);
  const full = path.resolve(DOCS_DIR, normalized);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function normalizeQuery(query) {
  return query.toLowerCase().replace(/\s/g, '');
}

export function isJfm9FolderQuery(query) {
  const q = normalizeQuery(query);
  return ['jfm9', 'jfm9系列', 'jfm9系列fpga'].includes(q);
}

/** 生成 JFM9系列FPGA 目录的完整下载清单（按分类分组） */
export function buildJfm9FolderCatalog(docs) {
  const folder = 'JFM9系列FPGA/';
  const groups = {
    技术手册: [],
    引脚说明: [],
    应用指南: [],
    其他: [],
  };

  for (const rel of docs) {
    const base = path.basename(rel);
    if (/技术手册/.test(base)) groups['技术手册'].push(rel);
    else if (/引脚/.test(base)) groups['引脚说明'].push(rel);
    else if (/应用指南/.test(base)) groups['应用指南'].push(rel);
    else groups['其他'].push(rel);
  }

  const lines = [
    `**${folder}** 可下载清单（按类型分组）`,
    '',
    '以下为该目录下的文件：',
    '',
  ];

  for (const [title, items] of Object.entries(groups)) {
    if (!items.length) continue;
    lines.push(`**${title}**`);
    items
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .forEach((rel, i) => {
        lines.push(`${i + 1}. \`${rel}\``);
      });
    lines.push('');
  }

  lines.push('请使用消息下方的 **↓ 下载** 按钮获取文件。');
  return lines.join('\n');
}

function isFolderOnlyQuery(q, files) {
  if (isJfm9FolderQuery(q.replace(/\s/g, '')) && files.some(isJfm9Document)) {
    return true;
  }
  const folders = [...new Set(files.map((f) => path.dirname(f)).filter((d) => d !== '.'))];
  return folders.some((folder) => {
    const n = folder.toLowerCase().replace(/\s/g, '');
    const short = path.basename(folder).toLowerCase().replace(/\s/g, '');
    return q === n || q === short;
  });
}

function scoreDocumentMatch(relPath, q) {
  const lower = relPath.toLowerCase();
  const base = path.basename(relPath).toLowerCase();
  const baseNoExt = base.replace(/\.[^.]+$/, '');
  const dir = path.dirname(relPath).toLowerCase();

  let score = 0;
  if (baseNoExt === q || base === q) score += 100;
  if (baseNoExt.includes(q) || q.includes(baseNoExt)) score += 60;
  if (lower.includes(q)) score += 40;
  if (dir !== '.' && (dir.includes(q) || q.includes(dir.replace(/\s/g, '')))) score += 25;
  if (isJfm9Document(relPath) && /jfm9|ku\d|vu\d|rfvu/i.test(q)) score += 15;
  return score;
}

function isDownloadable(relPath) {
  return !/^readme\.md$/i.test(path.basename(relPath));
}

function filesInFolder(files, folderPrefix) {
  const prefix = folderPrefix.endsWith('/') ? folderPrefix : `${folderPrefix}/`;
  return files.filter(
    (f) => (f.startsWith(prefix) || f === folderPrefix) && isDownloadable(f)
  );
}

function extractPrimaryModel(query) {
  const m = query.match(/JFM9[\w-]+/i);
  return m ? m[0].toLowerCase().replace(/\s/g, '') : null;
}

function filterByModel(files, modelToken) {
  if (!modelToken) return files;
  return files.filter((f) =>
    normalizeQuery(path.basename(f)).includes(modelToken)
  );
}

function matchByCategory(query, files) {
  const pool = files.filter(isDownloadable);
  const model = extractPrimaryModel(query);
  let result = [];

  if (/技术手册/.test(query)) {
    result = pool.filter((f) => /技术手册/.test(path.basename(f)));
  } else if (/引脚/.test(query)) {
    result = pool.filter((f) => /引脚/.test(path.basename(f)));
  } else if (/应用指南/.test(query)) {
    result = pool.filter((f) => /应用指南/.test(path.basename(f)));
  }

  if (result.length) return filterByModel(result, model);
  return [];
}

function resolveFolderFiles(q, files) {
  if (['jfm9', 'jfm9系列', 'jfm9系列fpga'].includes(q)) {
    return files.filter((f) => isJfm9Document(f) && isDownloadable(f));
  }
  const folders = [...new Set(files.map((f) => path.dirname(f)).filter((d) => d !== '.'))];
  for (const folder of folders) {
    const n = folder.toLowerCase().replace(/\s/g, '');
    const short = path.basename(folder).toLowerCase().replace(/\s/g, '');
    if (q === n || q === short) return filesInFolder(files, folder);
  }
  return [];
}

/** 匹配一个或多个可下载文档 */
export async function matchDocuments(query, files) {
  const q = normalizeQuery(query);
  if (!q) return [];

  const parts = query.split(/[和与及,，、]+/).map((s) => s.trim()).filter((p) => p.length > 1);
  if (parts.length > 1) {
    const merged = new Set();
    const sharedModel = extractPrimaryModel(query);
    for (const part of parts) {
      const partQuery =
        sharedModel && !extractPrimaryModel(part)
          ? `${sharedModel} ${part}`
          : part;
      const hits = await matchDocuments(partQuery, files);
      hits.forEach((f) => merged.add(f));
    }
    if (merged.size) return [...merged];
  }

  const categoryFiles = matchByCategory(query, files);
  if (categoryFiles.length) return categoryFiles;

  if (
    /全部|所有|all/i.test(query) &&
    !/技术手册|引脚|应用指南/.test(query)
  ) {
    const bulk = files.filter((f) => isDownloadable(f));
    if (/jfm9/i.test(query)) return bulk.filter(isJfm9Document);
    if (bulk.length) return bulk;
  }

  const folderFiles = isFolderOnlyQuery(q, files)
    ? resolveFolderFiles(q, files)
    : [];
  if (folderFiles.length) return folderFiles;

  const model = extractPrimaryModel(query);
  if (model) {
    let modelFiles = filterByModel(files.filter(isDownloadable), model);
    if (/技术手册/.test(query)) {
      modelFiles = modelFiles.filter((f) => /技术手册/.test(path.basename(f)));
    } else if (/引脚/.test(query)) {
      modelFiles = modelFiles.filter((f) => /引脚/.test(path.basename(f)));
    }
    if (modelFiles.length) return modelFiles;
  }

  const scored = files
    .map((f) => ({ f, score: scoreDocumentMatch(f, q) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    if (scored.length === 1) return [scored[0].f];
    if (scored[0].score >= 90 && scored[0].score - scored[1].score >= 25) {
      return [scored[0].f];
    }
    return [scored[0].f];
  }

  for (const f of files) {
    if (!/\.(md|txt)$/i.test(f)) continue;
    const content = await fs.readFile(path.join(DOCS_DIR, f), 'utf-8');
    const title = (content.match(/^#\s+(.+)/m) || [])[1] || '';
    const hay = (title + content).toLowerCase().replace(/\s/g, '');
    if (hay.includes(q)) return [f];
  }

  return [];
}

export async function matchDocumentName(query, files) {
  const docs = await matchDocuments(query, files);
  return docs[0] ?? null;
}

export function formatFilesListGrouped(files) {
  const groups = new Map();

  for (const rel of files) {
    const key = getDocumentGroupKey(rel);
    if (!groups.has(key)) groups.set(key, []);
    const display = rel.includes('/') ? path.basename(rel) : rel;
    groups.get(key).push({ rel, display });
  }

  const orderedKeys = [...groups.keys()].sort((a, b) => {
    if (a === 'JFM9系列/') return -1;
    if (b === 'JFM9系列/') return 1;
    if (a === '（其他）/') return 1;
    if (b === '（其他）/') return -1;
    return a.localeCompare(b, 'zh-CN');
  });

  const lines = [];
  for (const key of orderedKeys) {
    lines.push(`【${key}】`);
    const items = groups
      .get(key)
      .sort((a, b) => a.display.localeCompare(b.display, 'zh-CN'));
    for (const { rel } of items) {
      lines.push(`  - ${rel}`);
    }
  }
  return lines.join('\n');
}

export async function buildDocumentContext() {
  const files = await listDocuments();
  const jfm9Files = files.filter(isJfm9Document);
  const hasSubfolder = jfm9Files.some((f) => f.includes('/'));
  const filesList =
    files.length > 0
      ? formatFilesListGrouped(files)
      : '（暂无，请将文件放入 data/documents/）';

  return {
    files,
    filesList,
    jfm9Count: jfm9Files.length,
    jfm9Folder: hasSubfolder ? 'JFM9系列FPGA/' : 'JFM9系列（根目录）',
  };
}

export async function buildQaContext() {
  const raw = await fs.readFile(KNOWLEDGE_PATH, 'utf-8');
  const faq = JSON.parse(raw);
  const lines = faq.map(
    (item) =>
      `- 关键词：${item.keywords.join('、')}\n  答案：${item.answer}`
  );
  return { faq, knowledgeText: lines.join('\n') };
}

export async function buildProgressContext(message) {
  const files = await fs.readdir(PROGRESS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const lower = message.toLowerCase();

  let target = null;
  for (const file of jsonFiles) {
    const base = file.replace('.json', '').toLowerCase();
    if (lower.includes(base) || (lower.includes('alpha') && base.includes('alpha'))) {
      target = file;
      break;
    }
  }
  if (!target && jsonFiles.length === 1) target = jsonFiles[0];

  const available = jsonFiles.map((f) => f.replace('.json', '')).join('、');

  if (!target) {
    return { target: null, available, rawJson: null };
  }

  const rawJson = await fs.readFile(path.join(PROGRESS_DIR, target), 'utf-8');
  return { target, available, rawJson };
}

export const SYSTEM_PROMPTS = {
  document: (ctx) =>
    `你是「文档下载」智能体，通过 OpenClaw 为用户服务。
用户会在对话中说明需要的文档名称。文档按分类/子文件夹列出；若在子文件夹中则使用完整路径（如 JFM9系列FPGA/xxx.pdf），若在根目录则直接使用文件名（如 JFM9KU6P技术手册V1.1.pdf）。

【可下载文档目录】
${ctx.filesList}

JFM9 系列共 ${ctx.jfm9Count} 个文件（当前位置：${ctx.jfm9Folder}）。用户仅说「JFM9」或「JFM9系列」时，列出上述 JFM9 相关文件名供选择。

规则：
1. 仅根据列表匹配，不要编造文件名。
2. 找到文档时直接说明内容与准确路径；若用户要多个或整个系列，应列出多个文件。
3. 未匹配时引导用户补充型号关键词，或说明可输入「JFM9系列」「所有技术手册」等批量获取。
4. 不要用「已找到 N 个文档」「共检索到」等套话开头，直接回答；简洁专业中文，200 字以内。`,

  qa: (ctx) =>
    `你是「智能问答」智能体，通过 OpenClaw 为用户服务。
请优先依据以下本地知识库回答价格、技术、交付、售后等问题。知识库未覆盖时如实说明，可给出合理建议但不要编造具体报价。

【本地知识库】
${ctx.knowledgeText}

规则：回答精准、简洁，使用中文。不要说明「已匹配几条知识」「找到多少文档」等检索过程，直接给出结论与要点。`,

  progress: (ctx) =>
    `你是「进度查询」智能体，通过 OpenClaw 为用户服务。
请根据以下项目状态数据回答用户的进度查询。使用清晰结构：项目名称、当前阶段、整体进度百分比、里程碑列表（含状态图标 ✓ 完成 / ◐ 进行中 / ○ 待开始）、备注。

可查询项目：${ctx.available || '（暂无）'}

${ctx.rawJson ? `【当前匹配项目数据】\n${ctx.rawJson}` : '用户尚未指定具体项目，请根据可查询项目列表引导用户补充项目名称。'}`,

  general: () =>
    `你是「其他功能」通用智能体，通过 OpenClaw 为用户服务。
支持自由对话、需求整理、文案起草与一般性问题解答。
若用户需要文档下载、知识库问答或项目进度查询，可提示其使用左侧面板切换到对应专项智能体。
使用简洁、友好的中文。`,
};
