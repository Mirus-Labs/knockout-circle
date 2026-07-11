import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverReportLinks, parseReportText } from '../scripts/match-report.mjs';

const REPORT_TEXT = `
  POST MATCH SUMMARY REPORT Germany 7 - 1 Curaçao Group E - Match 10
  FORMATION 3-4-3 FORMATION 4-1-2-3
  Possession Total 57.8% 6.9% 35.3% Total
  7 Goals 1
  4.17 xG (Expected Goals) 0.4
  26 (12) Attempts at Goal (On Target) 8 (2)
  641 (569) Total Passes (Complete) 362 (291)
  89 % Pass Completion % 80 %
`;

test('parseReportText extracts only the approved FIFA summary fields', () => {
  const report = parseReportText(REPORT_TEXT, 'https://example.test/PMSR-M10-GER-V-CUW-V2.pdf');
  assert.equal(report.matchNumber, 10);
  assert.deepEqual(report.teams, ['Germany', 'Curaçao']);
  assert.deepEqual(report.formations, ['3-4-3', '4-1-2-3']);
  assert.deepEqual(report.teamStats.a, {
    possession: 57.8, attempts: 26, onTarget: 12, xg: 4.17, passCompletion: 89, cards: null,
  });
  assert.equal(report.teamStats.b.onTarget, 2);
});

test('parseReportText rejects reports without a validated match identity', () => {
  assert.equal(parseReportText('Germany 7 - 1 Curaçao', 'https://example.test/report.pdf'), null);
});

test('discoverReportLinks de-duplicates revised report URLs by match number', () => {
  const links = discoverReportLinks(`
    <a href="/media/PMSR-M10-GER-V-CUW.pdf">old</a>
    <a href="/media/PMSR-M10-GER-V-CUW-V2.pdf">new</a>
    <a href="/media/PMSR-M11-USA-V-PAR.pdf">other</a>
  `, 'https://www.fifatrainingcentre.com/hub');
  assert.deepEqual(links.map((item) => item.matchNumber), [10, 11]);
  assert.match(links[0].reportUrl, /PMSR-M10-GER-V-CUW-V2\.pdf$/);
});
