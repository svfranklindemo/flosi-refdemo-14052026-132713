import fs from 'node:fs/promises';

const endpoint = process.env.NEWS_GRAPHQL_URL
  || 'https://publish-p165802-e1765367.adobeaemcloud.com/graphql/execute.json/ref-demo-eds/news-by-folder;path=/content/dam/6a05cdafe815815bf04d6032';
const output = process.env.NEWS_OUTPUT_PATH || './news-data.json';

function parseCreatedAt(master) {
  const calendars = Array.isArray(master?._metadata?.calendarMetadata)
    ? master._metadata.calendarMetadata
    : [];
  const created = calendars.find((entry) => entry?.name === 'jcr:created')?.value
    || calendars.find((entry) => entry?.name === 'cq:lastModified')?.value
    || '';
  return created || null;
}

async function resolveMasterData(origin, item) {
  const initialMedia = item?.media?._path ? `${origin}${item.media._path}` : null;
  if (!item?._path) return { media: initialMedia, createdAt: null };

  const masterUrl = `${origin}${item._path}/jcr:content/data/master.json`;
  try {
    const response = await fetch(masterUrl, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return { media: initialMedia, createdAt: null };
    const master = await response.json();
    const mediaPath = typeof master?.media === 'string' ? master.media : null;
    return {
      media: mediaPath ? `${origin}${mediaPath}` : initialMedia,
      createdAt: parseCreatedAt(master),
    };
  } catch (_) {
    return { media: initialMedia, createdAt: null };
  }
}

async function run() {
  const url = new URL(endpoint);
  const origin = `${url.protocol}//${url.host}`;
  url.searchParams.set('ts', `${Date.now()}`);
  const response = await fetch(url.toString(), {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch news snapshot: ${response.status}`);
  }

  const payload = await response.json();
  const rawItems = payload?.data?.newsList?.items || [];
  const items = await Promise.all(rawItems.map(async (item) => {
    const masterData = await resolveMasterData(origin, item);
    return {
      _path: item._path || '',
      title: item.title || '',
      slug: item.slug || '',
      description: {
        plaintext: item?.description?.plaintext || '',
      },
      media: masterData.media,
      createdAt: masterData.createdAt,
    };
  }));

  items.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    return bTime - aTime;
  });

  const outputJson = JSON.stringify({ items }, null, 2);
  await fs.writeFile(output, `${outputJson}\n`, 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`News snapshot updated: ${output} (${items.length} items)`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message || error);
  process.exit(1);
});
