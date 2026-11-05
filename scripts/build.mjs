import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { renderMarkdownDocument } from './lib/markdown.mjs';
import { renderArticle, renderHome, renderLibrary } from './lib/templates.mjs';
import {
  contentHash,
  escapeHtml,
  ensureDir,
  formatNumber,
  removeDirectory,
  slugifyFileName,
  walkFiles,
  writeText,
  pathExists,
} from './lib/utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'site.config.json');

function normalizeSlug(value, fallback) {
  let slug = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[\\/?#%<>:"|*]/g, '')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  if (!slug || slug === '.' || slug === '..') slug = fallback;
  return slug;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function normalizeSiteUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    console.warn(`[build] 忽略无效的 siteUrl：${value}`);
    return '';
  }
}

function normalizeSite(config) {
  const site = { ...config };
  site.title = String(site.title || '材料计算手记');
  site.shortTitle = String(site.shortTitle || site.title);
  site.description = String(site.description || '');
  site.tagline = String(site.tagline || 'Field Notes');
  site.lang = String(site.lang || 'zh-CN');
  site.author = String(site.author || '');
  site.sourceDir = String(site.sourceDir || 'resource');
  site.outDir = String(site.outDir || 'dist');
  site.siteUrl = normalizeSiteUrl(process.env.SITE_URL || site.siteUrl || '');
  site.repository = String(site.repository || '').trim();
  site.repositoryBranch = String(site.repositoryBranch || 'main');
  site.docs = site.docs && typeof site.docs === 'object' ? site.docs : {};
  return site;
}

function configuredMetadata(site, relativePath) {
  const fileName = path.posix.basename(relativePath);
  return {
    ...(site.docs[fileName] || {}),
    ...(site.docs[relativePath] || {}),
  };
}

function categoryFromPath(relativePath) {
  const directory = path.posix.dirname(relativePath);
  if (!directory || directory === '.') return '笔记';
  return directory.split('/')[0];
}

async function loadDocuments(site) {
  const sourceDirectory = path.join(PROJECT_ROOT, site.sourceDir);
  if (!(await pathExists(sourceDirectory))) {
    throw new Error(`找不到 Markdown 目录：${site.sourceDir}`);
  }

  const files = await walkFiles(sourceDirectory, (filePath) => /\.md$/i.test(filePath));
  if (!files.length) console.warn(`[build] ${site.sourceDir}/ 中没有找到 Markdown 文件。`);

  const documents = [];
  const warnings = [];
  const seenSlugs = new Map();

  for (let index = 0; index < files.length; index += 1) {
    const sourcePath = files[index];
    const relativeToSource = path.relative(sourceDirectory, sourcePath).split(path.sep).join('/');
    const sourceRelative = path.posix.join(site.sourceDir, relativeToSource);
    const configured = configuredMetadata(site, relativeToSource);
    const raw = await fs.readFile(sourcePath, 'utf8');
    const frontMatter = matter(raw).data || {};
    const merged = { ...configured, ...frontMatter };

    if (merged.draft === true) continue;

    const fallbackSlug = slugifyFileName(path.posix.basename(relativeToSource)) ||
      `note-${contentHash(sourceRelative, String(index))}`;
    const slug = normalizeSlug(merged.slug, fallbackSlug);
    if (seenSlugs.has(slug)) {
      throw new Error(
        `文档 slug 冲突：“${slug}”同时被 ${seenSlugs.get(slug)} 和 ${sourceRelative} 使用。请在 site.config.json 中设置不同的 slug。`,
      );
    }
    seenSlugs.set(slug, sourceRelative);

    const route = `docs/${slug}/`;
    const document = renderMarkdownDocument({
      raw,
      sourcePath,
      sourceRelative,
      route,
      metadata: configured,
    });

    const metadata = { ...configured, ...document.frontMatter };
    const title = String(metadata.title || document.title || '未命名文档').trim();
    const category = String(metadata.category || categoryFromPath(relativeToSource)).trim();
    const tags = normalizeTags(metadata.tags);
    const updated = normalizeDate(metadata.updated);
    const order = Number.isFinite(Number(metadata.order)) ? Number(metadata.order) : 1000 + index;

    documents.push({
      ...document,
      slug,
      route,
      title,
      navTitle: String(metadata.navTitle || title).trim(),
      description: String(metadata.description || document.description || '').trim(),
      category: category || '笔记',
      tags,
      readMinutes: document.analysis.minutes,
      words: document.analysis.words,
      updated,
      order,
      featured: metadata.featured !== false,
      index,
    });
    warnings.push(...document.warnings);
  }

  documents.sort((a, b) => a.order - b.order || a.index - b.index);
  documents.forEach((document, index) => {
    document.index = index;
  });

  return { documents, warnings };
}

function buildStats(documents) {
  return {
    docs: documents.length,
    codeBlocks: documents.reduce((total, doc) => total + doc.codeBlocks, 0),
    minutes: documents.reduce((total, doc) => total + doc.analysis.minutes, 0),
    words: documents.reduce((total, doc) => total + doc.analysis.words, 0),
    headings: documents.reduce((total, doc) => total + doc.headings.length, 0),
  };
}

function makeContext(site, documents, stats, assets, { currentPage, currentDoc = null, route }) {
  return {
    site,
    docs: documents,
    stats,
    assets,
    currentPage,
    currentDoc,
    doc: currentDoc,
    route,
  };
}

function xmlEscape(value) {
  return escapeHtml(value, true);
}

async function copyPublicAssets(site, outDirectory) {
  const publicDirectory = path.join(PROJECT_ROOT, 'public');
  if (!(await pathExists(publicDirectory))) return;
  const files = await walkFiles(publicDirectory);
  for (const file of files) {
    const relative = path.relative(publicDirectory, file);
    const target = path.join(outDirectory, relative);
    await ensureDir(path.dirname(target));
    await fs.copyFile(file, target);
  }
}

function buildSitemap(site, documents) {
  if (!site.siteUrl) return '';
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { route: '', lastmod: today },
    { route: 'docs/', lastmod: today },
    ...documents.map((doc) => ({ route: doc.route, lastmod: doc.updated || today })),
  ];

  const urls = entries
    .map(
      ({ route, lastmod }) => `  <url>
    <loc>${xmlEscape(new URL(route, site.siteUrl).href)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function buildSite() {
  const startedAt = Date.now();
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const site = normalizeSite(config);
  const outDirectory = path.resolve(PROJECT_ROOT, site.outDir);
  const rootWithSeparator = `${PROJECT_ROOT}${path.sep}`;
  if (!outDirectory.startsWith(rootWithSeparator)) {
    throw new Error(`输出目录必须位于项目内：${outDirectory}`);
  }

  console.log(`[build] 读取 ${site.sourceDir}/`);
  const { documents, warnings } = await loadDocuments(site);
  const stats = buildStats(documents);

  await removeDirectory(outDirectory);
  await ensureDir(path.join(outDirectory, 'assets'));

  const css = await fs.readFile(path.join(PROJECT_ROOT, 'src', 'styles.css'), 'utf8');
  const js = await fs.readFile(path.join(PROJECT_ROOT, 'src', 'app.js'), 'utf8');
  const assets = {
    css: `styles.${contentHash(css)}.css`,
    js: `app.${contentHash(js)}.js`,
  };

  await fs.writeFile(path.join(outDirectory, 'assets', assets.css), css, 'utf8');
  await fs.writeFile(path.join(outDirectory, 'assets', assets.js), js, 'utf8');
  await fs.copyFile(
    path.join(PROJECT_ROOT, 'src', 'favicon.svg'),
    path.join(outDirectory, 'assets', 'favicon.svg'),
  );
  await copyPublicAssets(site, outDirectory);

  const homeContext = makeContext(site, documents, stats, assets, {
    currentPage: 'home',
    route: '',
  });
  await writeText(path.join(outDirectory, 'index.html'), renderHome(homeContext));

  const libraryContext = makeContext(site, documents, stats, assets, {
    currentPage: 'library',
    route: 'docs/',
  });
  await writeText(path.join(outDirectory, 'docs', 'index.html'), renderLibrary(libraryContext));

  for (const document of documents) {
    const articleContext = makeContext(site, documents, stats, assets, {
      currentPage: 'article',
      currentDoc: document,
      route: document.route,
    });
    await writeText(
      path.join(outDirectory, 'docs', document.slug, 'index.html'),
      renderArticle(articleContext),
    );
  }

  const searchEntries = documents.flatMap((document) => document.searchSections);
  await writeText(
    path.join(outDirectory, 'search-index.json'),
    `${JSON.stringify(searchEntries)}\n`,
  );
  await writeText(path.join(outDirectory, '.nojekyll'), '');

  const sitemap = buildSitemap(site, documents);
  if (sitemap) {
    await writeText(path.join(outDirectory, 'sitemap.xml'), sitemap);
    await writeText(
      path.join(outDirectory, 'robots.txt'),
      `User-agent: *\nAllow: /\n\nSitemap: ${site.siteUrl}sitemap.xml\n`,
    );
  } else {
    await writeText(path.join(outDirectory, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  }

  const duration = Date.now() - startedAt;
  console.log('');
  console.log(`[build] 完成：${documents.length} 篇文档 · ${formatNumber(stats.codeBlocks)} 个代码块 · ${formatNumber(stats.words)} 字词`);
  console.log(`[build] 输出：${path.relative(PROJECT_ROOT, outDirectory)}/  (${duration} ms)`);
  if (!site.siteUrl) console.log('[build] 提示：设置 siteUrl 或 SITE_URL 后才会生成绝对 canonical / sitemap。');
  if (warnings.length) {
    console.warn('');
    warnings.forEach((warning) => console.warn(`[warn] ${warning}`));
    if (process.env.STRICT === '1') throw new Error(`有 ${warnings.length} 条构建警告（STRICT=1）`);
  }

  return { documents, stats, outDirectory, warnings };
}

const isCli = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  buildSite().catch((error) => {
    console.error('');
    console.error(`[build] 失败：${error.message}`);
    console.error(error.stack);
    process.exitCode = 1;
  });
}

export { buildSite, PROJECT_ROOT };
