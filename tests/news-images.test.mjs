import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichNewsArticles, extractArticleImage } from '../scripts/news-images.mjs';

test('extractArticleImage prefers Open Graph and resolves relative URLs', () => {
  const html = `
    <meta name="twitter:image" content="https://cdn.example/twitter.jpg">
    <meta content="/images/story.jpg?size=large&amp;crop=1" property="og:image">
  `;
  assert.equal(
    extractArticleImage(html, 'https://publisher.example/sport/story'),
    'https://publisher.example/images/story.jpg?size=large&crop=1',
  );
});

test('extractArticleImage rejects non-http image sources', () => {
  assert.equal(
    extractArticleImage('<meta property="og:image" content="data:image/png;base64,abc">', 'https://publisher.example'),
    null,
  );
});

test('enrichNewsArticles uses publisher URL and omits image when metadata is unavailable', async () => {
  const decoder = {
    calls: 0,
    async decode() {
      this.calls += 1;
      return this.calls === 1
        ? { status: true, decoded_url: 'https://publisher.example/story' }
        : { status: false, message: 'unavailable' };
    },
  };
  const fetchImpl = async () => new Response(
    '<meta property="og:image" content="https://cdn.example/story.jpg">',
    { headers: { 'content-type': 'text/html' } },
  );

  const result = await enrichNewsArticles([
    { title: 'Story', link: 'https://news.google.com/rss/articles/one', sourceUrl: 'https://publisher.example' },
    { title: 'Fallback', link: 'https://news.google.com/rss/articles/two', sourceUrl: 'https://other.example' },
  ], { decoder, fetchImpl });

  assert.equal(result[0].link, 'https://publisher.example/story');
  assert.equal(result[0].image, 'https://cdn.example/story.jpg');
  assert.equal(result[1].link, 'https://news.google.com/rss/articles/two');
  assert.equal('image' in result[1], false);
  assert.equal('sourceUrl' in result[0], false);
});

test('enrichNewsArticles rejects a decoded URL from the wrong publisher', async () => {
  const result = await enrichNewsArticles([
    { title: 'Story', link: 'https://news.google.com/rss/articles/one', sourceUrl: 'https://theguardian.com' },
  ], {
    decoder: { decode: async () => ({ status: true, decoded_url: 'https://aljazeera.com/news/story' }) },
    fetchImpl: async () => assert.fail('wrong publisher page must not be fetched'),
  });

  assert.equal(result[0].link, 'https://news.google.com/rss/articles/one');
  assert.equal('image' in result[0], false);
});
