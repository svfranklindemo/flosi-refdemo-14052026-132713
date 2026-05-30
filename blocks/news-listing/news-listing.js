import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getHostname } from '../../scripts/utils.js';

const CONFIG = {
  WRAPPER_SERVICE_URL: 'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf',
};

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

function normalizeNewsItem(item, isAuthorEnv) {
  const media = item?.media || item?.image || item?.bannerimage;
  const image = media?.[isAuthorEnv ? '_authorUrl' : '_publishUrl']
    || media?._dynamicUrl
    || media?._authorUrl
    || media?._publishUrl
    || '';

  const description = item?.description?.plaintext
    || item?.description?.html
    || item?.shortDescription?.plaintext
    || item?.description?.html
    || item?.description
    || '';

  const category = Array.isArray(item?.category)
    ? item.category[0]
    : (item?.category || item?.newsCategory || '');

  return {
    id: item?._path || crypto.randomUUID(),
    title: item?.title || 'Untitled',
    description: typeof description === 'string' ? description : '',
    category: typeof category === 'string' ? category : '',
    slug: item?.slug || item?.urlSlug || '',
    image,
  };
}

function normalizeCfData(item) {
  return normalizeNewsItem({
    _path: item.path,
    title: item.title,
    description: item.description,
    shortDescription: item.shortDescription,
    media: item.media,
    image: item.image,
    category: item.category,
    newsCategory: item.newsCategory,
    slug: item.slug,
    urlSlug: item.urlSlug,
  }, isAuthorEnvironment());
}

function extractNewsItems(payload, isAuthorEnv, configuredListKey) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  let items = [];
  if (configuredListKey && data[configuredListKey]?.items) {
    items = data[configuredListKey].items;
  } else {
    items = Object.values(data)
      .map((value) => value?.items)
      .find((candidate) => Array.isArray(candidate)) || [];
  }
  return items.map((item) => normalizeNewsItem(item, isAuthorEnv));
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
    const card = createElement('article', 'news-card');
    const href = resolveNewsLink(news.slug, config.detailBasePath);
    card.innerHTML = `
      <div class="news-card-image">
        ${news.image ? `<img src="${news.image}" alt="${news.title}">` : '<div class="news-card-image-placeholder"></div>'}
      </div>
      <div class="news-card-body">
        ${news.category ? `<p class="news-card-category">${news.category}</p>` : ''}
        <h3 class="news-card-title">${news.title}</h3>
        <p class="news-card-description">${news.description}</p>
        <p class="news-card-cta">
          <a class="button" href="${href}">${config.ctaLabel}</a>
        </p>
      </div>
    `;
    container.append(card);
  });
}

async function fetchNewsByFolder(folderPath, queryName, responseListKey) {
  const hostnameFromPlaceholders = await getHostname();
  const hostname = hostnameFromPlaceholders || getMetadata('hostname');
  const aemauthorurl = getMetadata('authorurl') || '';
  const aempublishurl = hostname?.replace('author', 'publish')?.replace(/\/$/, '') || '';
  const isAuthor = isAuthorEnvironment();
  const decodedFolderPath = decodeURIComponent(folderPath || '');
  const query = queryName || 'GetNewsFromFolder';
  const graphQlEndpoint = `/graphql/execute.json/ref-demo-eds/${query}`;

  const requestConfig = isAuthor
    ? {
      url: `${aemauthorurl}${graphQlEndpoint};path=${decodedFolderPath};ts=${Date.now()}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
    : {
      url: `${CONFIG.WRAPPER_SERVICE_URL}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graphQLPath: `${aempublishurl}${graphQlEndpoint}`,
        cfPath: decodedFolderPath,
        variation: `main;ts=${Date.now()}`,
      }),
    };

  const response = await fetch(requestConfig.url, {
    method: requestConfig.method,
    headers: requestConfig.headers,
    ...(requestConfig.body && { body: requestConfig.body }),
  });

  if (!response.ok) {
    throw new Error(`Failed news GraphQL request (${query}): ${response.status}`);
  }

  const payload = await response.json();
  return extractNewsItems(payload, isAuthor, responseListKey);
}

function ensureJsonPath(path) {
  if (!path) return '';
  const trimmed = String(path).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const pathname = url.pathname.endsWith('.json') ? url.pathname : `${url.pathname}.json`;
    return `${url.origin}${pathname}`;
  }
  return trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
}

function readFieldValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') {
    return field.plaintext || field.value || field._path || '';
  }
  return '';
}

function extractCfCoreData(cfJson) {
  const modelData = cfJson?.['jcr:content']?.data?.master || cfJson?.data?.master || {};
  const elements = cfJson?.elements || {};
  const title = modelData.title || readFieldValue(elements.title) || cfJson.title || '';
  const description = modelData.description || readFieldValue(elements.description) || '';
  const shortDescription = modelData.shortDescription || readFieldValue(elements.shortDescription) || '';
  const category = modelData.category || readFieldValue(elements.category) || '';
  const slug = modelData.slug || readFieldValue(elements.slug) || '';
  const mediaValue = modelData.media || readFieldValue(elements.media);

  return {
    path: cfJson?.[':path'] || cfJson?._path || modelData?.[':path'] || '',
    title,
    description,
    shortDescription,
    category,
    slug,
    media: mediaValue ? { _publishUrl: mediaValue, _authorUrl: mediaValue, _dynamicUrl: mediaValue } : null,
  };
}

function getFolderChildren(folderJson) {
  if (Array.isArray(folderJson?.entities)) {
    return folderJson.entities
      .map((entity) => entity?.properties?.path || entity?.path || entity?.properties?.['jcr:path'])
      .filter((path) => typeof path === 'string' && path.startsWith('/content/dam/'));
  }

  if (Array.isArray(folderJson?.children)) {
    return folderJson.children
      .map((child) => child?.path || child?.properties?.path || child?.name)
      .map((path) => (path && path.startsWith('/content/dam/')) ? path : null)
      .filter(Boolean);
  }

  return Object.keys(folderJson || {})
    .filter((key) => key && !key.startsWith(':') && !key.startsWith('jcr:'))
    .map((key) => key.startsWith('/') ? key : null)
    .filter(Boolean);
}

function normalizeFolderPath(inputPath) {
  if (!inputPath) return '';
  const value = String(inputPath).trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.pathname.replace(/\.json$/i, '');
    } catch (e) {
      return value.replace(/\.json$/i, '');
    }
  }
  return value.replace(/\.json$/i, '');
}

async function fetchJsonFirst(urls) {
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const json = await response.json();
      return json;
    } catch (e) {
      // keep trying next URL
    }
  }
  return null;
}

async function fetchNewsFromDamFolder(folderPath) {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  const folderResponse = await fetch(ensureJsonPath(normalizedFolderPath));
  if (!folderResponse.ok) {
    throw new Error(`Failed DAM folder request: ${folderResponse.status}`);
  }

  const folderJson = await folderResponse.json();
  const childPaths = getFolderChildren(folderJson);
  const cfPaths = childPaths.filter((path) => !path.endsWith('/jcr:content'));

  const results = await Promise.allSettled(
    cfPaths.map(async (path) => {
      const normalizedPath = normalizeFolderPath(path);
      const json = await fetchJsonFirst([
        ensureJsonPath(normalizedPath),
        `${normalizedPath}/jcr:content/data/master.json`,
        `${normalizedPath}/_jcr_content/data/master.json`,
      ]);
      if (!json) return null;
      const core = extractCfCoreData(json);
      if (!core.title) return null;
      return normalizeCfData(core);
    }),
  );

  return results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
}

export default async function decorate(block) {
  let title = 'Últimas Notícias';
  let subtitle = 'Confira as notícias mais recentes';
  let contentFragmentFolder = '';
  let maxItems = 6;
  let ctaLabel = 'Ver detalhes';
  let detailBasePath = '/news';
  let emptyStateText = 'Nenhuma notícia encontrada.';
  let queryName = '';
  let responseListKey = '';

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
      case 'query name':
      case 'queryname': queryName = value; break;
      case 'response list key':
      case 'responselistkey': responseListKey = value; break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.className = 'news-listing';

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
    let items = [];
    if (queryName) {
      items = await fetchNewsByFolder(contentFragmentFolder, queryName, responseListKey);
    } else {
      items = await fetchNewsFromDamFolder(contentFragmentFolder);
    }
    renderNews(items.slice(0, maxItems), {
      ctaLabel,
      detailBasePath,
      emptyStateText,
    }, list);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error loading news listing:', e);
    const message = e?.message ? `Erro ao carregar notícias: ${e.message}` : 'Erro ao carregar notícias.';
    list.innerHTML = `<p class="news-listing-error">${message}</p>`;
  }
}
