(() => {
  'use strict';

  const root = document.documentElement.dataset.root || './';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const body = document.body;
  const header = $('[data-site-header]');
  const main = $('#main');
  const footer = $('.site-footer');
  const drawer = $('[data-drawer]');
  const searchLayer = $('[data-search-layer]');
  const searchDialog = $('.search-dialog');
  const searchInput = $('[data-search-input]');
  const searchResults = $('[data-search-results]');
  const searchIntro = $('[data-search-intro]');
  const searchStatus = $('[data-search-status]');
  const progress = $('[data-reading-progress]');

  let menuTrigger = null;
  let searchTrigger = null;
  let searchIndex = null;
  let searchIndexPromise = null;
  let searchMatches = [];
  let selectedResult = 0;
  let searchRenderFrame = 0;

  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') ||
    /Mac OS X/.test(navigator.userAgent || '');
  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  $$('.search-trigger__key, .sidebar-search kbd, .search-cta__button kbd').forEach((element) => {
    element.textContent = shortcut;
  });

  /* ---------- theme ---------- */

  const themeMeta = $('meta[name="theme-color"]');
  const themeButtons = $$('[data-theme-toggle]');

  function savedTheme() {
    try {
      const value = localStorage.getItem('theme');
      return value === 'light' || value === 'dark' ? value : '';
    } catch {
      return '';
    }
  }

  function applyTheme(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem('theme', theme);
      } catch {
        /* Storage can be unavailable in private contexts. */
      }
    }
    if (themeMeta) themeMeta.content = theme === 'dark' ? '#0f1512' : '#f4f1e8';
    themeButtons.forEach((button) => {
      const label = theme === 'dark' ? '切换浅色模式' : '切换深色模式';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
  }

  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  });

  const colorMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const handleColorChange = (event) => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', handleColorChange);

  /* ---------- generic helpers ---------- */

  function focusableElements(container) {
    return $$(
      'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      container,
    ).filter((element) => element.getClientRects().length > 0);
  }

  function trapFocus(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function syncLock() {
    const searchOpen = searchLayer && !searchLayer.hidden;
    const drawerOpen = drawer && !drawer.hidden;
    body.classList.toggle('is-locked', Boolean(searchOpen || drawerOpen));
    [header, main, footer].forEach((element) => {
      if (element) element.inert = Boolean(searchOpen || drawerOpen);
    });
    if (drawer) drawer.inert = Boolean(searchOpen);
  }

  function setExpanded(selector, value) {
    $$(selector).forEach((element) => element.setAttribute('aria-expanded', String(value)));
  }

  /* ---------- mobile drawer ---------- */

  function openDrawer(trigger) {
    if (!drawer) return;
    menuTrigger = trigger || document.activeElement;
    drawer.hidden = false;
    syncLock();
    setExpanded('[data-menu-open]', true);
    const first = $('.drawer [data-menu-close]', drawer) || $('.drawer a', drawer);
    window.requestAnimationFrame(() => first?.focus());
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    setExpanded('[data-menu-open]', false);
    syncLock();
    if (restoreFocus && menuTrigger) menuTrigger.focus();
  }

  $$('[data-menu-open]').forEach((button) => {
    button.addEventListener('click', () => openDrawer(button));
  });

  $$('[data-menu-close]').forEach((button) => {
    button.addEventListener('click', () => closeDrawer());
  });

  if (drawer) {
    drawer.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') trapFocus(event, drawer);
    });
  }

  /* ---------- search ---------- */

  function isSearchOpen() {
    return Boolean(searchLayer && !searchLayer.hidden);
  }

  function setSearchStatus(message) {
    if (searchStatus) searchStatus.textContent = message || '';
  }

  function showSearchIntro() {
    if (!searchResults || !searchIntro) return;
    searchResults.replaceChildren(searchIntro);
    searchMatches = [];
    selectedResult = 0;
    setSearchStatus('');
  }

  function showSearchMessage(message) {
    if (!searchResults) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'search-message';
    wrapper.textContent = message;
    searchResults.replaceChildren(wrapper);
    searchMatches = [];
    selectedResult = 0;
  }

  function loadSearchIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchIndexPromise) return searchIndexPromise;

    searchIndexPromise = fetch(new URL(`${root}search-index.json`, document.baseURI).href, {
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        searchIndex = Array.isArray(data) ? data : [];
        return searchIndex;
      })
      .catch((error) => {
        searchIndexPromise = null;
        throw error;
      });

    return searchIndexPromise;
  }

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getSearchTerms(query) {
    return normalize(query)
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function buildSnippet(entry, terms) {
    const text = String(entry.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const normalizedText = normalize(text);
    let firstMatch = -1;
    for (const term of terms) {
      const index = normalizedText.indexOf(term);
      if (index !== -1 && (firstMatch === -1 || index < firstMatch)) firstMatch = index;
    }
    const start = Math.max(0, (firstMatch === -1 ? 0 : firstMatch) - 42);
    const end = Math.min(text.length, start + 150);
    return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
  }

  function appendHighlighted(element, text, terms) {
    if (!terms.length) {
      element.textContent = text;
      return;
    }
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu');
    const pieces = String(text).split(pattern);
    pieces.forEach((piece, index) => {
      if (!piece) return;
      if (index % 2 === 1) {
        const mark = document.createElement('mark');
        mark.textContent = piece;
        element.append(mark);
      } else {
        element.append(document.createTextNode(piece));
      }
    });
  }

  function scoreEntry(entry, terms, phrase) {
    const title = normalize(entry.title);
    const heading = normalize(entry.heading);
    const category = normalize(entry.category);
    const tags = normalize((entry.tags || []).join(' '));
    const text = normalize(entry.text);
    const haystack = `${title} ${heading} ${category} ${tags} ${text}`;

    if (!terms.every((term) => haystack.includes(term))) return -1;

    let score = 0;
    for (const term of terms) {
      if (heading.includes(term)) score += 18;
      if (title.includes(term)) score += 10;
      if (tags.includes(term)) score += 7;
      if (category.includes(term)) score += 3;
      if (text.includes(term)) score += 1;
    }
    if (phrase && heading.includes(phrase)) score += 28;
    if (phrase && title.includes(phrase)) score += 18;
    return score;
  }

  function updateSelection(nextIndex) {
    if (!searchMatches.length) return;
    selectedResult = (nextIndex + searchMatches.length) % searchMatches.length;
    $$('.search-result', searchResults).forEach((item, index) => {
      item.classList.toggle('is-selected', index === selectedResult);
      if (index === selectedResult) item.scrollIntoView({ block: 'nearest' });
    });
    setSearchStatus(`${selectedResult + 1} / ${searchMatches.length}`);
  }

  function renderSearchResults(query) {
    if (!searchResults || !searchInput) return;
    const terms = getSearchTerms(query);
    if (!terms.length) {
      showSearchIntro();
      return;
    }

    const phrase = normalize(query).trim();
    const found = (searchIndex || [])
      .map((entry) => ({ entry, score: scoreEntry(entry, terms, phrase) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'zh-CN'))
      .slice(0, 30);

    if (!found.length) {
      showSearchMessage(`没有找到与“${query.trim()}”相关的内容。试试更短的关键词。`);
      setSearchStatus('0 个结果');
      return;
    }

    const list = document.createElement('ul');
    list.className = 'search-results';
    searchMatches = [];

    found.forEach(({ entry }, index) => {
      const item = document.createElement('li');
      item.className = `search-result${index === 0 ? ' is-selected' : ''}`;
      const link = document.createElement('a');
      link.href = `${root}${entry.url}`;

      const top = document.createElement('div');
      top.className = 'search-result__top';
      const title = document.createElement('span');
      title.className = 'search-result__heading';
      appendHighlighted(title, entry.heading || entry.title, terms);
      const doc = document.createElement('span');
      doc.className = 'search-result__doc';
      doc.textContent = `${entry.title} · ${entry.category}`;
      top.append(title, doc);

      const snippet = document.createElement('p');
      snippet.className = 'search-result__snippet';
      appendHighlighted(snippet, buildSnippet(entry, terms), terms);

      link.append(top, snippet);
      item.append(link);
      item.addEventListener('mouseenter', () => updateSelection(index));
      list.append(item);
      searchMatches.push({ entry, link });
    });

    searchResults.replaceChildren(list);
    selectedResult = 0;
    setSearchStatus(`${found.length} 个结果`);
  }

  function queueSearchRender() {
    window.cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = window.requestAnimationFrame(() => {
      if (!searchInput) return;
      const query = searchInput.value;
      if (!query.trim()) {
        showSearchIntro();
        return;
      }
      if (!searchIndex) {
        showSearchMessage('正在载入搜索索引…');
        loadSearchIndex()
          .then(() => renderSearchResults(searchInput.value))
          .catch(() => showSearchMessage('搜索索引加载失败，请刷新页面后重试。'));
        return;
      }
      renderSearchResults(query);
    });
  }

  function openSearch(trigger) {
    if (!searchLayer || !searchInput) return;
    const openedFromDrawer = Boolean(trigger?.closest?.('[data-drawer]'));
    if (drawer && !drawer.hidden) closeDrawer({ restoreFocus: false });
    searchTrigger = openedFromDrawer
      ? $('.search-trigger') || $('[data-menu-open]')
      : trigger || document.activeElement;
    searchLayer.hidden = false;
    syncLock();
    setExpanded('[data-search-open]', true);
    document.documentElement.classList.add('search-is-open');

    loadSearchIndex()
      .then(() => {
        if (isSearchOpen() && searchInput.value.trim()) renderSearchResults(searchInput.value);
      })
      .catch(() => {
        if (isSearchOpen() && !searchInput.value.trim()) {
          showSearchMessage('搜索索引加载失败，请确认站点通过本地服务器或 GitHub Pages 访问。');
        }
      });

    window.requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.select();
      if (!searchInput.value.trim()) showSearchIntro();
    });
  }

  function closeSearch({ restoreFocus = true } = {}) {
    if (!searchLayer || searchLayer.hidden) return;
    searchLayer.hidden = true;
    document.documentElement.classList.remove('search-is-open');
    setExpanded('[data-search-open]', false);
    syncLock();
    if (restoreFocus && searchTrigger) searchTrigger.focus();
  }

  $$('[data-search-open]').forEach((button) => {
    button.addEventListener('click', () => openSearch(button));
  });

  $$('[data-search-close]').forEach((button) => {
    button.addEventListener('click', () => closeSearch());
  });

  if (searchLayer) {
    searchLayer.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' && searchDialog) trapFocus(event, searchDialog);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', queueSearchRender);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        updateSelection(selectedResult + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        updateSelection(selectedResult - 1);
      } else if (event.key === 'Enter' && searchMatches[selectedResult]) {
        event.preventDefault();
        window.location.href = searchMatches[selectedResult].link.href;
      }
    });
  }

  $$('[data-search-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = button.textContent.trim();
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.focus();
    });
  });

  /* ---------- global keyboard ---------- */

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof Element &&
      (target.matches('input, textarea, select') || target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (isSearchOpen()) closeSearch();
      else openSearch(document.activeElement);
      return;
    }

    if (event.key === '/' && !isTyping && !isSearchOpen() && (!drawer || drawer.hidden)) {
      event.preventDefault();
      openSearch(document.activeElement);
      return;
    }

    if (event.key === 'Escape') {
      if (isSearchOpen()) {
        event.preventDefault();
        closeSearch();
      } else if (drawer && !drawer.hidden) {
        event.preventDefault();
        closeDrawer();
      }
    }
  });

  /* ---------- copy buttons ---------- */

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy failed');
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-copy-code]');
    if (!button) return;
    const block = button.closest('.code-block');
    const code = block?.querySelector('pre code');
    if (!code) return;
    const label = button.querySelector('.code-copy__label');

    copyText(code.textContent)
      .then(() => {
        button.classList.add('is-copied');
        button.setAttribute('aria-label', '已复制');
        if (label) label.textContent = '已复制';
        window.clearTimeout(button._copyTimer);
        button._copyTimer = window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.setAttribute('aria-label', '复制代码');
          if (label) label.textContent = '复制';
        }, 1800);
      })
      .catch(() => {
        if (label) label.textContent = '复制失败';
        window.clearTimeout(button._copyTimer);
        button._copyTimer = window.setTimeout(() => {
          if (label) label.textContent = '复制';
        }, 1800);
      });
  });

  /* ---------- reading progress and TOC ---------- */

  const tocLinks = $$('[data-toc-link]');
  const tocByTarget = new Map();
  tocLinks.forEach((link) => {
    const target = link.getAttribute('href')?.slice(1);
    if (!target) return;
    if (!tocByTarget.has(target)) tocByTarget.set(target, []);
    tocByTarget.get(target).push(link);
  });
  const articleContent = $('#article-content');
  const headings = articleContent
    ? $$('h2[id], h3[id]', articleContent).filter((heading) => tocByTarget.has(heading.id))
    : [];
  let activeHeadingId = '';

  function updateToc() {
    if (!headings.length) return;
    let current = headings[0].id;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 140) current = heading.id;
      else break;
    }
    const documentHeight = document.documentElement.scrollHeight;
    if (window.scrollY + window.innerHeight >= documentHeight - 4) {
      current = headings[headings.length - 1].id;
    }
    if (current === activeHeadingId) return;
    activeHeadingId = current;
    tocByTarget.forEach((links, target) => {
      links.forEach((link) => link.classList.toggle('is-active', target === current));
    });
  }

  function updateProgress() {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    progress.style.transform = `scaleX(${ratio})`;
  }

  let scrollFrame = 0;
  function handleScroll() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
      updateProgress();
      updateToc();
    });
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  handleScroll();
  updateToc();

  tocLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const details = link.closest('.mobile-toc');
      if (details) details.open = false;
    });
  });

  /* ---------- close overlays when the page is hidden ---------- */

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (isSearchOpen()) closeSearch({ restoreFocus: false });
      if (drawer && !drawer.hidden) closeDrawer({ restoreFocus: false });
    }
  });
})();
