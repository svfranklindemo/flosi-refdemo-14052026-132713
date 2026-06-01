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

function isAuthorRuntime() {
  const host = window?.location?.hostname || '';
  return host.includes('author');
}

function isEdgeRuntime() {
  const host = window?.location?.hostname || '';
  return host.endsWith('.aem.page') || host.endsWith('.aem.live');
}

function buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, folderPath) {
  const persisted = String(persistedQueryPath || '').trim().replace(/^\/+/, '');
  if (!persisted) return '';
  const folder = normalizePath(folderPath);
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

function readValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'object') return field.value || field.plaintext || field.html || field.path || field._path || '';
  return '';
}

function toCalendarMap(master) {
  const entries = Array.isArray(master?._metadata?.calendarMetadata)
    ? master._metadata.calendarMetadata
    : [];
  return entries.reduce((acc, item) => {
    if (item?.name && item?.value) acc[item.name] = item.value;
    return acc;
  }, {});
}

function parseMasterFields(master) {
  if (!master || typeof master !== 'object') return {};
  const calendarMap = toCalendarMap(master);
  return {
    content: readValue(master.content) || '',
    createdAt: calendarMap['jcr:created'] || '',
    updatedAt: calendarMap['cq:lastModified'] || '',
    publishedAt: calendarMap['cq:lastPublished'] || '',
    authorName: calendarMap['jcr:createdBy'] || '',
    updatedBy: calendarMap['cq:lastModifiedBy'] || '',
  };
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRelativeFromNow(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
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
  let startIndex = current.indexOf(`${base}/`);
  if (startIndex < 0 && current.startsWith(base)) startIndex = 0;
  if (startIndex < 0) return '';
  const remainder = current.slice(startIndex + base.length).replace(/^\/+/, '');
  return decodeURIComponent((remainder.split('/')[0] || '').trim());
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
    createdAt: readValue(item.createdAt) || '',
    updatedAt: readValue(item.updatedAt) || '',
    publishedAt: readValue(item.publishedAt) || '',
    authorName: readValue(item.authorName) || '',
    updatedBy: readValue(item.updatedBy) || '',
  };
}

async function fetchMasterJson(path) {
  if (!path) return null;
  const url = `${normalizePath(path)}/jcr:content/data/master.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function fetchAssetJson(path) {
  if (!path) return null;
  try {
    const response = await fetch(`${normalizePath(path)}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

function parseAssetFields(asset) {
  if (!asset || typeof asset !== 'object') return {};

  const content = asset?.['jcr:content'] || {};
  const metadata = content?.metadata || {};
  const createdAt = asset?.['jcr:created']
    || content?.['jcr:created']
    || metadata?.['dc:created']
    || metadata?.['xmp:CreateDate']
    || '';
  const updatedAt = asset?.['cq:lastModified']
    || asset?.['jcr:lastModified']
    || content?.['cq:lastModified']
    || content?.['jcr:lastModified']
    || metadata?.['xmp:ModifyDate']
    || '';
  const publishedAt = asset?.['cq:lastPublished']
    || asset?.['cq:lastReplicated']
    || content?.['cq:lastPublished']
    || content?.['cq:lastReplicated']
    || '';

  return {
    authorName: asset['jcr:createdBy'] || content?.['jcr:createdBy'] || '',
    updatedBy: asset['cq:lastModifiedBy'] || content?.['cq:lastModifiedBy'] || '',
    createdAt,
    updatedAt,
    publishedAt,
  };
}

async function fetchNewsFromPersistedQuery(folderPath, graphqlEndpoint, persistedQueryPath) {
  const gqlUrl = buildGraphqlUrl(graphqlEndpoint, persistedQueryPath, folderPath);
  if (!gqlUrl) throw new Error('GraphQL Endpoint Base is required.');
  const response = await fetch(gqlUrl);
  if (!response.ok) throw new Error(`GraphQL request failed with status ${response.status}.`);
  const payload = await response.json();
  return extractGraphqlItems(payload).map(normalizeNewsFromGraphql).filter(Boolean);
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
  if (!response.ok) throw new Error(`Static news request failed with status ${response.status}.`);
  const payload = await response.json();
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : extractGraphqlItems(payload);
  return rawItems.map(normalizeNewsFromGraphql).filter(Boolean);
}

function buildAueAttrs(itemPath, prop) {
  if (!isAuthorRuntime() || !itemPath || !prop) return '';
  return ` data-aue-resource="urn:aemconnection:${itemPath}/jcr:content/data/master" data-aue-prop="${prop}" data-aue-type="text"`;
}

function buildShareUrl(network, title) {
  const pageUrl = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(title || '');
  if (network === 'x') return `https://x.com/intent/tweet?url=${pageUrl}&text=${text}`;
  if (network === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
  if (network === 'linkedin') return `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`;
  return '#';
}

function formatAuthorName(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'Redação';
  const localPart = value.includes('@') ? value.split('@')[0] : value;
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function renderNewsDetail(block, item) {
  const publishedSource = item.publishedAt || item.createdAt;
  const updatedSource = item.updatedAt || item.publishedAt || item.createdAt;
  const created = formatDateTime(publishedSource);
  const updated = formatDateTime(updatedSource);
  const updatedAgo = formatRelativeFromNow(updatedSource);
  const isSameTimestamp = Boolean(publishedSource && updatedSource)
    && new Date(publishedSource).getTime() === new Date(updatedSource).getTime();
  const showUpdated = Boolean(updated) && !isSameTimestamp;
  const authorName = formatAuthorName(item.authorName);
  const referenceAue = (isAuthorRuntime() && item.id)
    ? ` data-aue-resource="urn:aemconnection:${item.id}/jcr:content/data/master" data-aue-type="reference" data-aue-label="Content Fragment"`
    : '';

  block.innerHTML = `
    <article class="news-detail-article"${referenceAue}>
      ${item.category ? `<p class="news-detail-category"${buildAueAttrs(item.id, 'category')}>${item.category}</p>` : ''}
      <h1 class="news-detail-title"${buildAueAttrs(item.id, 'title')}>${item.title}</h1>
      <div class="news-detail-meta-row">
        <div class="news-detail-meta">
          <span class="news-detail-meta-item news-detail-author">Por ${authorName}</span>
          ${created ? `<span class="news-detail-meta-item">Publicado: ${created}</span>` : ''}
          ${showUpdated ? `<span class="news-detail-meta-item">Atualizado: ${updated}</span>` : ''}
          ${showUpdated && updatedAgo ? `<span class="news-detail-meta-item">(${updatedAgo})</span>` : ''}
        </div>
      </div>
      <div class="news-detail-share" aria-label="Compartilhar">
        <span class="news-detail-share-label">Compartilhar:</span>
        <a class="news-detail-share-link news-detail-share-x" href="${buildShareUrl('x', item.title)}" target="_blank" rel="noopener">Compartilhar no X</a>
        <a class="news-detail-share-link news-detail-share-facebook" href="${buildShareUrl('facebook', item.title)}" target="_blank" rel="noopener">Compartilhar no Facebook</a>
        <a class="news-detail-share-link news-detail-share-linkedin" href="${buildShareUrl('linkedin', item.title)}" target="_blank" rel="noopener">Compartilhar no LinkedIn</a>
      </div>
      ${item.image ? `<p class="news-detail-image"><img src="${item.image}" alt="${item.title}"></p>` : ''}
      ${item.description ? `<p class="news-detail-description"${buildAueAttrs(item.id, 'description')}>${item.description}</p>` : ''}
      ${item.content ? `<div class="news-detail-content"${buildAueAttrs(item.id, 'content')}>${item.content}</div>` : ''}
    </article>
  `;
}

export default async function decorate(block) {
  let contentFragmentFolder = '';
  let detailBasePath = '/news';
  let notFoundText = 'Notícia não encontrada.';
  let missingSlugText = 'Slug da notícia não encontrado na URL.';
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
      case 'contentfragmentfolder': contentFragmentFolder = value; break;
      case 'detailbasepath': detailBasePath = value; break;
      case 'notfoundtext': notFoundText = value; break;
      case 'missingslugtext': missingSlugText = value; break;
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

  const items = isEdgeRuntime()
    ? await fetchNewsFromStaticJson(edgeDataPath)
    : await fetchNewsFromPersistedQuery(
      contentFragmentFolder,
      resolveGraphqlEndpoint(authorGraphqlEndpoint, ''),
      persistedQueryPath,
    );

  const current = items.find((item) => item.slug === slug);
  if (!current) {
    block.append(createElement('p', 'news-detail-error', notFoundText));
    return;
  }

  const master = await fetchMasterJson(current.id);
  const asset = await fetchAssetJson(current.id);
  const masterFields = parseMasterFields(master);
  const assetFields = parseAssetFields(asset);
  const enriched = {
    ...current,
    content: masterFields.content || current.content || '',
    createdAt: masterFields.createdAt || assetFields.createdAt || current.createdAt || '',
    updatedAt: masterFields.updatedAt || assetFields.updatedAt || current.updatedAt || '',
    publishedAt: masterFields.publishedAt || assetFields.publishedAt || current.publishedAt || '',
    authorName: masterFields.authorName || assetFields.authorName || current.authorName || '',
    updatedBy: masterFields.updatedBy || assetFields.updatedBy || current.updatedBy || '',
  };

  renderNewsDetail(block, enriched);
}
