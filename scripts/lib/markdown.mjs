import matter from 'gray-matter';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import {
  analyzeText,
  escapeAttr,
  escapeHtml,
  plainText,
  slugifyHeading,
  truncate,
} from './utils.mjs';

const LANGUAGE_LABELS = {
  bash: 'Bash',
  console: 'Shell',
  diff: 'Diff',
  fortran: 'Fortran',
  ini: 'INCAR',
  lammps: 'LAMMPS',
  makefile: 'Makefile',
  python: 'Python',
  sh: 'Shell',
  shell: 'Shell',
  text: 'Text',
};

const LANGUAGE_ALIASES = {
  console: 'bash',
  incar: 'ini',
  lmp: 'lammps',
  sh: 'bash',
  shell: 'bash',
};

const CALLOUT_PATTERNS = [
  { className: 'callout--warning', pattern: /⚠️|警告|注意：|注意:/ },
  { className: 'callout--tip', pattern: /💡|提示：|提示:/ },
  { className: 'callout--important', pattern: /📌|重要：|重要:/ },
];

function inlineText(token) {
  if (!token) return '';
  if (token.type === 'text' || token.type === 'code_inline') return token.content;
  if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
  if (!token.children) return '';
  return token.children.map(inlineText).join('');
}

function stripManualTableOfContents(tokens) {
  const start = tokens.findIndex(
    (token, index) =>
      token.type === 'heading_open' &&
      token.tag === 'h2' &&
      inlineText(tokens[index + 1]).trim() === '目录',
  );

  if (start === -1) return false;

  let end = start + 3;
  while (end < tokens.length) {
    if (tokens[end].type === 'hr') {
      end += 1;
      break;
    }
    if (tokens[end].type === 'heading_open' && tokens[end].tag === 'h2') break;
    end += 1;
  }

  tokens.splice(start, end - start);
  return true;
}

function collectHeadings(tokens) {
  const headings = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'heading_open' || !['h2', 'h3'].includes(token.tag)) continue;
    const text = inlineText(tokens[index + 1]).trim();
    if (!text) continue;
    headings.push({
      level: Number(token.tag.slice(1)),
      id: token.attrGet('id') || '',
      text,
    });
  }
  return headings;
}

function describeBlockquotes(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'blockquote_open') continue;

    let text = '';
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].type === 'blockquote_close') break;
      if (tokens[cursor].type === 'inline') text += ` ${inlineText(tokens[cursor])}`;
    }

    const match = CALLOUT_PATTERNS.find(({ pattern }) => pattern.test(text));
    if (match) token.attrJoin('class', `callout ${match.className}`);
  }
}

function normalizeLanguage(info = '') {
  const requested = String(info).trim().split(/\s+/)[0].toLowerCase();
  const language = LANGUAGE_ALIASES[requested] || requested;
  const label = LANGUAGE_LABELS[language] || (requested ? requested.toUpperCase() : 'Text');
  return { language, label, requested };
}

function highlightLammps(code, md) {
  return code
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) {
        return `<span class="hljs-comment">${md.utils.escapeHtml(line)}</span>`;
      }

      const commentMatch = line.match(/^(.*?)(\s+#.*)$/);
      const codePart = commentMatch ? commentMatch[1] : line;
      const comment = commentMatch ? commentMatch[2] : '';
      let html = md.utils.escapeHtml(codePart);

      html = html.replace(
        /^(\s*)([A-Za-z_][\w-]*)/,
        (_, spacing, command) =>
          `${spacing}<span class="hljs-keyword">${command}</span>`,
      );
      html = html.replace(
        /(\$\{[^}]+\})/g,
        '<span class="hljs-variable">$1</span>',
      );

      if (comment) html += `<span class="hljs-comment">${md.utils.escapeHtml(comment)}</span>`;
      return html;
    })
    .join('\n');
}

function collectSearchSections(tokens, meta, route) {
  const sections = [];
  let currentHeading = '';
  let currentAnchor = '';
  let buffer = [];

  const flush = () => {
    const text = plainText(buffer.join(' '));
    if (text) {
      sections.push({
        title: meta.title,
        heading: currentHeading || '导言',
        anchor: currentAnchor,
        category: meta.category,
        tags: meta.tags,
        text: text.slice(0, 6000),
        url: `${route}${currentAnchor ? `#${currentAnchor}` : ''}`,
      });
    }
    buffer = [];
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.type === 'heading_open' &&
      ['h2', 'h3'].includes(token.tag)
    ) {
      flush();
      currentHeading = inlineText(tokens[index + 1]).trim();
      currentAnchor = token.attrGet('id') || '';
      index += 2;
      continue;
    }

    if (token.type === 'inline') buffer.push(inlineText(token));
    if (token.type === 'fence' || token.type === 'code_block') {
      buffer.push(token.content);
    }
  }

  flush();
  return sections;
}

function extractDescription(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'paragraph_open') continue;
    const text = inlineText(tokens[index + 1]).trim();
    if (text) return truncate(text, 150);
  }
  return '';
}

function validateAnchors(tokens, headingIds, sourcePath) {
  const warnings = [];

  for (const token of tokens) {
    if (token.type !== 'link_open') continue;
    const href = token.attrGet('href') || '';
    if (!href.startsWith('#') || href === '#') continue;
    let target = href.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {
      /* Keep the raw fragment when it is not valid percent-encoding. */
    }
    if (!headingIds.has(target)) {
      warnings.push(`${sourcePath} 中的锚点 ${href} 未找到对应标题`);
    }
  }

  return warnings;
}

function createRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  md.use(anchor, {
    level: [1, 2, 3, 4],
    slugify: slugifyHeading,
    permalink: false,
  });

  md.renderer.rules.heading_close = (tokens, index, options, environment, self) => {
    const opening = tokens[index - 2];
    const id = opening?.attrGet('id');
    if (opening && ['h2', 'h3', 'h4'].includes(opening.tag) && id) {
      return ` <a class="header-anchor" href="#${escapeAttr(id)}" title="链接到本节" aria-label="链接到本节">#</a></${opening.tag}>\n`;
    }
    return self.renderToken(tokens, index, options);
  };

  md.renderer.rules.link_open = (tokens, index, options, environment, self) => {
    const token = tokens[index];
    const href = token.attrGet('href') || '';
    if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return self.renderToken(tokens, index, options);
  };

  md.renderer.rules.image = (tokens, index, options, environment, self) => {
    const token = tokens[index];
    token.attrSet('loading', 'lazy');
    token.attrSet('decoding', 'async');
    return self.renderToken(tokens, index, options);
  };

  md.renderer.rules.table_open = () =>
    '<div class="table-wrap" role="region" aria-label="表格，可横向滚动" tabindex="0"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const { language, label, requested } = normalizeLanguage(token.info);
    let highlighted = '';

    if (language === 'lammps' && !hljs.getLanguage('lammps')) {
      highlighted = highlightLammps(token.content, md);
    } else if (language && hljs.getLanguage(language)) {
      try {
        highlighted = hljs.highlight(token.content, {
          language,
          ignoreIllegals: true,
        }).value;
      } catch {
        highlighted = md.utils.escapeHtml(token.content);
      }
    } else {
      highlighted = md.utils.escapeHtml(token.content);
    }

    const safeLanguage = (language || 'text').replace(/[^a-z0-9_-]/g, '');
    return `<div class="code-block" data-lang="${escapeAttr(label)}">
  <div class="code-block__bar">
    <span class="code-block__language">${escapeHtml(label)}</span>
    <button class="code-copy" type="button" data-copy-code aria-label="复制代码">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
      <span class="code-copy__label">复制</span>
    </button>
  </div>
  <pre tabindex="0" aria-label="${escapeAttr(label)} 代码"><code class="hljs language-${safeLanguage}">${highlighted}</code></pre>
</div>`;
  };

  return md;
}

/**
 * Parse and render a Markdown file, returning both HTML and build-time metadata.
 */
export function renderMarkdownDocument({
  raw,
  sourcePath,
  sourceRelative,
  route,
  metadata,
  md = createRenderer(),
}) {
  const parsed = matter(raw);
  const frontMatter = parsed.data || {};
  const mergedMeta = { ...metadata, ...frontMatter };
  const tokens = md.parse(parsed.content, {});

  let firstHeading = '';
  if (tokens[0]?.type === 'heading_open' && tokens[0].tag === 'h1') {
    firstHeading = inlineText(tokens[1]).trim();
    tokens.splice(0, 3);
  } else {
    const found = tokens.findIndex(
      (token) => token.type === 'heading_open' && token.tag === 'h1',
    );
    if (found !== -1) {
      firstHeading = inlineText(tokens[found + 1]).trim();
      tokens.splice(found, 3);
    }
  }

  const removedManualToc = stripManualTableOfContents(tokens);
  describeBlockquotes(tokens);

  const title = String(mergedMeta.title || firstHeading || '未命名文档').trim();
  const description = String(
    mergedMeta.description || extractDescription(tokens) || '',
  ).trim();
  const headings = collectHeadings(tokens);
  const headingIds = new Set(
    tokens
      .filter((token) => token.type === 'heading_open')
      .map((token) => token.attrGet('id'))
      .filter(Boolean),
  );
  const warnings = validateAnchors(tokens, headingIds, sourceRelative);
  const html = md.renderer.render(tokens, md.options, {});
  const text = plainText(
    tokens
      .map((token) => {
        if (token.type === 'inline') return inlineText(token);
        if (token.type === 'fence' || token.type === 'code_block') return token.content;
        return '';
      })
      .join(' '),
  );
  const analysis = analyzeText(text);
  const fences = tokens.filter((token) => token.type === 'fence');
  const codeBlocks = fences.length;
  const codeLines = fences.reduce(
    (total, token) => total + token.content.split('\n').length,
    0,
  );
  // Technical notes with many code samples take longer to read than prose alone.
  analysis.minutes = Math.max(
    1,
    Math.round(analysis.minutes + codeBlocks * 0.18 + codeLines / 120),
  );
  const searchSections = collectSearchSections(
    tokens,
    {
      title,
      category: String(mergedMeta.category || '笔记'),
      tags: Array.isArray(mergedMeta.tags) ? mergedMeta.tags.map(String) : [],
    },
    route,
  );

  return {
    html,
    title,
    description,
    headings,
    searchSections,
    warnings,
    removedManualToc,
    analysis,
    codeBlocks,
    sourcePath,
    sourceRelative,
    frontMatter,
    meta: mergedMeta,
  };
}

export { createRenderer };
