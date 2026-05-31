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

function readValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') return field.value || field.plaintext || field.html || field.path || field._path || '';
  return '';
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

  const manualPaths = parseManualPaths(manualNewsPaths);
  const paths = manualPaths.length
    ? manualPaths
    : await fetchAssetsViaQueryBuilder(normalizePath(contentFragmentFolder));

  const masters = await Promise.all(paths.map((path) => fetchMaster(path)));
  const items = masters
    .map((master, index) => normalizeNews(master, paths[index]))
    .filter(Boolean);

  const current = items.find((item) => item.slug === slug);
  if (!current) {
    block.append(createElement('p', 'news-detail-error', notFoundText));
    return;
  }

  renderNewsDetail(block, current);
}
