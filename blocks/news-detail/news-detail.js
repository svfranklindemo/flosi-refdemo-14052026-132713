function createElement(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

function getConfigValue(valueCell) {
  const link = valueCell.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell.textContent || '').trim();
}

function normalizeConfigKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePath(path) {
  return String(path || '').trim().replace(/\/+$/g, '');
}

function parseManualPaths(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.startsWith('/content/dam/'));
}

function buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, folderPath) {
  const persisted = String(persistedQueryPath || '').trim().replace(/^\/+/, '');
  if (!persisted) return '';
  const folder = normalizePath(folderPath);
  const base = String(graphqlEndpoint || '').trim().replace(/\/+$/g, '');
  if (base.includes('/graphql/execute.json')) {
    return `${base}/${persisted};path=${encodeURIComponent(folder)}`;
  }
  const prefix = base ? `${base}` : '';
  return `${prefix}/graphql/execute.json/${persisted};path=${encodeURIComponent(folder)}`;
}

function readValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') return field.value || field.plaintext || field.html || field.path || field._path || '';
  return '';
}

function extractGraphqlItems(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  const key = Object.keys(data).find((k) => k.endsWith('List') || k.endsWith('Paginated'));
  if (!key) return [];
  return Array.isArray(data[key]?.items) ? data[key].items : [];
}

function getSlugFromPath(detailBasePath) {
  const fromQuery = new URLSearchParams(window.location.search).get('slug');
  if (fromQuery) return decodeURIComponent(fromQuery.trim());
  const base = normalizePath(detailBasePath || '/news');
  const current = normalizePath(window.location.pathname);
  if (!current.startsWith(base)) return '';
  const remainder = current.slice(base.length).replace(/^\/+/, '');
  return decodeURIComponent((remainder.split('/')[0] || '').trim());
}

async function fetchAssetsViaQueryBuilder(folderPath) {
  const params = new URLSearchParams({
    path: folderPath,
    type: 'dam:Asset',
    '1_property': 'jcr:content/contentFragment',
    '1_property.value': 'true',
    'p.limit': '100',
    'p.hits': 'full',
    'p.properties': 'path jcr:path',
  });
  const response = await fetch(`/bin/querybuilder.json?${params.toString()}`);
  if (!response.ok) return [];
  const payload = await response.json();
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  return hits
    .map((hit) => hit?.path || hit?.['jcr:path'] || '')
    .filter((path) => typeof path === 'string' && path.startsWith('/content/dam/'))
    .map((path) => path.replace(/\/jcr:content$/i, ''));
}

async function fetchMaster(path) {
  const url = `${normalizePath(path)}/jcr:content/data/master.json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

function normalizeNews(master, path) {
  if (!master || typeof master !== 'object') return null;
  const title = String(master.title || '').trim();
  if (!title) return null;
  return {
    id: path,
    title,
    description: readValue(master.description) || '',
    content: readValue(master.content) || '',
    category: readValue(master.category) || '',
    slug: String(master.slug || '').trim(),
    image: readValue(master.media) || '',
  };
}

function normalizeNewsFromGraphql(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  return {
    id: item._path || item._id || title,
    title,
    description: readValue(item.description) || '',
    content: readValue(item.content) || '',
    category: readValue(item.category) || '',
    slug: String(item.slug || '').trim(),
    image: readValue(item.media) || '',
  };
}

async function fetchNewsFromPersistedQuery(folderPath, graphqlEndpoint, persistedQueryPath) {
  const gqlUrl = buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, folderPath);
  if (!gqlUrl) return [];
  const response = await fetch(gqlUrl);
  if (!response.ok) return [];
  const payload = await response.json();
  return extractGraphqlItems(payload).map(normalizeNewsFromGraphql).filter(Boolean);
}

function renderNewsDetail(block, item) {
  block.innerHTML = `
    <article class="news-detail-article">
      ${item.category ? `<p class="news-detail-category">${item.category}</p>` : ''}
      <h1 class="news-detail-title">${item.title}</h1>
      ${item.image ? `<p class="news-detail-image"><img src="${item.image}" alt="${item.title}"></p>` : ''}
      ${item.description ? `<p class="news-detail-description">${item.description}</p>` : ''}
      ${item.content ? `<div class="news-detail-content">${item.content}</div>` : ''}
    </article>
  `;
}

export default async function decorate(block) {
  let contentFragmentFolder = '';
  let detailBasePath = '/news';
  let notFoundText = 'Notícia não encontrada.';
  let missingSlugText = 'Slug da notícia não encontrado na URL.';
  let manualNewsPaths = '';
  let persistedQueryPath = 'ref-demo-eds/news-by-folder';
  let graphqlEndpoint = '';

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = normalizeConfigKey(cells[0].textContent);
    const value = getConfigValue(cells[1]);
    if (!key || !value) return;
    switch (key) {
      case 'contentfragmentfolder': contentFragmentFolder = value; break;
      case 'detailbasepath': detailBasePath = value; break;
      case 'notfoundtext': notFoundText = value; break;
      case 'missingslugtext': missingSlugText = value; break;
      case 'manualnewspaths':
      case 'manualnewspathsoneperlineoptional':
      case 'manualnewspathscommaseparatedoptional':
        manualNewsPaths = value;
        break;
      case 'persistedquerypath':
      case 'persistedquery':
        persistedQueryPath = value;
        break;
      case 'graphqlendpoint':
      case 'graphqlhost':
        graphqlEndpoint = value;
        break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.classList.add('news-detail');

  const slug = getSlugFromPath(detailBasePath);
  if (!slug) {
    block.append(createElement('p', 'news-detail-error', missingSlugText));
    return;
  }

  if (!contentFragmentFolder) {
    block.append(createElement('p', 'news-detail-error', 'Content Fragment Folder is required.'));
    return;
  }

  let items = await fetchNewsFromPersistedQuery(contentFragmentFolder, graphqlEndpoint, persistedQueryPath);
  if (!items.length) {
    const manualPaths = parseManualPaths(manualNewsPaths);
    const paths = manualPaths.length
      ? manualPaths
      : await fetchAssetsViaQueryBuilder(normalizePath(contentFragmentFolder));
    const masters = await Promise.all(paths.map((path) => fetchMaster(path)));
    items = masters
      .map((master, index) => normalizeNews(master, paths[index]))
      .filter(Boolean);
  }

  const current = items.find((item) => item.slug === slug);
  if (!current) {
    block.append(createElement('p', 'news-detail-error', notFoundText));
    return;
  }

  renderNewsDetail(block, current);
}
