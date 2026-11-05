import {
  absoluteUrl,
  compactNumber,
  escapeAttr,
  escapeHtml,
  formatDate,
  formatNumber,
  relativeUrl,
  toSafeJson,
} from './utils.mjs';

const ICONS = {
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"/>',
  github:
    '<path fill="currentColor" stroke="none" d="M12 .8A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.3 11.3 0 0 0 12 .8Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  hash: '<path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  cornerDownRight: '<path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
  layers:
    '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

function siteUrl(site) {
  if (!site.siteUrl) return '';
  return site.siteUrl.endsWith('/') ? site.siteUrl : `${site.siteUrl}/`;
}

function makeContextHelpers(ctx) {
  const u = (target) => relativeUrl(ctx.route, target);
  const canonical = (target = ctx.route) => absoluteUrl(target, siteUrl(ctx.site));
  const repository = ctx.site.repository
    ? ctx.site.repository.replace(/\/+$/, '')
    : '';
  const githubUrl = repository || '';
  const editUrl = (doc) => {
    if (!repository || !doc?.sourceRelative) return '';
    const branch = ctx.site.repositoryBranch || 'main';
    const path = doc.sourceRelative
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${repository}/edit/${encodeURIComponent(branch)}/${path}`;
  };
  return { u, canonical, githubUrl, editUrl };
}

function brandMarkup(ctx, { small = false } = {}) {
  const { u, githubUrl } = makeContextHelpers(ctx);
  return `<a class="brand${small ? ' brand--small' : ''}" href="${u('')}" aria-label="${escapeAttr(ctx.site.title)}首页">
    <span class="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M7 27V9l11 10L29 9v18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="7" cy="9" r="2.2" fill="var(--accent)"/>
        <circle cx="18" cy="19" r="2.2" fill="var(--teal)"/>
        <circle cx="29" cy="9" r="2.2" fill="var(--accent)"/>
      </svg>
    </span>
    <span class="brand__copy">
      <strong>${escapeHtml(ctx.site.shortTitle || ctx.site.title)}</strong>
      <small>${escapeHtml(ctx.site.tagline || 'Field Notes')}</small>
    </span>
  </a>`;
}

function primaryNav(ctx) {
  const { u } = makeContextHelpers(ctx);
  const docsActive = ['library', 'article'].includes(ctx.currentPage);
  const aboutHref = ctx.currentPage === 'home' ? '#about' : `${u('')}#about`;
  return `<nav class="primary-nav" aria-label="主导航">
    <a href="${u('docs/')}"${docsActive ? ' aria-current="page"' : ''}>文档</a>
    <a href="${aboutHref}">关于</a>
  </nav>`;
}

function header(ctx) {
  const { u, githubUrl } = makeContextHelpers(ctx);
  const readingProgress =
    ctx.currentPage === 'article'
      ? `<div class="reading-progress" aria-hidden="true"><span data-reading-progress></span></div>`
      : '';
  return `<a class="skip-link" href="#main">跳到正文</a>
  <header class="site-header" data-site-header>
    <div class="container site-header__inner">
      ${brandMarkup(ctx)}
      ${primaryNav(ctx)}
      <div class="header-actions">
        <button class="search-trigger" type="button" data-search-open aria-haspopup="dialog" aria-label="搜索文档">
          ${icon('search')}
          <span class="search-trigger__text">搜索</span>
          <kbd class="search-trigger__key" data-shortcut-label>Ctrl K</kbd>
        </button>
        ${githubUrl ? `<a class="icon-button header-github" href="${escapeAttr(githubUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看仓库">${icon('github')}</a>` : ''}
        <button class="icon-button theme-toggle" type="button" data-theme-toggle aria-label="切换深色模式">
          ${icon('sun', 'theme-icon theme-icon--sun')}
          ${icon('moon', 'theme-icon theme-icon--moon')}
        </button>
        <button class="icon-button menu-toggle" type="button" data-menu-open aria-label="打开文档导航" aria-haspopup="dialog">
          ${icon('menu')}
        </button>
      </div>
    </div>
    ${readingProgress}
  </header>`;
}

function docNavItems(ctx, activeSlug = '') {
  const { u } = makeContextHelpers(ctx);
  return ctx.docs
    .map(
      (doc, index) => `<a class="doc-nav__item${doc.slug === activeSlug ? ' is-active' : ''}" href="${u(doc.route)}"${doc.slug === activeSlug ? ' aria-current="page"' : ''}>
        <span class="doc-nav__index">${String(index + 1).padStart(2, '0')}</span>
        <span class="doc-nav__copy">
          <strong>${escapeHtml(doc.navTitle || doc.title)}</strong>
          <small>${escapeHtml(doc.category)}</small>
        </span>
      </a>`,
    )
    .join('');
}

function drawer(ctx) {
  const { u, githubUrl } = makeContextHelpers(ctx);
  return `<div class="drawer-layer" data-drawer hidden>
    <button class="drawer-backdrop" type="button" data-menu-close aria-label="关闭导航"></button>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div class="drawer__head">
        <span id="drawer-title" class="eyebrow">FIELD NOTES</span>
        <button class="icon-button" type="button" data-menu-close aria-label="关闭导航">${icon('close')}</button>
      </div>
      <nav class="drawer__nav" aria-label="移动端文档导航">
        <a class="drawer__home${ctx.currentPage === 'home' ? ' is-active' : ''}" href="${u('')}">首页</a>
        <a class="drawer__home${ctx.currentPage === 'library' ? ' is-active' : ''}" href="${u('docs/')}">全部文档</a>
        <p class="drawer__label">笔记</p>
        ${docNavItems(ctx, ctx.currentDoc?.slug)}
      </nav>
      <div class="drawer__foot">
        <button class="button button--block button--outline" type="button" data-search-open aria-haspopup="dialog">
          ${icon('search')} 搜索全文
        </button>
        <div class="drawer__meta">
          ${githubUrl ? `<a href="${escapeAttr(githubUrl)}" target="_blank" rel="noopener noreferrer">${icon('github')} GitHub</a>` : ''}
          <button type="button" data-theme-toggle class="text-button">切换主题</button>
        </div>
      </div>
    </aside>
  </div>`;
}

function searchLayer(ctx) {
  return `<div class="search-layer" data-search-layer hidden>
    <button class="search-backdrop" type="button" data-search-close aria-label="关闭搜索"></button>
    <div class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title" aria-describedby="search-help">
      <div class="search-dialog__head">
        ${icon('search', 'search-dialog__icon')}
        <h2 id="search-title" class="sr-only">搜索文档</h2>
        <label class="sr-only" for="search-input">搜索文档</label>
        <input id="search-input" class="search-dialog__input" type="search" placeholder="搜索标题、标签或正文…" autocomplete="off" autocapitalize="off" spellcheck="false" data-search-input>
        <button class="search-close" type="button" data-search-close>Esc</button>
      </div>
      <div class="search-dialog__body" data-search-results>
        <div class="search-intro" data-search-intro>
          <p id="search-help">搜索全部 Markdown 笔记的标题、章节与正文。</p>
          <div class="search-suggestions" aria-label="推荐搜索">
            <button type="button" data-search-suggestion>VASP</button>
            <button type="button" data-search-suggestion>MLFF</button>
            <button type="button" data-search-suggestion>编译</button>
            <button type="button" data-search-suggestion>Slurm</button>
          </div>
        </div>
      </div>
      <div class="search-dialog__foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span class="search-status" data-search-status aria-live="polite"></span>
      </div>
    </div>
  </div>`;
}

function mobileToc(ctx) {
  if (!ctx.doc?.headings?.length) return '';
  const links = ctx.doc.headings
    .map(
      (heading) =>
        `<a class="toc-link toc-link--h${heading.level}" href="#${escapeAttr(heading.id)}" data-toc-link>${escapeHtml(heading.text)}</a>`,
    )
    .join('');
  return `<details class="mobile-toc">
    <summary>${icon('list')} 本页目录 <span>${ctx.doc.headings.length} 节</span></summary>
    <nav class="mobile-toc__links" aria-label="本页目录">${links}</nav>
  </details>`;
}

function articleToc(ctx) {
  const doc = ctx.doc;
  if (!doc.headings.length) return '';
  const links = doc.headings
    .map(
      (heading) =>
        `<a class="toc-link toc-link--h${heading.level}" href="#${escapeAttr(heading.id)}" data-toc-link>${escapeHtml(heading.text)}</a>`,
    )
    .join('');
  return `<aside class="article-aside">
    <div class="toc-sticky">
      <p class="toc__label">本页目录 <span>ON THIS PAGE</span></p>
      <nav class="toc" aria-label="本页目录">${links}</nav>
      <a class="toc-top" href="#top">${icon('arrowUp')} 回到顶部</a>
    </div>
  </aside>`;
}

function docsSidebar(ctx) {
  return `<aside class="docs-sidebar" aria-label="文档导航">
    <div class="sidebar-sticky">
      <p class="sidebar-label">DOCUMENTATION <span>${String(ctx.docs.length).padStart(2, '0')}</span></p>
      <button class="sidebar-search" type="button" data-search-open aria-haspopup="dialog">
        ${icon('search')}<span>搜索文档</span><kbd>Ctrl K</kbd>
      </button>
      <nav class="doc-nav" aria-label="全部文档">${docNavItems(ctx, ctx.doc.slug)}</nav>
      <a class="sidebar-back" href="${makeContextHelpers(ctx).u('docs/')}">${icon('list')} 返回文档库</a>
    </div>
  </aside>`;
}

function footer(ctx) {
  const { u, githubUrl } = makeContextHelpers(ctx);
  return `<footer class="site-footer">
    <div class="container">
      <div class="site-footer__main">
        <div class="site-footer__brand">
          ${brandMarkup(ctx)}
          <p>${escapeHtml(ctx.site.description)}</p>
        </div>
        <nav class="site-footer__nav" aria-label="页脚导航">
          <p class="footer-label">INDEX</p>
          <a href="${u('')}">首页</a>
          <a href="${u('docs/')}">全部文档</a>
          ${ctx.docs.map((doc) => `<a href="${u(doc.route)}">${escapeHtml(doc.navTitle || doc.title)}</a>`).join('')}
        </nav>
        <div class="site-footer__note">
          <p class="footer-label">COLOPHON</p>
          <p>内容以 Markdown 编写，<br>由 GitHub Pages 发布。</p>
          ${githubUrl ? `<a class="footer-github" href="${escapeAttr(githubUrl)}" target="_blank" rel="noopener noreferrer">${icon('github')} 查看源码</a>` : ''}
        </div>
      </div>
      <div class="site-footer__bottom">
        <p>© ${new Date().getFullYear()} ${escapeHtml(ctx.site.author || ctx.site.title)}</p>
        <p>Markdown <span aria-hidden="true">→</span> HTML</p>
        <a href="#top">回到顶部 ${icon('arrowUp')}</a>
      </div>
    </div>
  </footer>`;
}

function shell(ctx, { title, description, body, pageClass = '', bodyAttributes = '', structuredData = null }) {
  const { u, canonical, githubUrl } = makeContextHelpers(ctx);
  const pageTitle = title || ctx.site.title;
  const metaDescription = description || ctx.site.description;
  const canonicalUrl = canonical(ctx.route);
  const ogImage = '';
  const jsonLd = structuredData
    ? `<script type="application/ld+json">${toSafeJson(structuredData)}</script>`
    : '';

  return `<!doctype html>
<html lang="${escapeAttr(ctx.site.lang || 'zh-CN')}" data-root="${escapeAttr(relativeUrl(ctx.route, ''))}" data-page="${escapeAttr(ctx.currentPage)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(metaDescription)}">
  <meta name="generator" content="material-web">
  <meta name="theme-color" content="#f4f1e8">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="${u('assets/favicon.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${u(`assets/${ctx.assets.css}`)}">
  ${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">` : ''}
  <meta property="og:type" content="${ctx.currentPage === 'article' ? 'article' : 'website'}">
  <meta property="og:site_name" content="${escapeAttr(ctx.site.title)}">
  <meta property="og:title" content="${escapeAttr(pageTitle)}">
  <meta property="og:description" content="${escapeAttr(metaDescription)}">
  ${canonicalUrl ? `<meta property="og:url" content="${escapeAttr(canonicalUrl)}">` : ''}
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ''}
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(pageTitle)}">
  <meta name="twitter:description" content="${escapeAttr(metaDescription)}">
  ${jsonLd}
  <script>
    (() => {
      try {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
      } catch (error) {
        document.documentElement.dataset.theme = 'light';
      }
      document.documentElement.classList.add('js');
    })();
  </script>
</head>
<body id="top" class="page ${pageClass}" ${bodyAttributes}>
  ${header(ctx)}
  ${body}
  ${footer(ctx)}
  ${drawer(ctx)}
  ${searchLayer(ctx)}
  <script src="${u(`assets/${ctx.assets.js}`)}" defer></script>
</body>
</html>`;
}

function documentCard(ctx, doc, index) {
  const { u } = makeContextHelpers(ctx);
  const featured = doc.featured && index === 0;
  return `<article class="doc-card${featured ? ' doc-card--ink' : ''}">
    <a class="doc-card__link" href="${u(doc.route)}">
      <div class="doc-card__top">
        <span class="doc-card__category">${escapeHtml(doc.category)}</span>
        <span class="doc-card__index">${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="doc-card__body">
        <h3>${escapeHtml(doc.title)}</h3>
        <p>${escapeHtml(doc.description)}</p>
      </div>
      <div class="doc-card__footer">
        <div class="tag-list">${doc.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="doc-card__meta">
          <span>${icon('clock')} ${doc.readMinutes} 分钟</span>
          <span class="doc-card__arrow">${icon('arrowUpRight')}</span>
        </div>
      </div>
    </a>
  </article>`;
}

function heroVisual(ctx) {
  return `<div class="hero__visual">
    <figure class="specimen" aria-label="VASP 与 LAMMPS 通过 MLFF 交接的示意图">
      <header class="specimen__head">
        <span><i class="status-dot"></i> FIG. 01 / STRUCTURE</span>
        <span>ML_FF · 001</span>
      </header>
      <div class="specimen__plot">
        <svg class="lattice" viewBox="0 0 520 360" role="img" aria-label="晶格与力场示意图">
          <defs>
            <pattern id="hero-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M26 0H0v26" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="520" height="360" fill="url(#hero-grid)"/>
          <g class="lattice__cell" transform="translate(260 178)">
            <polygon points="-108,-62 0,-124 108,-62 108,62 0,124 -108,62" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 6"/>
            <line x1="-108" y1="-62" x2="108" y2="62" stroke="currentColor" stroke-width=".8" stroke-opacity=".5"/>
            <line x1="0" y1="-124" x2="0" y2="124" stroke="currentColor" stroke-width=".8" stroke-opacity=".5"/>
            <line x1="108" y1="-62" x2="-108" y2="62" stroke="currentColor" stroke-width=".8" stroke-opacity=".5"/>
            <g class="lattice__bonds">
              <path d="M-108-62 0 0 108-62M-108 62 0 0 108 62M0-124 0 0 0 124"/>
            </g>
            <g class="lattice__atoms">
              <circle cx="0" cy="0" r="17" class="atom atom--core"/>
              <circle cx="-108" cy="-62" r="11" class="atom atom--rust"/>
              <circle cx="108" cy="-62" r="11" class="atom atom--rust"/>
              <circle cx="-108" cy="62" r="9" class="atom atom--teal"/>
              <circle cx="108" cy="62" r="9" class="atom atom--teal"/>
              <circle cx="0" cy="-124" r="8" class="atom atom--ink"/>
              <circle cx="0" cy="124" r="8" class="atom atom--ink"/>
            </g>
            <g class="lattice__axis">
              <path d="M-108 62 0 124 108 62" fill="none" stroke="currentColor"/>
            </g>
            <g class="lattice__labels">
              <text x="-118" y="-78">V</text>
              <text x="118" y="-78">L</text>
              <text x="0" y="30">ML_FF</text>
            </g>
          </g>
          <g class="lattice__annotations">
            <path d="M96 58h64M96 54v8M160 54v8" stroke="currentColor"/>
            <text x="102" y="46">a = 4.05 Å</text>
            <path d="M414 280v34M410 314h8" stroke="currentColor"/>
            <text x="426" y="306">γ = 90°</text>
            <text x="24" y="330">FIG. 01 / UNIT CELL</text>
            <text x="392" y="40">001</text>
          </g>
        </svg>
        <div class="specimen__stamp" aria-hidden="true">
          <span>OPEN</span>
          <strong>NOTES</strong>
          <small>2026</small>
        </div>
      </div>
      <figcaption class="specimen__foot">
        <div class="specimen__pipeline">
          <span>VASP</span><i>${icon('arrowRight')}</i><span class="is-accent">ML_FF</span><i>${icon('arrowRight')}</i><span>LAMMPS</span>
        </div>
        <span class="specimen__caption">train · run · analyse</span>
      </figcaption>
    </figure>
  </div>`;
}

function homeBody(ctx) {
  const { u } = makeContextHelpers(ctx);
  const first = ctx.docs[0];
  return `<main id="main">
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__copy">
          <p class="eyebrow"><span class="eyebrow__dot"></span> MATERIALS COMPUTING · FIELD NOTES</p>
          <h1>把计算过程，<br>写成<span class="highlight">可复用</span>的文档。</h1>
          <p class="hero__lede">${escapeHtml(ctx.site.description)}</p>
          <div class="hero__actions">
            <a class="button button--ink" href="${u('docs/')}">浏览全部文档 ${icon('arrowRight')}</a>
            <button class="button button--ghost" type="button" data-search-open aria-haspopup="dialog">${icon('search')} 搜索全文</button>
          </div>
          <dl class="hero__stats">
            <div><dt>文档</dt><dd>${String(ctx.stats.docs).padStart(2, '0')}</dd></div>
            <div><dt>代码片段</dt><dd>${formatNumber(ctx.stats.codeBlocks)}</dd></div>
            <div><dt>阅读时长</dt><dd>${formatNumber(ctx.stats.minutes)}<small>min</small></dd></div>
          </dl>
        </div>
        ${heroVisual(ctx)}
      </div>
    </section>

    <div class="container">
      <div class="rule-bar" aria-label="内容关键词">
        <span class="rule-bar__label">TOPICS</span>
        <span>VASP 6.5.1</span><i></i><span>VTST / VASPml</span><i></i><span>LAMMPS MLFF</span><i></i><span>Slurm</span><i></i><span>Reproducible Notes</span>
        <span class="rule-bar__end">MARKDOWN → HTML</span>
      </div>
    </div>

    <section class="section library-section" id="library">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">01 / FIELD NOTES</p>
            <h2>文档库<span class="section-head__count">${String(ctx.docs.length).padStart(2, '0')}</span></h2>
          </div>
          <p class="section-head__lede">从环境搭建到完整计算流程，<br>按实际踩过的坑整理。</p>
        </div>
        <div class="doc-grid">
          ${ctx.docs.map((doc, index) => documentCard(ctx, doc, index)).join('')}
        </div>
        <div class="section-foot">
          <p>所有文档均可全文搜索，支持键盘导航。</p>
          <button class="text-link" type="button" data-search-open aria-haspopup="dialog">打开搜索 ${icon('arrowUpRight')}</button>
        </div>
      </div>
    </section>

    <section class="manifesto" id="about">
      <div class="container manifesto__grid">
        <div class="manifesto__title">
          <p class="eyebrow">02 / ABOUT THE NOTES</p>
          <h2>能复现的步骤，<br>才值得记录。</h2>
          <span class="manifesto__mark" aria-hidden="true">M</span>
        </div>
        <div class="manifesto__copy">
          <p>这里收录 VASP、LAMMPS 与机器学习力场相关的实践记录：安装时改过哪些文件、编译报错怎么定位、一次 MLFF 训练如何从 train 走到 run。</p>
          <p>内容来自 <code>resource/</code> 中的 Markdown。每次推送都会自动转换为 HTML，发布到 GitHub Pages。</p>
          <div class="terminal" aria-label="静态站点构建示意">
            <div class="terminal__bar"><span class="terminal__dots"><i></i><i></i><i></i></span><span>material-web / build</span></div>
            <pre><code><span class="t-prompt">$</span> tree resource
<span class="t-muted">resource</span>
├── VASP-LAMMPS-安装报告与教程.md
└── vasp-lammps计算流程.md

<span class="t-prompt">$</span> npm run build
<span class="t-ok">✓</span> ${ctx.stats.docs} notes → HTML
<span class="t-ok">✓</span> deployed by GitHub Actions</code></pre>
          </div>
          ${first ? `<a class="text-link manifesto__link" href="${u(first.route)}">从最长的一篇开始 ${icon('arrowRight')}</a>` : ''}
        </div>
      </div>
    </section>
  </main>`;
}

export function renderHome(ctx) {
  const first = ctx.docs[0];
  const canonicalHome = makeContextHelpers(ctx).canonical('');
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ctx.site.title,
    description: ctx.site.description,
    inLanguage: ctx.site.lang,
    ...(canonicalHome ? { url: canonicalHome } : {}),
    ...(ctx.site.author ? { author: { '@type': 'Person', name: ctx.site.author } } : {}),
  };
  return shell(ctx, {
    title: `${ctx.site.title} — ${ctx.site.tagline || 'Materials Notes'}`,
    description: ctx.site.description,
    body: homeBody(ctx),
    pageClass: 'page-home',
    structuredData,
  });
}

function libraryRow(ctx, doc, index) {
  const { u } = makeContextHelpers(ctx);
  return `<li>
    <a class="index-row" href="${u(doc.route)}">
      <span class="index-row__number">${String(index + 1).padStart(2, '0')}</span>
      <div class="index-row__main">
        <div class="index-row__meta">
          <span>${escapeHtml(doc.category)}</span>
          ${doc.updated ? `<i></i><span>更新于 ${formatDate(doc.updated)}</span>` : ''}
        </div>
        <h2>${escapeHtml(doc.title)}</h2>
        <p>${escapeHtml(doc.description)}</p>
        <div class="tag-list">${doc.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      </div>
      <div class="index-row__side">
        <span>${icon('clock')} ${doc.readMinutes} min</span>
        <span class="index-row__arrow">${icon('arrowRight')}</span>
      </div>
    </a>
  </li>`;
}

export function renderLibrary(ctx) {
  const { u } = makeContextHelpers(ctx);
  const libraryUrl = makeContextHelpers(ctx).canonical('docs/');
  const body = `<main id="main">
    <section class="library-hero">
      <div class="container">
        <div class="library-hero__top">
          <div>
            <p class="eyebrow">INDEX / 全部文档</p>
            <h1>文档库<span class="library-hero__count">${String(ctx.docs.length).padStart(2, '0')}</span></h1>
          </div>
          <div class="library-hero__intro">
            <p>${escapeHtml(ctx.site.description)}</p>
            <div class="library-hero__tools">
              <span>${icon('book')} ${ctx.stats.docs} 篇 · ${formatNumber(ctx.stats.minutes)} 分钟阅读</span>
              <button class="button button--ghost button--small" type="button" data-search-open aria-haspopup="dialog">${icon('search')} 全文搜索</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="library-index">
      <div class="container">
        <ol class="index-list">
          ${ctx.docs.map((doc, index) => libraryRow(ctx, doc, index)).join('')}
        </ol>
        <div class="search-cta">
          <div>
            <p class="eyebrow">SEARCH / 全文检索</p>
            <h2>记不住在哪一节？<br>直接搜。</h2>
          </div>
          <button class="search-cta__button" type="button" data-search-open aria-haspopup="dialog">
            ${icon('search')}
            <span>搜索标题、标签或正文</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        <div class="library-back">
          <a class="text-link" href="${u('')}">${icon('chevronLeft')} 返回首页</a>
        </div>
      </div>
    </section>
  </main>`;

  return shell(ctx, {
    title: `文档库 · ${ctx.site.title}`,
    description: `浏览 ${ctx.site.title} 的全部文档。${ctx.site.description}`,
    body,
    pageClass: 'page-library',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `文档库 · ${ctx.site.title}`,
      description: ctx.site.description,
      inLanguage: ctx.site.lang,
      ...(libraryUrl ? { url: libraryUrl } : {}),
      hasPart: ctx.docs.map((doc) => {
        const docUrl = makeContextHelpers(ctx).canonical(doc.route);
        return {
          '@type': 'TechArticle',
          headline: doc.title,
          ...(docUrl ? { url: docUrl } : {}),
        };
      }),
    },
  });
}

function articleHeader(ctx) {
  const { u } = makeContextHelpers(ctx);
  const doc = ctx.doc;
  return `<header class="article-header">
    <nav class="breadcrumb" aria-label="面包屑">
      <a href="${u('')}">首页</a>${icon('chevronRight')}
      <a href="${u('docs/')}">文档库</a>${icon('chevronRight')}
      <span aria-current="page">${escapeHtml(doc.category)}</span>
    </nav>
    <p class="eyebrow"><span class="eyebrow__dot"></span> ${escapeHtml(doc.category)} / NOTE ${String(doc.index + 1).padStart(2, '0')}</p>
    <h1>${escapeHtml(doc.title)}</h1>
    <p class="article-header__lede">${escapeHtml(doc.description)}</p>
    <div class="article-meta">
      <span>${icon('clock')} 约 ${doc.readMinutes} 分钟</span>
      <span>${icon('hash')} ${doc.headings.length} 个章节</span>
      <span>${icon('terminal')} ${doc.codeBlocks} 个代码片段</span>
      ${doc.updated ? `<span>更新于 ${formatDate(doc.updated)}</span>` : ''}
    </div>
    <div class="article-tags">${doc.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
  </header>`;
}

function articleEndnote(ctx) {
  const { u, editUrl, githubUrl } = makeContextHelpers(ctx);
  const doc = ctx.doc;
  const edit = editUrl(doc);
  return `<footer class="article-footer">
    <div class="article-source">
      <div>
        <span class="footer-label">SOURCE</span>
        <p>${icon('file')} <code>${escapeHtml(doc.sourceRelative)}</code></p>
        <p class="article-source__hint">本文由 Markdown 自动构建为 HTML${doc.updated ? `，最后更新于 ${formatDate(doc.updated)}` : ''}。</p>
      </div>
      <div class="article-source__actions">
        ${edit ? `<a class="text-link" href="${escapeAttr(edit)}" target="_blank" rel="noopener noreferrer">${icon('edit')} 在 GitHub 编辑</a>` : ''}
        ${!edit && githubUrl ? `<a class="text-link" href="${escapeAttr(githubUrl)}" target="_blank" rel="noopener noreferrer">${icon('github')} 查看仓库</a>` : ''}
        <a class="text-link" href="${u('docs/')}">${icon('list')} 返回文档库</a>
      </div>
    </div>
    ${articlePager(ctx)}
  </footer>`;
}

function articlePager(ctx) {
  const { u } = makeContextHelpers(ctx);
  const index = ctx.docs.findIndex((doc) => doc.slug === ctx.doc.slug);
  const previous = index > 0 ? ctx.docs[index - 1] : null;
  const next = index < ctx.docs.length - 1 ? ctx.docs[index + 1] : null;
  if (!previous && !next) return '';
  const single = !previous || !next;
  return `<nav class="article-pager${single ? ' article-pager--single' : ''}" aria-label="上一篇与下一篇">
    ${previous
      ? `<a class="pager-card pager-card--prev" href="${u(previous.route)}">
          <span class="pager-card__label">${icon('chevronLeft')} 上一篇</span>
          <strong>${escapeHtml(previous.title)}</strong>
          <small>${escapeHtml(previous.category)}</small>
        </a>`
      : '<span class="pager-card pager-card--empty"></span>'}
    ${next
      ? `<a class="pager-card pager-card--next" href="${u(next.route)}">
          <span class="pager-card__label">下一篇 ${icon('chevronRight')}</span>
          <strong>${escapeHtml(next.title)}</strong>
          <small>${escapeHtml(next.category)}</small>
        </a>`
      : '<span class="pager-card pager-card--empty"></span>'}
  </nav>`;
}

function articleBody(ctx) {
  const doc = ctx.doc;
  return `<main id="main" class="article-main">
    <div class="container reading-layout">
      ${docsSidebar(ctx)}
      <article class="article">
        ${articleHeader(ctx)}
        ${mobileToc(ctx)}
        <div class="article-content" id="article-content">
          ${doc.html}
        </div>
        ${articleEndnote(ctx)}
      </article>
      ${articleToc(ctx)}
    </div>
  </main>`;
}

export function renderArticle(ctx) {
  const { canonical } = makeContextHelpers(ctx);
  const articleUrl = canonical(ctx.route);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: ctx.doc.title,
    description: ctx.doc.description,
    inLanguage: ctx.site.lang,
    ...(articleUrl ? { url: articleUrl } : {}),
    ...(ctx.doc.updated ? { dateModified: ctx.doc.updated } : {}),
    ...(ctx.site.author
      ? { author: { '@type': 'Person', name: ctx.site.author } }
      : {}),
    publisher: { '@type': 'Organization', name: ctx.site.title },
  };
  return shell(ctx, {
    title: `${ctx.doc.title} · ${ctx.site.title}`,
    description: ctx.doc.description,
    body: articleBody(ctx),
    pageClass: 'page-article',
    structuredData,
  });
}

export function renderNotFound(ctx) {
  const { u } = makeContextHelpers(ctx);
  const body = `<main id="main" class="not-found">
    <div class="container">
      <p class="eyebrow">404 / NOT FOUND</p>
      <h1>这一页还没有写完。</h1>
      <p>链接可能已经移动，或者地址里有一个小错误。</p>
      <a class="button button--ink" href="${u('docs/')}">返回文档库 ${icon('arrowRight')}</a>
    </div>
  </main>`;
  return shell(ctx, {
    title: `页面未找到 · ${ctx.site.title}`,
    description: '页面未找到',
    body,
    pageClass: 'page-not-found',
  });
}

export { brandMarkup };
