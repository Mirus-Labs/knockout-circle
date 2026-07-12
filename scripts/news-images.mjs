import { GoogleDecoder } from 'google-news-url-decoder';

const ARTICLE_TIMEOUT_MS = 8000;
const ARTICLE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; KnockoutCircle/1.0; +https://github.com/Mirus-Labs/knockout-circle)',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.8',
};

const decodeEntities = (value = '') => value
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));

const attributesOf = (tag) => {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
};

const usableUrl = (value, baseUrl) => {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

const publisherMatches = (articleUrl, sourceUrl) => {
  if (!sourceUrl) return true;
  try {
    const clean = (hostname) => hostname.toLowerCase().replace(/^www\./, '');
    const articleHost = clean(new URL(articleUrl).hostname);
    const sourceHost = clean(new URL(sourceUrl).hostname);
    if (articleHost === sourceHost || articleHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${articleHost}`)) return true;
    return articleHost.startsWith('bbc.') && sourceHost.startsWith('bbc.');
  } catch {
    return false;
  }
};

export function extractArticleImage(html, pageUrl) {
  const candidates = new Map();
  for (const match of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = attributesOf(match[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || '').toLowerCase();
    if (attributes.content && !candidates.has(key)) candidates.set(key, attributes.content);
  }
  for (const match of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesOf(match[0]);
    if ((attributes.rel || '').toLowerCase().split(/\s+/).includes('image_src') && attributes.href) {
      candidates.set('image_src', attributes.href);
      break;
    }
  }

  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image', 'image_src']) {
    const image = usableUrl(candidates.get(key), pageUrl);
    if (image) return image;
  }
  return null;
}

async function publisherImage(articleUrl, fetchImpl) {
  try {
    const response = await fetchImpl(articleUrl, {
      headers: ARTICLE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const type = response.headers.get('content-type') || '';
    if (type && !type.includes('text/html') && !type.includes('application/xhtml+xml')) {
      await response.body?.cancel();
      return null;
    }
    return extractArticleImage(await response.text(), response.url || articleUrl);
  } catch {
    return null;
  }
}

export async function enrichNewsArticles(news, { fetchImpl = fetch, decoder = new GoogleDecoder() } = {}) {
  if (!Array.isArray(news) || !news.length) return [];

  // Decode one URL per request. Google's batch endpoint does not guarantee
  // response order, so treating a batch as positional can attach the wrong
  // publisher URL and image to a headline.
  const decoded = [];
  for (const item of news) {
    try {
      decoded.push(await decoder.decode(item.link));
    } catch {
      decoded.push({ status: false });
    }
  }

  return Promise.all(news.map(async (item, index) => {
    const candidate = decoded[index]?.status ? usableUrl(decoded[index].decoded_url) : null;
    const decodedUrl = candidate && publisherMatches(candidate, item.sourceUrl) ? candidate : null;
    const link = decodedUrl || item.link;
    const image = decodedUrl ? await publisherImage(decodedUrl, fetchImpl) : null;
    const { sourceUrl: _sourceUrl, ...publicItem } = item;
    return { ...publicItem, link, ...(image ? { image } : {}) };
  }));
}
