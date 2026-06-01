// news-featured: 1 destaque grande + 3 cards laterais
// Author runtime → GraphQL (persisted query), filtra pelos 4 CFs configurados
// Edge runtime   → JSON estático, busca por slug extraído do CF path

function isAuthorRuntime() {
  return (window?.location?.hostname || '').includes('author');
}

function isEdgeRuntime() {
  const h = window?.location?.hostname || '';
  return h.endsWith('.aem.page') || h.endsWith('.aem.live');
}

function getConfigValue(cell) {
  const link = cell?.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || cell?.textContent || '').trim();
}

function normalizeKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugFromPath(cfPath) {
  // /content/dam/site/news/my-article → my-article
  return String(cfPath || '').replace(/\/+$/, '').split('/').pop() || '';
}

function parentFolderFromPath(cfPath) {
  const parts = String(cfPath || '').replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/');
}

function readFieldValue(field) {
  if (!field && field !== 0) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    return field.value || field.plaintext || field.html || field.path || field._path || '';
  }
  return String(field);
}

function calendarMeta(item, name) {
  const entries = Array.isArray(item?._metadata?.calendarMetadata)
    ? item._metadata.calendarMetadata : [];
  return entries.find((e) => e?.name === name)?.value || '';
}

function extractNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  const createdAt = calendarMeta(item, 'cq:lastPublished')
    || String(item.publishedAt || item.createdAt || item.updatedAt || item._createdAt || '').trim();
  return {
    path: item._path || item._id || '',
    title,
    description: readFieldValue(item.description) || '',
    category: readFieldValue(item.category) || '',
    slug: String(item.slug || '').trim(),
    image: readFieldValue(item.media) || '',
    createdAt,
  };
}

function extractGraphqlItems(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  const key = Object.keys(data).find((k) => k.endsWith('List') || k.endsWith('Paginated'));
  if (!key) return [];
  return Array.isArray(data[key]?.items) ? data[key].items : [];
}

// ── Author: busca via GraphQL pelo folder pai, filtra pelos paths ──────────────
async function fetchByPathsFromGraphql(cfPaths, authorGraphqlEndpoint, persistedQueryPath) {
  if (!cfPaths.length) return [];

  // Usa o folder do primeiro CF como base (todos devem estar na mesma pasta)
  const folder = parentFolderFromPath(cfPaths[0]);
  const persisted = String(persistedQueryPath || '').trim().replace(/^\/+/, '');
  const base = String(authorGraphqlEndpoint || window.location.origin).trim().replace(/\/+$/, '');
  const url = base.includes('/graphql/execute.json')
    ? `${base}/${persisted};path=${folder}`
    : `${base}/graphql/execute.json/${persisted};path=${folder}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const payload = await res.json();
    const all = extractGraphqlItems(payload).map(extractNewsItem).filter(Boolean);

    // Ordena para bater com a ordem dos CFs configurados
    const pathSet = new Set(cfPaths.map((p) => p.replace(/\/+$/, '')));
    const filtered = all.filter((n) => pathSet.has(n.path.replace(/\/+$/, '')));

    // Mantém a ordem declarada (cf1 → cf4)
    return cfPaths
      .map((p) => filtered.find((n) => n.path.replace(/\/+$/, '') === p.replace(/\/+$/, '')))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Edge: busca JSON estático, filtra e ordena pelos slugs dos CFs ─────────────
async function fetchByPathsFromJson(cfPaths, edgeDataPath) {
  const slugs = cfPaths.map(slugFromPath).filter(Boolean);
  if (!slugs.length) return [];

  try {
    const url = new URL(edgeDataPath || '/news-data.json', window.location.origin);
    url.searchParams.set('ts', Date.now());
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const payload = await res.json();
    const raw = Array.isArray(payload?.items) ? payload.items : extractGraphqlItems(payload);
    const all = raw.map(extractNewsItem).filter(Boolean);

    // Ordena para bater com a ordem dos CFs configurados (cf1 primeiro = destaque)
    return slugs
      .map((slug) => all.find((n) => n.slug === slug || slugFromPath(n.path) === slug))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Resolve link igual ao news-feed ───────────────────────────────────────────
// Mesma lógica do news-feed para resolver links em author e edge
function resolveLink(slug, detailBasePath) {
  if (!slug) return '#';
  if (/^https?:\/\//i.test(slug)) return slug;
  if (slug.startsWith('/')) return slug;
  const cleanSlug = slug.replace(/^\//, '');
  const rawBase = (detailBasePath || '/en/news').trim();

  const withSlugQuery = (baseUrl) => {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}slug=${encodeURIComponent(cleanSlug)}`;
  };

  if (isAuthorRuntime()) {
    const current = window.location.pathname;
    const pagePath = current.replace(/\/+$/, '');
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

  // Edge runtime
  const currentPath = window.location.pathname.replace(/\/+$/, '');
  const pathSegments = currentPath.split('/').filter(Boolean);
  const firstSeg = pathSegments[0] || '';
  const htmlLang = (document?.documentElement?.lang || '').toLowerCase().trim();
  const langFallback = htmlLang.split('-')[0] || '';
  const localeSegment = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(firstSeg)
    ? firstSeg
    : (langFallback.match(/^[a-z]{2}$/i)?.[0] || '');
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
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} día${d !== 1 ? 's' : ''}`;
}

// ── DOM builders ──────────────────────────────────────────────────────────────
function buildImageWrap(news) {
  const wrap = document.createElement('div');
  wrap.className = 'nf-card-image';
  if (news.image) {
    const img = document.createElement('img');
    img.src = news.image;
    img.alt = news.title;
    img.loading = 'lazy';
    wrap.appendChild(img);
  }
  return wrap;
}

function buildBody(news, titleTag, detailBasePath, showDescription = false) {
  const body = document.createElement('div');
  body.className = 'nf-card-body';

  const displayCat = news.category || 'Nacional';
  const cat = document.createElement('span');
  cat.className = 'nf-card-cat news-cat-badge';
  cat.dataset.category = displayCat.toLowerCase();
  cat.textContent = displayCat;
  body.appendChild(cat);

  const title = document.createElement(titleTag || 'p');
  title.className = 'nf-card-title';
  title.textContent = news.title;
  body.appendChild(title);

  if (showDescription && news.description) {
    const desc = document.createElement('p');
    desc.className = 'nf-card-description';
    desc.textContent = news.description;
    body.appendChild(desc);
  }

  const ago = timeAgo(news.createdAt);
  if (ago) {
    const meta = document.createElement('span');
    meta.className = 'nf-card-meta';
    meta.textContent = ago;
    body.appendChild(meta);
  }

  return body;
}

function buildBigCard(news, detailBasePath) {
  const card = document.createElement('a');
  card.className = 'nf-card nf-card-big';
  card.href = resolveLink(news.slug, detailBasePath);
  card.appendChild(buildImageWrap(news));
  card.appendChild(buildBody(news, 'strong', detailBasePath, true));
  return card;
}

function buildSmallCard(news, detailBasePath) {
  const card = document.createElement('a');
  card.className = 'nf-card nf-card-horiz';
  card.href = resolveLink(news.slug, detailBasePath);
  card.appendChild(buildImageWrap(news));
  card.appendChild(buildBody(news, 'span', detailBasePath));
  return card;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default async function decorate(block) {
  const cfPaths = [];
  let edgeDataPath = '/news-data.json';
  let detailBasePath = '/en/news';
  let allNewsPath = '/en/news-all';
  let persistedQueryPath = 'ref-demo-eds/news-by-folder';
  let authorGraphqlEndpoint = '';
  let sectionTitle = 'Noticias destacadas';

  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    const key = normalizeKey(keyCell?.textContent);
    const value = getConfigValue(valueCell);
    if (!value) return;

    if (key === 'cf1') cfPaths[0] = value;
    else if (key === 'cf2') cfPaths[1] = value;
    else if (key === 'cf3') cfPaths[2] = value;
    else if (key === 'cf4') cfPaths[3] = value;
    else if (key === 'edgedatapath') edgeDataPath = value;
    else if (key === 'detailbasepath') detailBasePath = value;
    else if (key === 'allnewspath') allNewsPath = value;
    else if (key === 'persistedquerypath' || key === 'persistedquery') persistedQueryPath = value;
    else if (key === 'authorgraphqlendpoint') authorGraphqlEndpoint = value;
    else if (key === 'title') sectionTitle = value;
  });

  const validPaths = cfPaths.filter(Boolean);
  block.innerHTML = '';

  if (!validPaths.length) {
    block.hidden = true;
    return;
  }

  // Loading state
  block.innerHTML = '<p class="nf-loading">Carregando...</p>';

  let items = [];
  try {
    items = isEdgeRuntime()
      ? await fetchByPathsFromJson(validPaths, edgeDataPath)
      : await fetchByPathsFromGraphql(validPaths, authorGraphqlEndpoint, persistedQueryPath);
  } catch {
    items = [];
  }

  // Fallback para JSON estático se GraphQL não retornou nada em author
  if (!items.length && !isEdgeRuntime()) {
    items = await fetchByPathsFromJson(validPaths, edgeDataPath);
  }

  block.innerHTML = '';

  if (!items.length) {
    block.hidden = true;
    return;
  }

  // Section header
  const header = document.createElement('div');
  header.className = 'block-news-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'block-news-title block-section-title';
  titleEl.textContent = sectionTitle;
  header.appendChild(titleEl);
  const verTodas = document.createElement('a');
  verTodas.className = 'block-news-ver-todas';
  verTodas.href = allNewsPath;
  verTodas.textContent = 'Ver todas →';
  header.appendChild(verTodas);
  block.appendChild(header);

  // Grid: primeiro item = destaque, restantes = stack lateral
  const grid = document.createElement('div');
  grid.className = 'nf-grid';

  const [first, ...rest] = items;
  grid.appendChild(buildBigCard(first, detailBasePath));

  if (rest.length) {
    const stack = document.createElement('div');
    stack.className = 'nf-stack';
    rest.forEach((item) => stack.appendChild(buildSmallCard(item, detailBasePath)));
    grid.appendChild(stack);
  }

  block.appendChild(grid);
}
