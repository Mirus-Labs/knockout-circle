const CLOCK_RE = /^(\d{1,2}):(\d{2})(?:\s*UTC([+-]\d{1,2}))?$/i;

export function kickoffIso(meta = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) return null;
  const [year, month, day] = meta.date.split('-').map(Number);
  const clock = CLOCK_RE.exec((meta.time || '').trim());
  if (!clock) return new Date(Date.UTC(year, month - 1, day, 12)).toISOString();
  const offset = clock[3] == null ? 0 : Number(clock[3]);
  const value = new Date(Date.UTC(year, month - 1, day, Number(clock[1]) - offset, Number(clock[2])));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function localKickoff(meta = {}, options = {}) {
  const iso = meta.kickoffUtc || kickoffIso(meta);
  if (!iso) return { iso: null, local: null, venue: null, timeZone: null };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { iso: null, local: null, venue: null, timeZone: null };
  const locale = options.locale;
  let timeZone = options.timeZone;
  if (!timeZone) {
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { timeZone = 'UTC'; }
  }
  const format = (zone) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      }).format(date);
    }
  };
  return {
    iso,
    local: format(timeZone),
    venue: meta.venueTimeZone ? format(meta.venueTimeZone) : null,
    timeZone,
  };
}

const compact = (value) => value == null || value === '' ? null : value;

export function normalizeTeamStats(stats = {}) {
  const side = (team = {}) => ({
    possession: compact(team.possession),
    attempts: compact(team.attempts),
    onTarget: compact(team.onTarget),
    xg: compact(team.xg),
    passCompletion: compact(team.passCompletion),
    cards: compact(team.cards),
  });
  return { a: side(stats.a), b: side(stats.b) };
}

export function buildMatchFacts({ meta = {}, status = 'upcoming', score = {}, source = {}, report = null, liveHealth = null } = {}) {
  const kickoffUtc = meta.kickoffUtc || kickoffIso(meta);
  const events = report?.events?.length ? report.events : (source.events || []);
  const teamStats = report?.teamStats || source.teamStats ? { a:{}, b:{} } : null;
  if (teamStats) {
    for (const side of ['a','b']) {
      for (const field of ['possession','attempts','onTarget','xg','passCompletion','cards']) {
        teamStats[side][field] = report?.teamStats?.[side]?.[field] ?? source.teamStats?.[side]?.[field] ?? null;
      }
    }
  }
  return {
    kickoffUtc,
    status,
    periodLabel: source.periodLabel || (status === 'finished' ? 'Full time' : status === 'live' ? 'Live' : 'Upcoming'),
    clockMinute: compact(score.min),
    score: {
      regulation: [compact(score.a), compact(score.b)],
      extraTime: report?.score?.extraTime || null,
      penalties: score.penScore || report?.score?.penalties || null,
    },
    events,
    teamStats: teamStats ? normalizeTeamStats(teamStats) : null,
    formations: report?.formations || source.formations || null,
    lineups: report?.lineups || source.lineups || null,
    featuredPlayers: report?.featuredPlayers || [],
    playerOfMatch: report?.playerOfMatch || null,
    reportUrl: report?.reportUrl || null,
    sources: [...new Set([report?.source, source.source, meta.source].filter(Boolean))],
    updatedAt: report?.updatedAt || source.updatedAt || null,
    stale: !!liveHealth?.stale,
  };
}

export function decidingFact(stats) {
  if (!stats) return null;
  const a = stats.a || {}, b = stats.b || {};
  const delta = (key) => Number(a[key]) - Number(b[key]);
  if ([a.xg, b.xg].every((v) => Number.isFinite(Number(v))) && Math.abs(delta('xg')) >= 1.5) {
    return delta('xg') > 0
      ? `The clearest gap was chance quality: ${a.xg} to ${b.xg} expected goals.`
      : `The clearest gap was chance quality: ${b.xg} to ${a.xg} expected goals.`;
  }
  if ([a.onTarget, b.onTarget].every((v) => Number.isFinite(Number(v))) && Math.abs(delta('onTarget')) >= 5) {
    return delta('onTarget') > 0
      ? `The strongest difference was accuracy: ${a.onTarget} to ${b.onTarget} attempts on target.`
      : `The strongest difference was accuracy: ${b.onTarget} to ${a.onTarget} attempts on target.`;
  }
  return null;
}
