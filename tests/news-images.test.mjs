import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleSnippet,
  enrichNewsArticles,
  extractArticleImage,
  extractArticleMetadata,
  extractArticleSummary,
  summarySentenceCount,
} from '../scripts/news-images.mjs';

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

test('extractArticleMetadata returns a four-sentence publisher excerpt distinct from the title', () => {
  const metadata = extractArticleMetadata(`
    <meta property="og:description" content="A late winner settled a tense quarter-final and completed the tournament's final four.">
    <meta property="og:image" content="/story.jpg">
    <article>
      <p>England reached the semi-final.</p>
      <p>A late winner settled a tense quarter-final. The decisive goal arrived in stoppage time.</p>
      <p>The result completed the tournament's final four. Supporters celebrated long after the final whistle.</p>
    </article>
  `, 'https://publisher.example/sport/story', 'England reaches the semi-final');

  assert.equal(metadata.image, 'https://publisher.example/story.jpg');
  assert.equal(
    metadata.lede,
    "A late winner settled a tense quarter-final. The decisive goal arrived in stoppage time. The result completed the tournament's final four. Supporters celebrated long after the final whistle.",
  );
});

test('extractArticleSummary uses JSON-LD articleBody when visible paragraphs are unavailable', () => {
  const summary = extractArticleSummary(`
    <script type="application/ld+json">{
      "@type": "NewsArticle",
      "articleBody": "The opening match was tightly contested. Both teams created early chances. A second-half goal broke the deadlock. The winners held firm under late pressure. A fifth sentence is not included."
    }</script>
  `, 'Match report');

  assert.equal(
    summary,
    'The opening match was tightly contested. Both teams created early chances. A second-half goal broke the deadlock. The winners held firm under late pressure.',
  );
  assert.equal(summarySentenceCount(summary), 4);
});

test('articleSnippet rejects a description that repeats the headline and publisher', () => {
  assert.equal(
    articleSnippet('England reaches the semi-final &nbsp;&nbsp; The Guardian', 'England reaches the semi-final'),
    null,
  );
});

test('articleSnippet rejects visibly truncated publisher metadata', () => {
  assert.equal(articleSnippet('The quarter-finals are done and there are just four teams remaining in the', 'Best XI'), null);
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
    `<meta property="og:image" content="https://cdn.example/story.jpg">
     <article><p>The publisher explains what happened beyond the headline itself. The match remained level at half-time. A late goal decided the contest. The winning side protected its lead through stoppage time.</p></article>`,
    { headers: { 'content-type': 'text/html' } },
  );

  const result = await enrichNewsArticles([
    { title: 'Story', link: 'https://news.google.com/rss/articles/one', sourceUrl: 'https://publisher.example' },
    { title: 'Fallback', link: 'https://news.google.com/rss/articles/two', sourceUrl: 'https://other.example' },
  ], { decoder, fetchImpl });

  assert.equal(result[0].link, 'https://publisher.example/story');
  assert.equal(result[0].image, 'https://cdn.example/story.jpg');
  assert.equal(result[0].lede, 'The publisher explains what happened beyond the headline itself. The match remained level at half-time. A late goal decided the contest. The winning side protected its lead through stoppage time.');
  assert.equal(result[1].link, 'https://news.google.com/rss/articles/two');
  assert.equal('image' in result[1], false);
  assert.equal(result[1].lede, '');
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
