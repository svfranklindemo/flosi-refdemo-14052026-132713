const DEBUG_VERSION = 'news-feed-clean-v2';

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

function getConfigValue(valueCell) {
  const link = valueCell.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell.textContent || '').trim();
}

function normalizeFolderPath(path) {
  return String(path || '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/\/+$/g, '');
}

function parseManualPaths(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.startsWith('/content/dam/'));
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

async function fetchJsonWithStatus(urls) {
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const json = await response.json();
      return { json, status: response.status, url };
    } catch (e) {
      // continue
    }
  }
  return { json: null, status: 'not-found', url: urls[0] || '' };
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
  const qbUrl = `/bin/querybuilder.json?${params.toString()}`;
  const response = await fetch(qbUrl);
  if (!response.ok) {
    return { paths: [], debug: { qbUrl, qbStatus: response.status, qbTotal: 0, qbSample: '' } };
  }

  const payload = await response.json();
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  const paths = hits
    .map((hit) => hit?.path || hit?.['jcr:path'] || hit?.['@path'] || '')
    .filter((path) => typeof path === 'string' && path.startsWith('/content/dam/'))
    .map((path) => path.replace(/\/jcr:content$/i, ''));

  return {
    paths: [...new Set(paths)],
    debug: {
      qbUrl,
      qbStatus: response.status,
      qbTotal: Number.parseInt(payload?.total, 10) || paths.length || 0,
      qbSample: paths.slice(0, 3).join(','),
    },
  };
}

function extractNewsFromMaster(masterJson, path) {
  if (!masterJson || typeof masterJson !== 'object') return null;
  const title = String(masterJson.title || '').trim();
  if (!title) return null;
  return {
    id: path,
    title,
    description: readFieldValue(masterJson.description) || '',
    category: readFieldValue(masterJson.category) || '',
    slug: String(masterJson.slug || '').trim(),
    image: readFieldValue(masterJson.media) || '',
  };
}

function resolveNewsLink(slug, detailBasePath) {
  if (!slug) return '#';
  if (/^https?:\/\//i.test(slug)) return slug;
  if (slug.startsWith('/')) return slug;
  const cleanSlug = slug.replace(/^\//, '');
  if (isAuthorRuntime()) {
    const current = window.location.pathname;
    const pagePath = current.replace(/\/+$/, '');
    const parent = pagePath.substring(0, pagePath.lastIndexOf('/') + 1);
    const detailSegments = (detailBasePath || '/news').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const detailName = detailSegments[detailSegments.length - 1] || 'news';
    return `${parent}${detailName}.html?slug=${encodeURIComponent(cleanSlug)}`;
  }
  const current = window.location.pathname.replace(/\/+$/, '');
  const parent = current.substring(0, current.lastIndexOf('/')) || '';
  const rawBase = (detailBasePath || '/news').trim();
  const baseSegments = rawBase.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let finalBase = rawBase.replace(/\/+$/g, '');
  if (rawBase.startsWith('/') && baseSegments.length === 1) {
    finalBase = `${parent}/${baseSegments[0]}`;
  } else if (!rawBase.startsWith('/')) {
    finalBase = `${parent}/${rawBase.replace(/^\/+|\/+$/g, '')}`;
  }
  return `${finalBase}/${cleanSlug}`;
}

function renderNews(items, config, container) {
  container.innerHTML = '';
  if (!items.length) {
    container.append(createElement('div', 'news-feed-empty', config.emptyStateText));
    return;
  }

  items.forEach((news) => {
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

async function fetchNewsFromPaths(paths) {
  const cfFetchDebug = [];
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const masterUrl = `${normalizeFolderPath(path)}/jcr:content/data/master.json`;
      const cf = await fetchJsonWithStatus([masterUrl]);
      cfFetchDebug.push(`${path}=>${cf.status}`);
      if (!cf.json) return null;
      return extractNewsFromMaster(cf.json, path);
    }),
  );

  const items = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);

  return { items, cfFetchDebug };
}

async function fetchNewsFromFolder(folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  const qb = await fetchAssetsViaQueryBuilder(normalized);
  const { items, cfFetchDebug } = await fetchNewsFromPaths(qb.paths);

  return {
    items,
    debug: {
      folder: normalized,
      children: qb.paths.length,
      qbStatus: qb.debug.qbStatus,
      qbTotal: qb.debug.qbTotal,
      qbSample: qb.debug.qbSample,
      qbUrl: qb.debug.qbUrl,
      cfFetch: cfFetchDebug.slice(0, 4).join(' | '),
    },
  };
}

export default async function decorate(block) {
  let title = 'Últimas Notícias';
  let subtitle = 'Confira as notícias mais recentes';
  let contentFragmentFolder = '';
  let maxItems = 6;
  let ctaLabel = 'Ver detalhes';
  let detailBasePath = '/news';
  let emptyStateText = 'Nenhuma notícia encontrada.';
  let manualNewsPaths = '';

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
      case 'manual news paths':
      case 'manualnewspaths': manualNewsPaths = value; break;
      default: break;
    }
  });

  block.innerHTML = '';
  block.classList.add('news-feed');

  const header = createElement('div', 'news-feed-header', `
    <h2 class="news-feed-title">${title}</h2>
    <p class="news-feed-subtitle">${subtitle}${isAuthorRuntime() ? ` (${DEBUG_VERSION})` : ''}</p>
  `);
  const list = createElement('div', 'news-feed-results');
  list.innerHTML = '<p class="news-feed-loading">Carregando notícias...</p>';
  block.append(header, list);

  if (!contentFragmentFolder) {
    renderNews([], { ctaLabel, detailBasePath, emptyStateText }, list);
    return;
  }

  try {
    const manualPaths = parseManualPaths(manualNewsPaths);
    let items = [];
    let debug = null;
    if (manualPaths.length) {
      const result = await fetchNewsFromPaths(manualPaths);
      items = result.items;
      debug = {
        folder: normalizeFolderPath(contentFragmentFolder),
        children: manualPaths.length,
        qbStatus: 'manual',
        qbTotal: manualPaths.length,
        qbSample: manualPaths.slice(0, 3).join(','),
        qbUrl: 'manual',
        cfFetch: result.cfFetchDebug.slice(0, 4).join(' | '),
        manualCount: manualPaths.length,
        manualSample: manualPaths.slice(0, 3).join(','),
      };
    } else {
      ({ items, debug } = await fetchNewsFromFolder(contentFragmentFolder));
      debug.manualCount = 0;
      debug.manualSample = '';
    }
    renderNews(items.slice(0, maxItems), { ctaLabel, detailBasePath, emptyStateText }, list);
    if (!items.length) {
      const info = createElement(
        'p',
        'news-feed-error',
        `Debug: folder=${debug.folder} | children=${debug.children} | qbStatus=${debug.qbStatus} | qbTotal=${debug.qbTotal} | qbSample=${debug.qbSample} | manualCount=${debug.manualCount} | manualSample=${debug.manualSample} | cfFetch=${debug.cfFetch} | qbUrl=${debug.qbUrl} | debugVersion=${DEBUG_VERSION}`,
      );
      list.append(info);
    }
  } catch (e) {
    list.innerHTML = `<p class="news-feed-error">Erro ao carregar notícias: ${e?.message || 'unknown'}</p>`;
  }
}
