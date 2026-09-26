// Autocompletar da busca e recomendações com base no gosto do usuário.
import { store } from './store.js';
import { parseTitle } from './lyrics.js';
import * as YT from './youtube.js';

/* ---------- autocompletar ---------- */
// Mesmo serviço usado pela caixa de busca do YouTube. Responde via JSONP
// (não tem CORS) e não consome a cota da YouTube Data API.
let seq = 0;

export function suggestQueries(q) {
  return new Promise((resolve, reject) => {
    const cb = `__dtSuggest${++seq}`;
    const el = document.createElement('script');
    const finish = (err, data) => {
      clearTimeout(timer);
      window[cb] = () => {}; // resposta atrasada não gera erro
      el.remove();
      if (err) reject(err);
      else resolve(data);
    };
    const timer = setTimeout(() => finish(new Error('Tempo esgotado')), 4000);
    window[cb] = (data) => finish(null, data);
    el.onerror = () => finish(new Error('Sem sugestões'));
    el.src = 'https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=pt-BR&gl=BR&ie=utf-8&oe=utf-8'
      + `&q=${encodeURIComponent(q)}&callback=${cb}`;
    document.head.appendChild(el);
  }).then((d) => (d?.[1] || []).map((x) => (Array.isArray(x) ? x[0] : x)).filter(Boolean));
}

/* ---------- histórico de reprodução ---------- */
export function recordPlay(track) {
  const plays = store.get('plays', {});
  plays[track.id] = { n: (plays[track.id]?.n || 0) + 1, at: Date.now(), t: track };
  const entries = Object.entries(plays);
  if (entries.length > 400) {
    entries.sort((a, b) => b[1].at - a[1].at);
    store.set('plays', Object.fromEntries(entries.slice(0, 400)));
  } else {
    store.set('plays', plays);
  }
}

export function mostPlayed(limit = 15, exclude = new Set()) {
  return Object.values(store.get('plays', {}))
    .filter((p) => p.n >= 2 && !exclude.has(p.t.id))
    .sort((a, b) => b.n - a.n || b.at - a.at)
    .slice(0, limit)
    .map((p) => p.t);
}

/* ---------- perfil de gosto ---------- */
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function topArtists({ liked = [], recent = [], plays = {} }, limit = 6) {
  const byArtist = new Map();
  const add = (track, weight) => {
    const name = parseTitle(track.title, track.artist).artist;
    const key = name && norm(name);
    if (!key || key.length < 2) return;
    const a = byArtist.get(key) || { name, thumb: track.thumb, score: 0, tracks: [] };
    a.score += weight;
    if (a.tracks.length < 40 && !a.tracks.some((t) => t.id === track.id)) a.tracks.push(track);
    byArtist.set(key, a);
  };
  liked.forEach((t, i) => add(t, i < 30 ? 2 : 1)); // curtidas recentes pesam mais
  recent.forEach((t) => add(t, 1));
  Object.values(plays).forEach((p) => add(p.t, Math.min(p.n, 10) * 1.5));
  return [...byArtist.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- recomendações ---------- */
const TTL = 12 * 3600_000;
const MIN_REFRESH = 3600_000;

export function cachedRecommendations() {
  return store.get('recs');
}

// Cada busca de playlist custa 100 unidades da cota diária (10.000),
// por isso o resultado fica guardado por 12h.
export async function getRecommendations({ liked = [], ownIds = [], force = false, exclude = new Set() } = {}) {
  const recent = store.get('recent', []).filter((t) => !exclude.has(t.id));
  const plays = Object.fromEntries(Object.entries(store.get('plays', {})).filter(([id]) => !exclude.has(id)));
  const artists = topArtists({ liked, recent, plays });
  const mixes = artists.map(({ name, thumb, tracks }) => ({ name, thumb, tracks }));
  const key = artists.slice(0, 3).map((a) => norm(a.name)).join('|');

  const cached = store.get('recs');
  const age = cached ? Date.now() - cached.at : Infinity;
  const stale = force || !cached || age > TTL || (cached.key !== key && age > MIN_REFRESH);

  let playlists = cached?.playlists || [];
  if (stale && artists.length) {
    playlists = await fetchPlaylistRecs(artists.slice(0, 3), new Set(ownIds));
  }
  const result = { at: stale ? Date.now() : cached.at, key, mixes, playlists };
  store.set('recs', result);
  return result;
}

async function fetchPlaylistRecs(artists, ownIds) {
  const settled = await Promise.allSettled(artists.map((a) => YT.searchPlaylists(`${a.name} playlist`, 6)));
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;

  const perArtist = settled.map((r, i) => (r.status === 'fulfilled' ? r.value : [])
    .filter((p) => p.count >= 8 && !ownIds.has(p.id))
    .slice(0, 4)
    .map((p) => ({ ...p, reason: `Porque você ouve ${artists[i].name}` })));

  // Intercala os artistas para a fileira não ficar agrupada.
  const out = [];
  const seen = new Set();
  for (let k = 0; k < 4; k++) {
    for (const list of perArtist) {
      const p = list[k];
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
  }
  return out;
}
