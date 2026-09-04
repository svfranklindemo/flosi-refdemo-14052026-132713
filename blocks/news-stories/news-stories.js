// news-stories: Instagram-style "highlights" + fullscreen story viewer.
// Highlights row = "Latest" + one circle per category.
// Click a highlight → fullscreen stories (image + title + read button, auto-advancing).
// Data source mirrors news-feed/news-featured:
//   Author runtime → GraphQL persisted query; Edge runtime → static /news-data.json.

const LATEST_KEY = '__latest__';

function createElement(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

function isAuthorRuntime() {
  return (window?.location?.hostname || '').includes('author');
}

function isEdgeRuntime() {
  const h = window?.location?.hostname || '';
  return h.endsWith('.aem.page') || h.endsWith('.aem.live');
}

function getConfigValue(valueCell) {
  const link = valueCell?.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell?.textContent || '').trim();
}

function normalizeConfigKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeFolderPath(path) {
  return String(path || '').trim().replace(/\.json$/i, '').replace(/\/+$/g, '');
}

function readFieldValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') {
    return field.value || field.plaintext || field.html || field.path || field._path || '';
  }
  return '';
}

function calendarMeta(item, name) {
  const entries = Array.isArray(item?._metadata?.calendarMetadata)
    ? item._metadata.calendarMetadata : [];
  return entries.find((e) => e?.name === name)?.value || '';
}

function extractGraphqlItems(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  const key = Object.keys(data).find((k) => k.endsWith('List') || k.endsWith('Paginated'));
  if (!key) return [];
  return Array.isArray(data[key]?.items) ? data[key].items : [];
}

function extractNews(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  const createdAt = calendarMeta(item, 'cq:lastModified')
    || String(item.updatedAt || item.publishedAt || item.createdAt || item._createdAt || '').trim();
  return {
    id: item._path || item._id || title,
    title,
    description: readFieldValue(item.description) || '',
    category: readFieldValue(item.category) || '',
    slug: String(item.slug || '').trim(),
    image: readFieldValue(item.media) || '',
    createdAt,
  };
}

function sortNewsNewestFirst(items) {
  const hasDates = items.some((n) => n.createdAt);
  if (!hasDates) return items;
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return bTime - aTime;
  });
}

function buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, folderPath) {
  const persisted = String(persistedQueryPath || '').trim().replace(/^\/+/, '');
  if (!persisted) return '';
  const folder = normalizeFolderPath(folderPath);
  const base = String(graphqlEndpoint || '').trim().replace(/\/+$/g, '');
  if (!base) return '';
  if (base.includes('/graphql/execute.json')) {
    return `${base}/${persisted};path=${folder}`;
  }
  return `${base}/graphql/execute.json/${persisted};path=${folder}`;
}

async function fetchFromGraphql(folderPath, authorGraphqlEndpoint, persistedQueryPath) {
  const base = String(authorGraphqlEndpoint || window.location.origin).trim();
  const gqlUrl = buildGraphqlUrl(base, persistedQueryPath, folderPath);
  if (!gqlUrl) return [];
  const res = await fetch(gqlUrl);
  if (!res.ok) return [];
  const payload = await res.json();
  return extractGraphqlItems(payload).map(extractNews).filter(Boolean);
}

async function fetchFromStaticJson(edgeDataPath) {
  const path = String(edgeDataPath || '/news-data.json').trim() || '/news-data.json';
  const url = new URL(path, window.location.origin);
  url.searchParams.set('ts', `${Date.now()}`);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) return [];
  const payload = await res.json();
  const raw = Array.isArray(payload?.items) ? payload.items : extractGraphqlItems(payload);
  return raw.map(extractNews).filter(Boolean);
}

// Same link-resolution strategy as news-feed (locale-aware, author + edge).
function resolveNewsLink(slug, detailBasePath) {
  if (!slug) return '#';
  if (/^https?:\/\//i.test(slug)) return slug;
  if (slug.startsWith('/')) return slug;
  const cleanSlug = slug.replace(/^\//, '');
  const rawBase = (detailBasePath || '/news').trim();

  const withSlugQuery = (baseUrl) => {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}slug=${encodeURIComponent(cleanSlug)}`;
  };

  if (isAuthorRuntime()) {
    const pagePath = window.location.pathname.replace(/\/+$/, '');
    const pageName = pagePath.split('/').pop() || '';
    const pageNameNoExt = pageName.replace(/\.html$/i, '');
    const parent = pagePath.substring(0, pagePath.lastIndexOf('/') + 1);
    const detailSegments = rawBase.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const detailName = detailSegments[detailSegments.length - 1] || 'news';
    if (rawBase.includes('.html') || rawBase.startsWith('/content/')) {
      return withSlugQuery(rawBase);
    }
    if (!parent.endsWith(`/${pageNameNoExt}/`) && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(pageNameNoExt)) {
      return withSlugQuery(`${parent}${pageNameNoExt}/${detailName}.html`);
    }
    return withSlugQuery(`${parent}${detailName}.html`);
  }

  const currentPath = window.location.pathname.replace(/\/+$/, '');
  const pathSegments = currentPath.split('/').filter(Boolean);
  const firstSeg = pathSegments[0] || '';
  const lastSeg = pathSegments[pathSegments.length - 1] || '';
  const htmlLang = (document?.documentElement?.lang || '').toLowerCase().trim();
  const langFallback = htmlLang.split('-')[0] || '';
  const localeSegment = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(firstSeg)
    ? firstSeg
    : (lastSeg.match(/^([a-z]{2}(?:-[a-z]{2})?)$/i)?.[1]
      || (langFallback.match(/^[a-z]{2}$/i)?.[0] || ''));
  let finalBase = rawBase.replace(/\/+$/g, '') || '/news';

  if (finalBase.startsWith('/content/')) {
    const name = finalBase.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '') || 'news';
    finalBase = localeSegment ? `/${localeSegment}/${name}` : `/${name}`;
  }

  finalBase = finalBase.replace(/\.html$/i, '');
  const baseSegments = finalBase.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (finalBase.startsWith('/') && baseSegments.length === 1 && localeSegment) {
    finalBase = `/${localeSegment}/${baseSegments[0]}`;
  } else if (!finalBase.startsWith('/')) {
    finalBase = `/${localeSegment}/${finalBase}`.replace(/\/{2,}/g, '/');
  }

  return withSlugQuery(finalBase);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - Date.parse(dateStr);
  if (Number.isNaN(diff) || diff < 0) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

// ── Grouping ────────────────────────────────────────────────────────────────
function buildGroups(items, config) {
  const sorted = sortNewsNewestFirst(items);
  const groups = [];

  // "Latest" highlight — newest across all categories.
  if (sorted.length) {
    groups.push({
      key: LATEST_KEY,
      label: config.latestLabel,
      category: '',
      items: sorted.slice(0, config.maxPerStory),
    });
  }

  // Categories: explicit list (config order) or auto-derived from data (newest-first order).
  let { categories } = config;
  if (!categories.length) {
    const seen = new Set();
    categories = [];
    sorted.forEach((n) => {
      const cat = (n.category || '').trim();
      const norm = cat.toLowerCase();
      if (cat && !seen.has(norm)) { seen.add(norm); categories.push(cat); }
    });
  }

  categories.forEach((cat) => {
    const catItems = sorted
      .filter((n) => (n.category || '').toLowerCase() === cat.toLowerCase())
      .slice(0, config.maxPerStory);
    if (catItems.length) {
      groups.push({
        key: cat.toLowerCase(), label: cat, category: cat, items: catItems,
      });
    }
  });

  return groups;
}

// ── Highlights row ──────────────────────────────────────────────────────────
function renderHighlights(groups, block, openViewer) {
  const row = createElement('div', 'news-stories-highlights');
  groups.forEach((group, index) => {
    const cover = group.items.find((n) => n.image)?.image || '';
    const btn = createElement('button', 'news-stories-highlight');
    btn.type = 'button';
    btn.dataset.category = (group.category || 'latest').toLowerCase();
    btn.setAttribute('aria-label', `Open stories: ${group.label}`);

    const ring = createElement('span', 'news-stories-ring');
    const thumb = createElement('span', 'news-stories-thumb');
    if (cover) {
      const img = document.createElement('img');
      img.src = cover;
      img.alt = '';
      img.loading = 'lazy';
      thumb.append(img);
    } else {
      thumb.textContent = (group.label || '?').charAt(0).toUpperCase();
      thumb.classList.add('is-placeholder');
    }
    ring.append(thumb);

    const label = createElement('span', 'news-stories-highlight-label');
    label.textContent = group.label;

    btn.append(ring, label);
    btn.addEventListener('click', () => openViewer(index, 0));
    row.append(btn);
  });
  block.append(row);
}

// ── Fullscreen viewer ───────────────────────────────────────────────────────
function createViewer(groups, config, block) {
  const overlay = createElement('div', 'news-stories-viewer');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="news-stories-stage" data-category="">
      <div class="news-stories-progress"></div>
      <div class="news-stories-topbar">
        <span class="news-stories-topbar-label"></span>
        <button type="button" class="news-stories-close" aria-label="Close stories">&times;</button>
      </div>
      <div class="news-stories-slide">
        <img class="news-stories-slide-img" alt="" />
        <div class="news-stories-slide-body">
          <span class="news-stories-slide-cat news-cat-badge"></span>
          <p class="news-stories-slide-title"></p>
          <span class="news-stories-slide-meta"></span>
          <a class="news-stories-read" href="#">Read article &rarr;</a>
        </div>
      </div>
      <button type="button" class="news-stories-nav news-stories-prev" aria-label="Previous"></button>
      <button type="button" class="news-stories-nav news-stories-next" aria-label="Next"></button>
    </div>
  `;
  block.append(overlay);

  const stage = overlay.querySelector('.news-stories-stage');
  const progress = overlay.querySelector('.news-stories-progress');
  const topLabel = overlay.querySelector('.news-stories-topbar-label');
  const img = overlay.querySelector('.news-stories-slide-img');
  const catBadge = overlay.querySelector('.news-stories-slide-cat');
  const titleEl = overlay.querySelector('.news-stories-slide-title');
  const metaEl = overlay.querySelector('.news-stories-slide-meta');
  const readLink = overlay.querySelector('.news-stories-read');

  const state = {
    g: 0, i: 0, timer: null, paused: false, openedAt: 0,
  };

  // The tap that opens the viewer lands under the cursor, on top of the nav
  // zones/backdrop. Ignore in-viewer taps fired right after opening.
  function justOpened() {
    return Date.now() - state.openedAt < 300;
  }

  function clearTimer() {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  }

  function close() {
    clearTimer();
    overlay.hidden = true;
    overlay.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    // onKey is a hoisted function declaration defined below.
    // eslint-disable-next-line no-use-before-define
    document.removeEventListener('keydown', onKey);
  }

  function renderProgress(group) {
    progress.innerHTML = '';
    group.items.forEach((_, idx) => {
      const seg = createElement('span', 'news-stories-seg');
      const fill = createElement('span', 'news-stories-seg-fill');
      if (idx < state.i) fill.classList.add('is-done');
      seg.append(fill);
      progress.append(seg);
    });
  }

  function startTimer(fill) {
    clearTimer();
    if (!fill) return;
    // Restart CSS transition for the active segment.
    fill.style.transition = 'none';
    fill.style.width = '0%';
    // Force reflow so the next transition takes effect.
    // eslint-disable-next-line no-unused-expressions
    fill.offsetWidth;
    fill.style.transition = `width ${config.storyDuration}ms linear`;
    fill.style.width = '100%';
    // next is a hoisted function declaration defined below.
    // eslint-disable-next-line no-use-before-define
    state.timer = setTimeout(() => next(), config.storyDuration);
  }

  function render() {
    const group = groups[state.g];
    if (!group) { close(); return; }
    const news = group.items[state.i];
    if (!news) { close(); return; }

    stage.dataset.category = (group.category || 'latest').toLowerCase();
    topLabel.textContent = group.label;

    img.src = news.image || '';
    img.style.display = news.image ? '' : 'none';

    const cat = news.category || '';
    catBadge.textContent = cat;
    catBadge.dataset.category = cat.toLowerCase();
    catBadge.style.display = cat ? '' : 'none';

    titleEl.textContent = news.title;
    const ago = timeAgo(news.createdAt);
    metaEl.textContent = ago;
    metaEl.style.display = ago ? '' : 'none';
    readLink.href = resolveNewsLink(news.slug, config.detailBasePath);

    renderProgress(group);
    const activeFill = progress.children[state.i]?.querySelector('.news-stories-seg-fill');
    if (!state.paused) startTimer(activeFill);
  }

  function next() {
    const group = groups[state.g];
    if (state.i < group.items.length - 1) {
      state.i += 1;
    } else if (state.g < groups.length - 1) {
      state.g += 1;
      state.i = 0;
    } else {
      close();
      return;
    }
    render();
  }

  function prev() {
    if (state.i > 0) {
      state.i -= 1;
    } else if (state.g > 0) {
      state.g -= 1;
      state.i = 0;
    } else {
      state.i = 0;
    }
    render();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }

  function open(groupIndex, itemIndex) {
    state.g = groupIndex;
    state.i = itemIndex || 0;
    state.paused = false;
    state.openedAt = Date.now();
    overlay.hidden = false;
    // Force a reflow so the opacity transition runs (rAF is throttled in
    // background tabs, which would leave the overlay stuck at opacity 0).
    // eslint-disable-next-line no-unused-expressions
    overlay.offsetWidth;
    overlay.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    render();
  }

  // Wiring
  overlay.querySelector('.news-stories-close').addEventListener('click', close);
  overlay.querySelector('.news-stories-prev').addEventListener('click', () => { if (!justOpened()) prev(); });
  overlay.querySelector('.news-stories-next').addEventListener('click', () => { if (!justOpened()) next(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay && !justOpened()) close(); });

  // Pause while pressing (hold-to-pause, like native stories); ignore the read link.
  const pause = () => {
    state.paused = true;
    clearTimer();
    const fill = progress.children[state.i]?.querySelector('.news-stories-seg-fill');
    if (fill) {
      const w = getComputedStyle(fill).width;
      fill.style.transition = 'none';
      fill.style.width = w;
    }
  };
  const resume = () => {
    if (!state.paused) return;
    state.paused = false;
    const fill = progress.children[state.i]?.querySelector('.news-stories-seg-fill');
    startTimer(fill);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.news-stories-read, .news-stories-close, .news-stories-nav')) return;
    pause();
  });
  stage.addEventListener('pointerup', resume);
  stage.addEventListener('pointercancel', resume);

  return open;
}

export default async function decorate(block) {
  // Defaults (mirror news-feed plumbing).
  const config = {
    title: '',
    categories: [],
    latestLabel: 'Latest',
    maxPerStory: 6,
    storyDuration: 5000,
    detailBasePath: '/news',
    contentFragmentFolder: '',
    persistedQueryPath: 'ref-demo-eds/news-by-folder',
    authorGraphqlEndpoint: '',
    edgeDataPath: '/news-data.json',
  };

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = normalizeConfigKey(cells[0].textContent);
    const value = getConfigValue(cells[1]);
    if (!key || !value) return;

    switch (key) {
      case 'title': config.title = value; break;
      case 'categories':
        config.categories = value.split(',').map((c) => c.trim()).filter(Boolean);
        break;
      case 'latestlabel': config.latestLabel = value; break;
      case 'maxperstory': config.maxPerStory = Number.parseInt(value, 10) || 6; break;
      case 'storyduration': config.storyDuration = Number.parseInt(value, 10) || 5000; break;
      case 'detailbasepath': config.detailBasePath = value; break;
      case 'contentfragmentfolder': config.contentFragmentFolder = value; break;
      case 'persistedquerypath':
      case 'persistedquery':
        config.persistedQueryPath = value; break;
      case 'authorgraphqlendpoint': config.authorGraphqlEndpoint = value; break;
      case 'edgedatapath':
      case 'newsdatapath':
        config.edgeDataPath = value; break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.classList.add('news-stories');

  if (config.title) {
    const header = createElement('div', 'block-news-header', `
      <h2 class="block-news-title block-section-title">${config.title}</h2>
    `);
    block.append(header);
  }

  const loading = createElement('p', 'news-stories-loading', 'Loading stories...');
  block.append(loading);

  let items = [];
  try {
    if (isEdgeRuntime()) {
      items = await fetchFromStaticJson(config.edgeDataPath);
    } else {
      items = await fetchFromGraphql(
        config.contentFragmentFolder,
        config.authorGraphqlEndpoint,
        config.persistedQueryPath,
      );
      if (!items.length) items = await fetchFromStaticJson(config.edgeDataPath);
    }
  } catch {
    items = [];
  }

  loading.remove();

  const groups = buildGroups(items, config);
  if (!groups.length) { block.hidden = true; return; }

  const openViewer = createViewer(groups, config, block);
  renderHighlights(groups, block, openViewer);
}
