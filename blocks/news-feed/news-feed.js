const DEBUG_VERSION = 'news-feed-hybrid-v1';

function createElement(tag, className, html) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html) element.innerHTML = html;
  return element;
}

function isAuthorRuntime() {
  const host = window?.location?.hostname || '';
  return host.includes('author');
}

function isEdgeRuntime() {
  const host = window?.location?.hostname || '';
  return host.endsWith('.aem.page') || host.endsWith('.aem.live');
}

function getConfigValue(valueCell) {
  const link = valueCell.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell.textContent || '').trim();
}

function normalizeConfigKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeFolderPath(path) {
  return String(path || '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/\/+$/g, '');
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

function resolveGraphqlEndpoint(authorGraphqlEndpoint, edgeGraphqlEndpoint) {
  if (isAuthorRuntime()) {
    return String(authorGraphqlEndpoint || window.location.origin).trim();
  }
  if (isEdgeRuntime()) {
    return String(edgeGraphqlEndpoint || '').trim();
  }
  return String(authorGraphqlEndpoint || edgeGraphqlEndpoint || '').trim();
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

function extractGraphqlItems(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return [];
  const key = Object.keys(data).find((k) => k.endsWith('List') || k.endsWith('Paginated'));
  if (!key) return [];
  return Array.isArray(data[key]?.items) ? data[key].items : [];
}

function extractNewsFromGraphql(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  return {
    id: item._path || item._id || title,
    title,
    description: readFieldValue(item.description) || '',
    category: readFieldValue(item.category) || '',
    slug: String(item.slug || '').trim(),
    image: readFieldValue(item.media) || '',
    createdAt: String(item.createdAt || item.publishedAt || item.updatedAt || item._createdAt || '').trim(),
  };
}

function sortNewsNewestFirst(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    return bTime - aTime;
  });
}

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
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} día${d !== 1 ? 's' : ''}`;
}

function renderNews(items, config, container) {
  container.innerHTML = '';
  if (!items.length) {
    container.append(createElement('div', 'news-feed-empty', config.emptyStateText));
    return;
  }

  items.forEach((news) => {
    const href = resolveNewsLink(news.slug, config.detailBasePath);
    const ago = timeAgo(news.createdAt);
    const card = createElement('article', 'news-card');
    card.innerHTML = `
      <div class="news-card-image">
        ${news.image ? `<img src="${news.image}" alt="${news.title}" loading="lazy">` : '<div class="news-card-image-placeholder"></div>'}
      </div>
      <div class="news-card-body">
        ${news.category ? `<span class="news-card-category">${news.category}</span>` : ''}
        <p class="news-card-title">${news.title}</p>
        ${news.description ? `<p class="news-card-description">${news.description}</p>` : ''}
        ${ago ? `<span class="news-card-meta">${ago}</span>` : ''}
      </div>
    `;
    // Link wraps the whole card
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => { window.location.href = href; });
    container.append(card);
  });
}

async function fetchNewsFromPersistedQuery(folderPath, graphqlEndpoint, persistedQueryPath) {
  const normalized = normalizeFolderPath(folderPath);
  const gqlUrl = buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, normalized);
  if (!gqlUrl) {
    return { items: [], debug: { source: 'graphql', gqlUrl: '', gqlStatus: 'missing-graphqlEndpoint', gqlCount: 0 } };
  }

  const response = await fetch(gqlUrl);
  if (!response.ok) {
    return {
      items: [],
      debug: { source: 'graphql', gqlUrl, gqlStatus: response.status },
    };
  }

  const payload = await response.json();
  const items = extractGraphqlItems(payload).map(extractNewsFromGraphql).filter(Boolean);
  return {
    items,
    debug: {
      source: 'graphql',
      gqlUrl,
      gqlStatus: response.status,
      gqlCount: items.length,
    },
  };
}

async function fetchNewsFromStaticJson(edgeDataPath) {
  const path = String(edgeDataPath || '/news-data.json').trim() || '/news-data.json';
  const url = new URL(path, window.location.origin);
  url.searchParams.set('ts', `${Date.now()}`);
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    return { items: [], debug: { source: 'edge-static', staticPath: path, staticStatus: response.status } };
  }
  const payload = await response.json();
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : extractGraphqlItems(payload);
  const items = rawItems.map(extractNewsFromGraphql).filter(Boolean);
  return {
    items,
    debug: { source: 'edge-static', staticPath: path, staticStatus: response.status, staticCount: items.length },
  };
}

export default async function decorate(block) {
  let title = 'Últimas Notícias';
  let subtitle = 'Confira as notícias mais recentes';
  let contentFragmentFolder = '';
  let maxItems = 6;
  let ctaLabel = 'Ver detalhes';
  let detailBasePath = '/news';
  let allNewsPath = '/en/news-all';
  let emptyStateText = 'Nenhuma notícia encontrada.';
  let persistedQueryPath = 'ref-demo-eds/news-by-folder';
  let authorGraphqlEndpoint = '';
  let edgeDataPath = '/news-data.json';

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = normalizeConfigKey(cells[0].textContent);
    const value = getConfigValue(cells[1]);
    if (!key || !value) return;

    switch (key) {
      case 'title': title = value; break;
      case 'subtitle': subtitle = value; break;
      case 'contentfragmentfolder': contentFragmentFolder = value; break;
      case 'maxitems': maxItems = Number.parseInt(value, 10) || 6; break;
      case 'ctalabel': ctaLabel = value; break;
      case 'detailbasepath': detailBasePath = value; break;
      case 'allnewspath': allNewsPath = value; break;
      case 'emptystatetext': emptyStateText = value; break;
      case 'persistedquerypath':
      case 'persistedquery':
        persistedQueryPath = value;
        break;
      case 'authorgraphqlendpoint':
        authorGraphqlEndpoint = value;
        break;
      case 'graphqlendpoint':
      case 'graphqlhost':
      case 'edgedatapath':
      case 'newsdatapath':
        edgeDataPath = value;
        break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.classList.add('news-feed');

  const header = createElement('div', 'block-news-header', `
    <h2 class="block-news-title block-section-title">${title}</h2>
    <a class="block-news-ver-todas" href="${allNewsPath}">Ver todas →</a>
  `);
  const list = createElement('div', 'news-feed-results');
  list.innerHTML = '<p class="news-feed-loading">Carregando notícias...</p>';
  block.append(header, list);

  if (!contentFragmentFolder) {
    renderNews([], { ctaLabel, detailBasePath, emptyStateText }, list);
    return;
  }

  try {
    const result = isEdgeRuntime()
      ? await fetchNewsFromStaticJson(edgeDataPath)
      : await fetchNewsFromPersistedQuery(
        contentFragmentFolder,
        resolveGraphqlEndpoint(authorGraphqlEndpoint, ''),
        persistedQueryPath,
      );
    const items = sortNewsNewestFirst(result.items);
    const debug = isEdgeRuntime()
      ? {
        folder: normalizeFolderPath(contentFragmentFolder),
        children: items.length,
        source: result.debug.source,
        staticStatus: result.debug.staticStatus,
        staticPath: result.debug.staticPath,
        staticCount: result.debug.staticCount || 0,
      }
      : {
        folder: normalizeFolderPath(contentFragmentFolder),
        children: items.length,
        source: result.debug.source,
        gqlStatus: result.debug.gqlStatus,
        gqlUrl: result.debug.gqlUrl,
        gqlCount: result.debug.gqlCount || 0,
      };
    renderNews(items.slice(0, maxItems), { ctaLabel, detailBasePath, emptyStateText }, list);
    if (!items.length) {
      const info = createElement(
        'p',
        'news-feed-error',
        isEdgeRuntime()
          ? `Debug: folder=${debug.folder} | children=${debug.children} | source=${debug.source} | staticStatus=${debug.staticStatus} | staticCount=${debug.staticCount} | staticPath=${debug.staticPath} | debugVersion=${DEBUG_VERSION}`
          : `Debug: folder=${debug.folder} | children=${debug.children} | source=${debug.source} | gqlStatus=${debug.gqlStatus} | gqlCount=${debug.gqlCount} | gqlUrl=${debug.gqlUrl} | debugVersion=${DEBUG_VERSION}`,
      );
      list.append(info);
    }
  } catch (e) {
    list.innerHTML = `<p class="news-feed-error">Erro ao carregar notícias: ${e?.message || 'unknown'}</p>`;
  }
}
