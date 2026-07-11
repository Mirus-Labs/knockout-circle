const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const number = (value) => value == null ? null : Number(value);

export function parseReportText(raw, reportUrl) {
  const text = squash(raw);
  const header = text.match(/^([\p{L}][\p{L} .’'-]{1,70}?)\s+(\d+)\s*-\s*(\d+)\s+([\p{L}][\p{L} .’'-]{1,70}?)\s+(?:Group|Round|Quarter|Semi|Final)/iu);
  const match = text.match(/(?:Group [A-L]|Round of \d+|Quarter-final|Semi-final|Final)\s*-\s*Match\s+(\d+)/i);
  const urlMatch = String(reportUrl || '').match(/PMSR-M0*(\d+)/i);
  if (!header || (!match && !urlMatch)) return null;

  const attempts = text.match(/(\d+)\s*\(\s*(\d+)\s*\)\s+Attempts at Goal\s*\(\s*On Target\s*\)\s+(\d+)\s*\(\s*(\d+)\s*\)/i)
    || text.match(/(\d+)\s*\(\s*(\d+)\s*\)\s+(\d+)\s*\(\s*(\d+)\s*\)\s+Attempts at Goal\s*\(\s*On Target\s*\)/i);
  const passes = text.match(/(\d+)\s*\(\s*(\d+)\s*\)\s+Total Passes\s*\(\s*Complete\s*\)\s+(\d+)\s*\(\s*(\d+)\s*\)/i);
  const possession = text.match(/Possession\s+Total\s+([\d.]+)\s*%\s+[\d.]+\s*%\s+([\d.]+)\s*%\s+Total/i);
  const xg = text.match(/([\d.]+)\s+xG\s*\(\s*Expected Goals\s*\)\s+([\d.]+)/i)
    || text.match(/([\d.]+)\s+([\d.]+)\s+xG\s*\(\s*Expected Goals\s*\)/i);
  const completion = text.match(/([\d.]+)\s*%\s+Pass Completion\s*%\s+([\d.]+)\s*%/i)
    || text.match(/([\d.]+)\s*%\s+([\d.]+)\s*%\s+Pass Completion/i);
  const formations = [...text.matchAll(/\b\d\s*(?:-\s*\d\s*){2,3}\b/g)].map((m) => m[0].replace(/\s+/g, '')).slice(0, 2);
  const cleanValue = (value) => value == null ? null : number(String(value).replace('%', ''));
  const starting = [...text.matchAll(/\bSTARTING\b/gi)];
  const substitutes = [...text.matchAll(/\bSUBSTITUTES\b/gi)];
  const stripPlayerName = (value) => value.replace(/\d+(?:\+\d+)?'/g, '').replace(/\s+/g, ' ').trim();
  const leftLineup = [];
  const rightLineup = [];
  if (starting[0] && substitutes[0] && substitutes[0].index > starting[0].index) {
    const segment = text.slice(starting[0].index + starting[0][0].length, substitutes[0].index);
    for (const row of segment.matchAll(/(?:^|\s)(\d{1,2})\s+(GK|DF|MF|FW)\s+(.+?)(?=\s+\d{1,2}\s+(?:GK|DF|MF|FW)|$)/g)) {
      const name = stripPlayerName(row[3]);
      if (name) leftLineup.push({ number:Number(row[1]), position:row[2], name, starter:true });
    }
  }
  if (starting[1] && substitutes[1] && substitutes[1].index > starting[1].index) {
    const segment = text.slice(starting[1].index + starting[1][0].length, substitutes[1].index);
    for (const row of segment.matchAll(/(?:^|\s)([\p{Lu}][\p{L}’'.-]+(?:\s+[\p{Lu}][\p{L}’'.-]+){1,4})\s+(GK|DF|MF|FW)\s*(\d{1,2})(?=\s|$)/gu)) {
      const name = stripPlayerName(row[1]);
      if (name) rightLineup.push({ number:Number(row[3]), position:row[2], name, starter:true });
    }
  }

  return {
    parserVersion: 4,
    matchNumber: Number(match?.[1] || urlMatch[1]),
    teams: [header[1].replace(/^.*POST MATCH SUMMARY REPORT\s+/i, '').trim(), header[4].trim()],
    score: { regulation: [Number(header[2]), Number(header[3])] },
    formations: formations.length >= 2 ? formations : null,
    lineups: leftLineup.length >= 7 && rightLineup.length >= 7 ? { a:leftLineup.slice(0, 11), b:rightLineup.slice(0, 11) } : null,
    teamStats: {
      a: {
        possession: cleanValue(possession?.[1]), attempts: attempts ? Number(attempts[1]) : null,
        onTarget: attempts ? Number(attempts[2]) : null, xg: cleanValue(xg?.[1]),
        passCompletion: cleanValue(completion?.[1] || (passes ? Number(passes[2]) / Number(passes[1]) * 100 : null)), cards: null,
      },
      b: {
        possession: cleanValue(possession?.[2]), attempts: attempts ? Number(attempts[3]) : null,
        onTarget: attempts ? Number(attempts[4]) : null, xg: cleanValue(xg?.[2]),
        passCompletion: cleanValue(completion?.[2] || (passes ? Number(passes[4]) / Number(passes[3]) * 100 : null)), cards: null,
      },
    },
    reportUrl,
    source: 'FIFA Training Centre',
  };
}

export function discoverReportLinks(html, baseUrl) {
  const links = [];
  for (const match of String(html || '').matchAll(/href=["']([^"']*PMSR-M(\d+)-[^"']+\.pdf)["']/gi)) {
    links.push({ matchNumber: Number(match[2]), reportUrl: new URL(match[1], baseUrl).href });
  }
  return [...new Map(links.map((item) => [item.matchNumber, item])).values()];
}

export async function extractPdfText(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(4, pdf.numPages); pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n');
}
