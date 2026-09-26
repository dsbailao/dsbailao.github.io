// Letras via LRCLIB (https://lrclib.net) — API aberta, com letras sincronizadas.
const API = 'https://lrclib.net/api/search';
const cache = new Map();

const NOISE = /(official|oficial|video|vídeo|clipe|clip|lyric|letra|legendad|tradu|audio|áudio|\bhd\b|\bhq\b|4k|visualizer|\bmv\b|remaster|ao vivo|\blive\b|dvd)/i;
const FEAT = /\s*[([]?\s*\b(ft\.?|feat\.?|featuring|part\.|participação)\s.*$/i;

export function parseTitle(rawTitle = '', channel = '') {
  let title = rawTitle
    .replace(/[([【]([^)\]】]*)[)\]】]/g, (m, inner) => (NOISE.test(inner) ? ' ' : m))
    .replace(/\s*[|｜].*$/, '')
    .replace(/\b(official|oficial)\s+(music\s+)?(video|vídeo|audio|áudio|clipe)\b/gi, '');

  let artist = channel
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/\s*(official|oficial)$/i, '');
  let track = title;

  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    artist = m[1];
    track = m[2];
  }

  const tidy = (s) => s.replace(FEAT, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  return { artist: tidy(artist), track: tidy(track) };
}

export function parseLrc(lrc = '') {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of tags) {
      lines.push({ time: Number(t[1]) * 60 + Number(t[2].replace(':', '.')), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function pick(items, duration, strict) {
  const score = (x) =>
    (x.instrumental ? 2000 : 0) +
    (x.syncedLyrics ? 0 : 1000) +
    (duration && x.duration ? Math.abs(x.duration - duration) : 50);
  const valid = items
    .filter((x) => x.syncedLyrics || x.plainLyrics || x.instrumental)
    .filter((x) => !strict || (duration && x.duration && Math.abs(x.duration - duration) <= 4));
  return valid.sort((a, b) => score(a) - score(b))[0] || null;
}

async function query(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

export async function fetchLyrics(track, duration = 0) {
  if (cache.has(track.id)) return cache.get(track.id);

  const { artist, track: name } = parseTitle(track.title, track.artist);
  const tries = [];
  if (artist) tries.push({ params: { track_name: name, artist_name: artist } });
  tries.push({ params: { q: `${artist} ${name}`.trim() } });
  tries.push({ params: { track_name: name }, strict: true });

  let best = null;
  for (const t of tries) {
    const items = await query(t.params);
    best = pick(items || [], duration, t.strict);
    if (best) break;
  }

  const result = best
    ? {
        instrumental: !!best.instrumental && !best.syncedLyrics && !best.plainLyrics,
        synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
        plain: best.plainLyrics || '',
        source: `${best.artistName} — ${best.trackName}`,
      }
    : null;

  cache.set(track.id, result);
  return result;
}
