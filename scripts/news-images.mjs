import { GoogleDecoder } from 'google-news-url-decoder';
import { parse } from 'node-html-parser';

const ARTICLE_TIMEOUT_MS = 8000;
const ARTICLE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; KnockoutCircle/1.0; +https://github.com/Mirus-Labs/knockout-circle)',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.8',
};

const decodeEntities = (value = '') => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));

const cleanText = (value = '') => decodeEntities(String(value))
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const comparableText = (value = '') => cleanText(value)
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const SUMMARY_SENTENCES = 4;
const SUMMARY_MAX_LENGTH = 900;
const SUMMARY_NOISE = /(?:^(?:advertisement|sign up|subscribe|read more|related:|follow us|click here|all rights reserved)\b|\b(?:as it happened|knockout bracket|day-by-day schedule|follow our .+ app|predict the world cup knockout stages)\b)/i;

const sentencesFrom = (value, title) => {
  const comparableTitle = comparableText(title);
  return [...sentenceSegmenter.segment(cleanText(value))]
    .map(({ segment }) => segment.trim())
    .filter((sentence) => {
      if (sentence.length < 25 || SUMMARY_NOISE.test(sentence) || (sentence.match(/\|/g) || []).length > 1) return false;
      const comparable = comparableText(sentence);
      return comparable && !(comparableTitle && (
        comparable === comparableTitle
        || comparable.startsWith(`${comparableTitle} `)
        || comparableTitle.startsWith(`${comparable} `)
      ));
    })
    .map((sentence) => /[.!?…]["'’”)]*$/.test(sentence) ? sentence : `${sentence}.`);
};

export const summarySentenceCount = (value) => sentencesFrom(value, '').length;

const summaryFrom = (values, title) => {
  const sentences = [];
  const seen = new Set();
  let length = 0;
  for (const value of values) {
    for (const sentence of sentencesFrom(value, title)) {
      const comparable = comparableText(sentence);
      if (seen.has(comparable)) continue;
      if (sentences.length && length + sentence.length + 1 > SUMMARY_MAX_LENGTH) return sentences.join(' ');
      seen.add(comparable);
      sentences.push(sentence);
      length += sentence.length + 1;
      if (sentences.length === SUMMARY_SENTENCES) return sentences.join(' ');
    }
  }
  return sentences.join(' ');
};

const articleObjects = (value, found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => articleObjects(item, found));
  } else if (value && typeof value === 'object') {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some((type) => /(?:News)?Article/i.test(type || ''))) found.push(value);
    Object.values(value).forEach((item) => articleObjects(item, found));
  }
  return found;
};

export function extractArticleSummary(html, title = '', metadataDescriptions = []) {
  const root = parse(String(html || ''));
  const structuredBodies = [];
  const structuredDescriptions = [];
  root.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      for (const article of articleObjects(JSON.parse(script.text))) {
        if (article.articleBody) structuredBodies.push(article.articleBody);
        if (article.description) structuredDescriptions.push(article.description);
      }
    } catch { /* ignore malformed publisher JSON-LD */ }
  });

  const paragraphNodes = [
    ...root.querySelectorAll('[itemprop="articleBody"] p'),
    ...root.querySelectorAll('article p'),
    ...root.querySelectorAll('.article-body p'),
    ...root.querySelectorAll('.story-body p'),
  ];
  const paragraphs = [];
  const seenParagraphs = new Set();
  for (const paragraph of paragraphNodes) {
    const text = cleanText(paragraph.textContent);
    const comparable = comparableText(text);
    if (text.length < 35 || seenParagraphs.has(comparable)) continue;
    seenParagraphs.add(comparable);
    paragraphs.push(text);
  }

  const sourceGroups = [
    ...structuredBodies.map((body) => [body]),
    ...(paragraphs.length ? [paragraphs] : []),
    ...structuredDescriptions.map((description) => [description]),
    ...metadataDescriptions.map((description) => [description]),
  ];
  let best = '';
  for (const sourceGroup of sourceGroups) {
    const summary = summaryFrom(sourceGroup, title);
    if (summarySentenceCount(summary) > summarySentenceCount(best)) best = summary;
    if (summarySentenceCount(summary) >= 3) return summary;
  }
  return summaryFrom([...metadataDescriptions, ...structuredDescriptions, ...paragraphs], title) || best || null;
}

export function articleSnippet(value, title, maxLength = 280) {
  const text = cleanText(value);
  const comparable = comparableText(text);
  const comparableTitle = comparableText(title);
  const looksIncomplete = /\b(?:a|an|and|for|in|of|the|to|with)$/i.test(text);
  if (text.length < 35 || !comparable || looksIncomplete || (comparableTitle && comparable.startsWith(comparableTitle))) return null;
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength + 1).replace(/\s+\S*$/, '').trim();
  return `${shortened || text.slice(0, maxLength).trim()}…`;
}

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

export function extractArticleMetadata(html, pageUrl, title = '') {
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

  let image = null;
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image', 'image_src']) {
    image = usableUrl(candidates.get(key), pageUrl);
    if (image) break;
  }
  const descriptions = ['og:description', 'twitter:description', 'description']
    .map((key) => candidates.get(key))
    .filter(Boolean);
  const lede = extractArticleSummary(html, title, descriptions);
  return { image, lede };
}

export function extractArticleImage(html, pageUrl) {
  return extractArticleMetadata(html, pageUrl).image;
}

async function publisherMetadata(articleUrl, title, fetchImpl) {
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
    return extractArticleMetadata(await response.text(), response.url || articleUrl, title);
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
    const metadata = decodedUrl ? await publisherMetadata(decodedUrl, item.title, fetchImpl) : null;
    const { sourceUrl: _sourceUrl, ...publicItem } = item;
    const lede = metadata?.lede || articleSnippet(item.lede, item.title);
    return {
      ...publicItem,
      link,
      lede: lede || '',
      ...(metadata?.image ? { image: metadata.image } : {}),
    };
  }));
}
