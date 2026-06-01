import fs from 'node:fs/promises';

const endpoint = process.env.NEWS_GRAPHQL_URL
  || 'https://publish-p165802-e1765367.adobeaemcloud.com/graphql/execute.json/ref-demo-eds/news-by-folder;path=/content/dam/6a05cdafe815815bf04d6032';
const output = process.env.NEWS_OUTPUT_PATH || './news-data.json';

async function resolveMedia(origin, item) {
  if (item?.media?._path) return `${origin}${item.media._path}`;
  if (!item?._path) return null;

  const masterUrl = `${origin}${item._path}/jcr:content/data/master.json`;
  try {
    const response = await fetch(masterUrl, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return null;
    const master = await response.json();
    const mediaPath = typeof master?.media === 'string' ? master.media : null;
    return mediaPath ? `${origin}${mediaPath}` : null;
  } catch (_) {
    return null;
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
  const items = await Promise.all(rawItems.map(async (item) => ({
    _path: item._path || '',
    title: item.title || '',
    slug: item.slug || '',
    description: {
      plaintext: item?.description?.plaintext || '',
    },
    media: await resolveMedia(origin, item),
  })));

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
