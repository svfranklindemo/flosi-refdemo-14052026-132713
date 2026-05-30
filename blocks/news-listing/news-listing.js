import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getHostname } from '../../scripts/utils.js';

const GRAPHQL_NEWS_BY_FOLDER_QUERY = '/graphql/execute.json/ref-demo-eds/GetNewsFromFolder';

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
    || item?.description
    || '';

  const category = Array.isArray(item?.category)
    ? item.category[0]
    : (item?.category || '');

  return {
    id: item?._path || crypto.randomUUID(),
    title: item?.title || 'Untitled',
    description: typeof description === 'string' ? description : '',
    category: typeof category === 'string' ? category : '',
    slug: item?.slug || '',
    image,
  };
}

function extractNewsItems(payload, isAuthorEnv) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  const firstArray = Object.values(data)
    .map((value) => value?.items)
    .find((items) => Array.isArray(items));
  if (!firstArray) return [];
  return firstArray.map((item) => normalizeNewsItem(item, isAuthorEnv));
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

async function fetchNewsByFolder(folderPath) {
  const hostnameFromPlaceholders = await getHostname();
  const hostname = hostnameFromPlaceholders || getMetadata('hostname');
  const aemauthorurl = getMetadata('authorurl') || '';
  const aempublishurl = hostname?.replace('author', 'publish')?.replace(/\/$/, '') || '';
  const isAuthor = isAuthorEnvironment();
  const decodedFolderPath = decodeURIComponent(folderPath || '');

  const requestConfig = isAuthor
    ? {
      url: `${aemauthorurl}${GRAPHQL_NEWS_BY_FOLDER_QUERY};path=${decodedFolderPath};ts=${Date.now()}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
    : {
      url: `${CONFIG.WRAPPER_SERVICE_URL}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graphQLPath: `${aempublishurl}${GRAPHQL_NEWS_BY_FOLDER_QUERY}`,
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
    throw new Error(`Failed news GraphQL request: ${response.status}`);
  }

  const payload = await response.json();
  return extractNewsItems(payload, isAuthor);
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
    const items = await fetchNewsByFolder(contentFragmentFolder);
    renderNews(items.slice(0, maxItems), {
      ctaLabel,
      detailBasePath,
      emptyStateText,
    }, list);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error loading news listing:', e);
    list.innerHTML = '<p class="news-listing-error">Erro ao carregar notícias.</p>';
  }
}
