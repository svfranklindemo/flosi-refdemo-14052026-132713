function getConfigValue(valueCell) {
  const link = valueCell?.querySelector('a');
  return (link?.getAttribute('title') || link?.textContent || valueCell?.textContent || '').trim();
}

function normalizeKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchLatestTitles(edgeDataPath, maxItems) {
  try {
    const url = new URL(edgeDataPath, window.location.origin);
    url.searchParams.set('ts', Date.now());
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const payload = await res.json();
    const raw = Array.isArray(payload?.items) ? payload.items : [];
    return raw
      .slice(0, maxItems)
      .map((item) => String(item.title || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export default async function decorate(block) {
  // Read key-value config
  let edgeDataPath = '/news-data.json';
  let maxItems = 3;

  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    const key = normalizeKey(keyCell?.textContent);
    const value = getConfigValue(valueCell);
    if (!value) return;
    if (key === 'edgedatapath') edgeDataPath = value;
    if (key === 'maxitems') maxItems = parseInt(value, 10) || 3;
  });

  const titles = await fetchLatestTitles(edgeDataPath, maxItems);
  if (!titles.length) { block.hidden = true; return; }

  block.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'ticker-label';
  label.textContent = 'ÚLTIMAS';

  const track = document.createElement('div');
  track.className = 'ticker-track';

  const content = document.createElement('div');
  content.className = 'ticker-content';

  // Duplicate for seamless loop
  [...titles, ...titles].forEach((text) => {
    const span = document.createElement('span');
    span.className = 'ticker-item';
    span.textContent = text;
    content.appendChild(span);
  });

  track.appendChild(content);
  block.appendChild(label);
  block.appendChild(track);
}
