const fold = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');

export function matchesPlayerVideo({ name, title, authorName, allowedChannels = ['FIFA'] } = {}) {
  if (!allowedChannels.some((channel) => fold(channel) === fold(authorName))) return false;
  const tokens = fold(name).split(/\s+/).filter((token) => token.length > 1);
  const heading = fold(title);
  return tokens.length > 0 && tokens.every((token) => heading.split(/\s+/).includes(token));
}
