function createElement(tag, className, html) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html) element.innerHTML = html;
  return element;
}

function getConfigValue(valueCell) {
  const link = valueCell.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell.textContent || '').trim();
}

function ensureJsonPath(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    const u = new URL(value);
    if (!u.pathname.endsWith('.json')) u.pathname = `${u.pathname}.json`;
    return u.toString();
  }
  return value.endsWith('.json') ? value : `${value}.json`;
}

function normalizeFolderPath(path) {
  return String(path || '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/\/+$/g, '');
}

async function fetchJsonFirst(urls) {
  for (let i = 0; i < urls.length; i += 1) {
    try {
      const response = await fetch(urls[i]);
      if (!response.ok) continue;
      return await response.json();
    } catch (e) {
      // try next
    }
  }
  return null;
}

function extractFolderChildren(folderJson) {
  if (Array.isArray(folderJson?.entities)) {
    return folderJson.entities
      .map((entity) => entity?.properties?.path
        || entity?.properties?.['jcr:path']
        || entity?.path
        || entity?.name)
      .filter((path) => typeof path === 'string' && path.startsWith('/content/dam/'));
  }

  if (Array.isArray(folderJson?.children)) {
    return folderJson.children
      .map((child) => child?.path || child?.properties?.path || child?.properties?.['jcr:path'])
      .filter((path) => typeof path === 'string' && path.startsWith('/content/dam/'));
  }

  return Object.keys(folderJson || {})
    .filter((key) => key.startsWith('/content/dam/'));
}

function collectDamPathsRecursively(node, acc = new Set()) {
  if (!node || typeof node !== 'object') return acc;
  Object.entries(node).forEach(([key, value]) => {
    if (typeof key === 'string' && key.startsWith('/content/dam/')) {
      acc.add(key);
    }
    if (value && typeof value === 'object') {
      collectDamPathsRecursively(value, acc);
    }
  });
  return acc;
}

function resolveChildPath(baseFolder, rawPath) {
  if (!rawPath) return null;
  if (rawPath.startsWith('/content/dam/')) return rawPath;
  const clean = rawPath.replace(/^\/+/, '');
  return `${baseFolder}/${clean}`;
}

function readFieldValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') return field.plaintext || field.value || field._path || '';
  return '';
}

function extractNewsFromCfJson(cfJson) {
  const master = cfJson?.['jcr:content']?.data?.master || cfJson?.data?.master || {};
  const elements = cfJson?.elements || {};

  const title = master.title || readFieldValue(elements.title);
  if (!title) return null;

  const description = master.description
    || readFieldValue(elements.description)
    || master.shortDescription
    || readFieldValue(elements.shortDescription)
    || '';

  const category = master.category || readFieldValue(elements.category) || '';
  const slug = master.slug || readFieldValue(elements.slug) || '';
  const mediaPath = master.media || readFieldValue(elements.media) || '';
  const image = mediaPath || '';

  return {
    id: cfJson?.[':path'] || cfJson?._path || title,
    title,
    description: typeof description === 'string' ? description : '',
    category: typeof category === 'string' ? category : '',
    slug: typeof slug === 'string' ? slug : '',
    image,
  };
}

function resolveNewsLink(slug, detailBasePath) {
  if (!slug) return '#';
  if (/^https?:\/\//i.test(slug)) return slug;
  if (slug.startsWith('/')) return slug;
  const base = (detailBasePath || '/news').replace(/\/$/, '');
  return `${base}/${slug.replace(/^\//, '')}`;
}

function renderNews(newsItems, config, container) {
  container.innerHTML = '';
  if (!newsItems.length) {
    const empty = createElement('div', 'news-listing-empty');
    empty.textContent = config.emptyStateText;
    container.append(empty);
    return;
  }

  newsItems.forEach((news) => {
    const href = resolveNewsLink(news.slug, config.detailBasePath);
    const card = createElement('article', 'news-card');
    card.innerHTML = `
      <div class="news-card-image">
        ${news.image ? `<img src="${news.image}" alt="${news.title}">` : '<div class="news-card-image-placeholder"></div>'}
      </div>
      <div class="news-card-body">
        ${news.category ? `<p class="news-card-category">${news.category}</p>` : ''}
        <h3 class="news-card-title">${news.title}</h3>
        <p class="news-card-description">${news.description}</p>
        <p class="news-card-cta"><a class="button" href="${href}">${config.ctaLabel}</a></p>
      </div>
    `;
    container.append(card);
  });
}

async function fetchNewsFromFolder(folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  const folderJson = await fetchJsonFirst([
    ensureJsonPath(normalized),
    ensureJsonPath(`${normalized}/`),
    ensureJsonPath(`/api/assets${normalized}`),
    ensureJsonPath(`/api/assets${normalized}/`),
    `${normalized}.2.json`,
    `${normalized}.3.json`,
  ]);

  if (!folderJson) throw new Error('Folder not found or not readable');

  const directChildren = extractFolderChildren(folderJson);
  const deepChildren = Array.from(collectDamPathsRecursively(folderJson));
  const children = [...new Set([...directChildren, ...deepChildren])]
    .map((child) => resolveChildPath(normalized, child))
    .filter(Boolean)
    .filter((path) => path !== normalized)
    .filter((path) => !path.endsWith('/jcr:content'));

  const results = await Promise.allSettled(
    children.map(async (path) => {
      const cfJson = await fetchJsonFirst([
        ensureJsonPath(path),
        ensureJsonPath(`/api/assets${path}`),
        `${normalizeFolderPath(path)}/jcr:content/data/master.json`,
        `${normalizeFolderPath(path)}/_jcr_content/data/master.json`,
      ]);
      if (!cfJson) return null;
      return extractNewsFromCfJson(cfJson);
    }),
  );

  const items = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
  return { items, debug: { normalized, childrenCount: children.length } };
}

export default async function decorate(block) {
  let title = 'Últimas Notícias';
  let subtitle = 'Confira as notícias mais recentes';
  let contentFragmentFolder = '';
  let maxItems = 6;
  let ctaLabel = 'Ver detalhes';
  let detailBasePath = '/news';
  let emptyStateText = 'Nenhuma notícia encontrada.';

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = cells[0].textContent?.trim()?.toLowerCase();
    const value = getConfigValue(cells[1]);
    if (!key || !value) return;

    switch (key) {
      case 'title': title = value; break;
      case 'subtitle': subtitle = value; break;
      case 'content fragment folder':
      case 'contentfragmentfolder': contentFragmentFolder = value; break;
      case 'max items':
      case 'maxitems': maxItems = Number.parseInt(value, 10) || 6; break;
      case 'cta label':
      case 'ctalabel': ctaLabel = value; break;
      case 'detail base path':
      case 'detailbasepath': detailBasePath = value; break;
      case 'empty state text':
      case 'emptystatetext': emptyStateText = value; break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.classList.add('news-listing');

  const header = createElement('div', 'news-listing-header', `
    <h2 class="news-listing-title">${title}</h2>
    <p class="news-listing-subtitle">${subtitle}</p>
  `);
  const list = createElement('div', 'news-listing-results');
  list.innerHTML = '<p class="news-listing-loading">Carregando notícias...</p>';
  block.append(header, list);

  if (!contentFragmentFolder) {
    renderNews([], { ctaLabel, detailBasePath, emptyStateText }, list);
    return;
  }

  try {
    const { items, debug } = await fetchNewsFromFolder(contentFragmentFolder);
    renderNews(items.slice(0, maxItems), { ctaLabel, detailBasePath, emptyStateText }, list);
    if (!items.length) {
      const info = createElement('p', 'news-listing-error');
      info.textContent = `Debug: folder=${debug.normalized} | children=${debug.childrenCount}`;
      list.append(info);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error loading news listing:', e);
    const message = e?.message ? `Erro ao carregar notícias: ${e.message}` : 'Erro ao carregar notícias.';
    list.innerHTML = `<p class="news-listing-error">${message}</p>`;
  }
}
