function getConfigValue(valueCell) {
  const link = valueCell?.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell?.textContent || '').trim();
}

function normalizeKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
  if (Number.isNaN(diff)) return '';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Agora';
  if (h < 24) return `Há ${h} h`;
  return `Há ${Math.floor(h / 24)} d`;
}

async function fetchNews(edgeDataPath, maxItems) {
  try {
    const url = new URL(edgeDataPath, window.location.origin);
    url.searchParams.set('ts', Date.now());
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const payload = await res.json();
    const raw = Array.isArray(payload?.items) ? payload.items : [];
    return raw.slice(0, maxItems).map((item) => ({
      title: String(item.title || '').trim(),
      slug: String(item.slug || '').trim(),
      description: item.description?.plaintext || item.description || '',
      image: item.media?.value || (typeof item.media === 'string' ? item.media : '') || '',
      category: String(item.category || '').trim(),
      createdAt: item.createdAt || '',
    })).filter((n) => n.title);
  } catch {
    return [];
  }
}

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

function buildBody(news, titleTag) {
  const body = document.createElement('div');
  body.className = 'nf-card-body';

  if (news.category) {
    const cat = document.createElement('span');
    cat.className = 'nf-card-cat';
    cat.textContent = news.category;
    body.appendChild(cat);
  }

  // Use <p> instead of <h2> to avoid inheriting section heading styles
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
  card.appendChild(buildBody(news, 'strong'));
  return card;
}

function buildSmallCard(news, detailBasePath) {
  const card = document.createElement('a');
  card.className = 'nf-card nf-card-horiz';
  card.href = resolveLink(news.slug, detailBasePath);
  card.appendChild(buildImageWrap(news));
  card.appendChild(buildBody(news, 'span'));
  return card;
}

export default async function decorate(block) {
  let edgeDataPath = '/news-data.json';
  let detailBasePath = '/en/news';
  let maxItems = 4;
  let sectionTitle = 'Noticias destacadas';

  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    const key = normalizeKey(keyCell?.textContent);
    const value = getConfigValue(valueCell);
    if (!value) return;
    if (key === 'edgedatapath') edgeDataPath = value;
    if (key === 'detailbasepath') detailBasePath = value;
    if (key === 'maxitems') maxItems = parseInt(value, 10) || 4;
    if (key === 'title') sectionTitle = value;
  });

  const items = await fetchNews(edgeDataPath, maxItems);
  block.innerHTML = '';

  if (!items.length) { block.hidden = true; return; }

  // Section header
  const header = document.createElement('div');
  header.className = 'nf-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'nf-title';
  titleEl.textContent = sectionTitle;
  header.appendChild(titleEl);
  header.appendChild(Object.assign(document.createElement('span'), { className: 'nf-bar' }));
  block.appendChild(header);

  // Grid
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
