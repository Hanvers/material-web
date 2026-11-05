import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for an HTML text node or a quoted attribute. */
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function escapeAttr(value = '') {
  return escapeHtml(value);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

/** Format a date-like string as 2026.10.20 without shifting time zones. */
export function formatDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/** Count CJK characters and Latin words to estimate reading time. */
export function analyzeText(text = '') {
  const cjkCharacters = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latinWords = (
    text
      .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ')
      .match(/[A-Za-z0-9][A-Za-z0-9'’._/-]*/g) || []
  ).length;
  return {
    characters: text.length,
    cjkCharacters,
    latinWords,
    words: cjkCharacters + latinWords,
    minutes: Math.max(1, Math.round(cjkCharacters / 360 + latinWords / 220)),
  };
}

export function compactNumber(value) {
  if (value >= 10000) {
    const number = value / 10000;
    return `${number >= 10 ? number.toFixed(0) : number.toFixed(1).replace(/\.0$/, '')} 万`;
  }
  return formatNumber(value);
}

/** Stable anchor slug that keeps CJK while matching the repository's manual TOC links. */
export function slugifyHeading(text = '') {
  return String(text)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[`~!@#$%^&*()+=[\]{}|\\:;"'’‘“”.,<>/?！？、，。；：“”‘’（）【】《》〈〉·—–…]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

export function slugifyFileName(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a relative URL from one output directory to a site-root-relative route.
 * Directory targets receive a trailing slash so GitHub Pages serves index.html.
 */
export function relativeUrl(fromDirectory = '', target = '') {
  const targetIsDirectory = target === '' || target.endsWith('/');
  let relative = path.posix.relative(fromDirectory || '.', target || '.');
  if (!relative) relative = '.';
  if (targetIsDirectory && relative !== '.') relative += '/';
  if (relative === '.') return './';
  return relative.startsWith('.') ? relative : `./${relative}`;
}

export function encodeRoute(route = '') {
  return encodeURI(route).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

export function absoluteUrl(route, siteUrl) {
  if (!siteUrl) return '';
  return new URL(route || '', siteUrl).href;
}

export function encodePathSegments(relativePath = '') {
  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function ensureDir(directory) {
  await fs.mkdir(directory, { recursive: true });
}

export async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

export async function removeDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(directory, predicate = () => true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath, predicate)));
    } else if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

export function contentHash(...values) {
  return createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 10);
}

export function truncate(value = '', length = 120) {
  const compact = String(value).replace(/\s+/g, ' ').trim();
  if (compact.length <= length) return compact;
  return `${compact.slice(0, length).trimEnd()}…`;
}

export function plainText(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toSafeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function isExternalUrl(value = '') {
  return /^(?:https?:)?\/\//i.test(value) || /^mailto:/i.test(value);
}
