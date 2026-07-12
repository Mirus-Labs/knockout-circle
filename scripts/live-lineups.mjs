/* FIFA live match feed → report-shaped lineups for the pre-match and in-play
   window, before the official Training Centre PDF exists. */

export const FIFA_LIVE_API = 'https://api.fifa.com/api/v3';
export const WORLD_CUP_2026 = { competition: 17, season: 285023 };

// FIFA's live feed encodes positions as 0..3; anything unexpected falls back
// to MF so a single odd player can't invalidate an otherwise complete XI.
const POSITIONS = ['GK', 'DF', 'MF', 'FW'];

const localized = (values) => {
  const list = Array.isArray(values) ? values : [];
  const en = list.find((v) => /^en/i.test(v?.Locale || ''));
  return ((en || list[0])?.Description || '').trim() || null;
};

// Lineups publish roughly an hour before kick-off; extra time and penalties
// keep a match in play for well over three hours after the listed start.
// The calendar endpoint silently returns null unless from/to sit exactly on
// an hour boundary, so the window snaps outward to whole hours.
export function liveLineupWindow(now = new Date()) {
  const hour = (offset) => {
    const at = new Date(Math.floor((now.getTime() + offset * 36e5) / 36e5) * 36e5);
    return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };
  return { from: hour(-4), to: hour(3) };
}

export function parseLiveLineups(match) {
  if (!match || match.MatchNumber == null) return null;
  const side = (team) => (team?.Players || [])
    .filter((p) => p.Status === 1 || p.Status === 2) // 1 = starter, 2 = substitute
    .map((p) => ({
      number: Number(p.ShirtNumber),
      position: POSITIONS[p.Position] || 'MF',
      name: localized(p.PlayerName),
      starter: p.Status === 1,
    }))
    .filter((p) => p.name && Number.isFinite(p.number))
    .sort((x, y) => Number(y.starter) - Number(x.starter));
  const a = side(match.HomeTeam), b = side(match.AwayTeam);
  const startersOf = (players) => players.filter((p) => p.starter).length;
  if (startersOf(a) !== 11 || startersOf(b) !== 11) return null; // XI not announced yet
  const formations = [match.HomeTeam?.Tactics, match.AwayTeam?.Tactics]
    .map((f) => /^\d(?:-\d){2,3}$/.test(f || '') ? f : null);
  return {
    matchNumber: Number(match.MatchNumber),
    teams: [localized(match.HomeTeam?.TeamName), localized(match.AwayTeam?.TeamName)],
    formations: formations.every(Boolean) ? formations : null,
    lineups: { a, b },
    source: 'FIFA live match feed',
  };
}
