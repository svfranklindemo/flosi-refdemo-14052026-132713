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

function extractNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  return {
    path: item._path || item._id || '',
    title,
    description: readFieldValue(item.description) || '',
    category: readFieldValue(item.category) || '',
    slug: String(item.slug || '').trim(),
    image: readFieldValue(item.media) || '',
    createdAt: String(item.createdAt || item._createdAt || '').trim(),
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
function resolveLink(slug, detailBasePath) {
  if (!slug) return '#';
  if (/^https?:\/\//i.test(slug)) return slug;
  const base = (detailBasePath || '/en/news').trim().replace(/\/+$/, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}slug=${encodeURIComponent(slug)}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - Date.parse(dateStr);
  if (Number.isNaN(diff) || diff < 0) return '';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Agora';
  if (h < 24) return `Há ${h} h`;
  return `Há ${Math.floor(h / 24)} d`;
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

function buildBody(news, titleTag, detailBasePath) {
  const body = document.createElement('div');
  body.className = 'nf-card-body';

  if (news.category) {
    const cat = document.createElement('span');
    cat.className = 'nf-card-cat';
    cat.textContent = news.category;
    body.appendChild(cat);
  }

  const title = document.createElement(titleTag || 'p');
  title.className = 'nf-card-title';
  title.textContent = news.title;
  body.appendChild(title);

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
  card.appendChild(buildBody(news, 'strong', detailBasePath));
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
  header.className = 'nf-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'nf-title';
  titleEl.textContent = sectionTitle;
  header.appendChild(titleEl);
  header.appendChild(Object.assign(document.createElement('span'), { className: 'nf-bar' }));
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
