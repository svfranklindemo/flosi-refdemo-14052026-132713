import fs from 'node:fs/promises';

const endpoint = process.env.NEWS_GRAPHQL_URL
  || 'https://publish-p165802-e1765367.adobeaemcloud.com/graphql/execute.json/ref-demo-eds/news-by-folder;path=/content/dam/6a05cdafe815815bf04d6032';
const output = process.env.NEWS_OUTPUT_PATH || './news-data.json';

function parseCreatedAt(master) {
  // Primary: calendarMetadata (author env)
  const calendars = Array.isArray(master?._metadata?.calendarMetadata)
    ? master._metadata.calendarMetadata
    : [];
  const fromCal = (name) => calendars.find((e) => e?.name === name)?.value || '';

  // Fallback: @LastModified fields present in publish master.json
  // Use the most recent field's date as the "content updated" date
  const lastModFields = Object.entries(master || {})
    .filter(([k]) => k.endsWith('@LastModified') && !k.includes('By'))
    .map(([, v]) => v)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  const updatedAt = fromCal('cq:lastModified') || lastModFields[0] || null;
  // Use the oldest @LastModified as proxy for creation date
  const createdAt = fromCal('jcr:created')
    || (lastModFields.length ? lastModFields[lastModFields.length - 1] : null);

  return {
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    publishedAt: fromCal('cq:lastPublished') || null,
    authorName: fromCal('jcr:createdBy') || master?.['title@LastModifiedBy'] || null,
    updatedBy: fromCal('cq:lastModifiedBy') || master?.['title@LastModifiedBy'] || null,
  };
}

async function resolveMasterData(origin, item) {
  const initialMedia = item?.media?._path ? `${origin}${item.media._path}` : null;
  if (!item?._path) {
    return {
      media: initialMedia,
      content: '',
      createdAt: null,
      updatedAt: null,
      publishedAt: null,
      authorName: null,
      updatedBy: null,
    };
  }

  const masterUrl = `${origin}${item._path}/jcr:content/data/master.json`;
  try {
    const response = await fetch(masterUrl, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) {
      return {
        media: initialMedia,
        content: '',
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        authorName: null,
        updatedBy: null,
      };
    }
    const master = await response.json();
    const mediaPath = typeof master?.media === 'string' ? master.media : null;
    const content = master?.content?.html || master?.content?.plaintext || master?.content || '';
    const dates = parseCreatedAt(master);
    const category = typeof master?.category === 'string' ? master.category : null;

    // Fetch asset node JSON to get cq:lastPublished (not in data/master.json)
    let publishedAt = dates.publishedAt;
    if (!publishedAt) {
      try {
        const assetRes = await fetch(`${origin}${item._path}.json`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (assetRes.ok) {
          const asset = await assetRes.json();
          const jcrContent = asset?.['jcr:content'] || {};
          publishedAt = jcrContent?.['cq:lastPublished']
            || jcrContent?.['cq:lastReplicated']
            || asset?.['cq:lastPublished']
            || null;
        }
      } catch (_) { /* ignore */ }
    }

    return {
      media: mediaPath ? `${origin}${mediaPath}` : initialMedia,
      content,
      category,
      ...dates,
      publishedAt,
    };
  } catch (_) {
    return {
      media: initialMedia,
      content: '',
      createdAt: null,
      updatedAt: null,
      publishedAt: null,
      authorName: null,
      updatedBy: null,
    };
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
      category: item.category || masterData.category || null,
      description: {
        plaintext: item?.description?.plaintext || '',
      },
      media: masterData.media,
      content: masterData.content || '',
      createdAt: masterData.createdAt,
      updatedAt: masterData.updatedAt,
      publishedAt: masterData.publishedAt,
      authorName: masterData.authorName,
      updatedBy: masterData.updatedBy,
    };
  }));

  // Sort by publishedAt (cq:lastPublished) — newest first
  items.sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || a.createdAt || '') || 0;
    const bTime = Date.parse(b.publishedAt || b.createdAt || '') || 0;
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
