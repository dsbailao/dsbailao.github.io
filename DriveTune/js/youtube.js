// Chamadas à YouTube Data API v3 com o token do usuário.
import { getToken, AuthError } from './auth.js';
import { store } from './store.js';

/* ---------- filtro "Somente músicas" ---------- */
export const isMusicOnly = () => store.get('musicOnly', true);
export const setMusicOnly = (on) => store.set('musicOnly', !!on);

// Sinais no título de que é música, para artistas que publicam fora da categoria "Música".
const MUSIC_HINT = /(official\s*(music\s*)?(video|audio|visualizer)|clipe|videoclipe|lyric|letra|visualizer|áudio oficial|audio oficial|\bft\.|\bfeat\.?\s|ao vivo|acústico|acustico|remix|\bmv\b|\(audio\)|\[audio\])/i;

function seconds(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

// Recebe um item de videos.list (snippet + contentDetails).
export function isMusicVideo(v) {
  const sn = v.snippet || {};
  if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') return false; // lives e estreias
  const dur = seconds(v.contentDetails?.duration);
  if (dur && dur < 45) return false; // Shorts
  if (sn.categoryId === '10') return true;
  const channel = sn.channelTitle || '';
  if (/\s-\sTopic$/i.test(channel) || /VEVO$/i.test(channel)) return true;
  return MUSIC_HINT.test(sn.title || '') && (!dur || dur <= 15 * 60);
}

// Busca categoria e duração dos vídeos (1 unidade de cota a cada 50) e devolve os IDs que são música.
export async function musicIds(ids) {
  const keep = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await call('videos', { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    (data.items || []).filter(isMusicVideo).forEach((v) => keep.add(v.id));
  }
  return keep;
}

// Aplica o filtro e anota quantos vídeos foram escondidos em `list.hidden`.
async function filterMusic(tracks) {
  if (!isMusicOnly() || !tracks.length) return Object.assign(tracks, { hidden: 0 });
  const keep = await musicIds(tracks.map((t) => t.id));
  const out = tracks.filter((t) => keep.has(t.id));
  return Object.assign(out, { hidden: tracks.length - out.length });
}

const BASE = 'https://www.googleapis.com/youtube/v3/';

async function call(path, params = {}) {
  const token = getToken();
  if (!token) throw new AuthError('Sessão expirada');
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new AuthError('Sessão expirada');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') throw new Error('Cota diária da API do YouTube esgotada. Tente amanhã.');
    throw new Error(data.error?.message || `Erro ${res.status} na API do YouTube`);
  }
  return data;
}

const decoder = document.createElement('textarea');
function decode(s = '') {
  decoder.innerHTML = s;
  return decoder.value;
}

function bestThumb(t = {}) {
  return (t.maxres || t.standard || t.high || t.medium || t.default || {}).url || '';
}

function cleanArtist(s = '') {
  return s.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

function toTrack(id, sn) {
  return {
    id,
    title: decode(sn.title),
    artist: cleanArtist(decode(sn.videoOwnerChannelTitle || sn.channelTitle || '')),
    thumb: bestThumb(sn.thumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

async function paginate(path, params, limit) {
  const items = [];
  let pageToken;
  do {
    const data = await call(path, { ...params, maxResults: 50, pageToken });
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken && items.length < limit);
  return items.slice(0, limit);
}

export async function getProfile() {
  const data = await call('channels', { part: 'snippet', mine: 'true' });
  const ch = data.items?.[0];
  return ch
    ? { name: decode(ch.snippet.title), avatar: bestThumb(ch.snippet.thumbnails) }
    : { name: 'Minha conta', avatar: '' };
}

export async function getPlaylists() {
  const items = await paginate('playlists', { part: 'snippet,contentDetails', mine: 'true' }, 200);
  return items.map((p) => ({
    id: p.id,
    title: decode(p.snippet.title),
    count: p.contentDetails?.itemCount ?? 0,
    thumb: bestThumb(p.snippet.thumbnails),
  }));
}

// Fração de músicas numa amostra da playlist (2 unidades de cota), para separar
// playlists de música das de vídeos na tela inicial.
export async function playlistMusicRatio(id, sample = 15) {
  const data = await call('playlistItems', { part: 'snippet', playlistId: id, maxResults: sample });
  const ids = (data.items || []).map((i) => i.snippet?.resourceId?.videoId).filter(Boolean);
  if (!ids.length) return 0;
  const keep = await musicIds(ids);
  return keep.size / ids.length;
}

export async function getPlaylistTracks(id, limit = 500) {
  const items = await paginate('playlistItems', { part: 'snippet', playlistId: id }, limit);
  const tracks = items
    .filter((i) => i.snippet?.resourceId?.videoId && i.snippet.videoOwnerChannelTitle)
    .map((i) => toTrack(i.snippet.resourceId.videoId, i.snippet));
  return filterMusic(tracks);
}

// "Curtidas" do YouTube incluem qualquer vídeo; com o filtro ligado ficam só as músicas.
// videos.list já traz categoria e duração, então o filtro aqui não custa chamadas extras.
export async function getLiked(limit = 400) {
  const items = await paginate('videos', { part: 'snippet,contentDetails', myRating: 'like' }, limit);
  const music = isMusicOnly() ? items.filter(isMusicVideo) : items;
  return Object.assign(music.map((v) => toTrack(v.id, v.snippet)), { hidden: items.length - music.length });
}

export async function searchPlaylists(q, max = 6) {
  const data = await call('search', { part: 'snippet', type: 'playlist', maxResults: max, q });
  const found = (data.items || []).filter((i) => i.id?.playlistId);
  if (!found.length) return [];
  // A busca não traz a quantidade de músicas; completamos com playlists.list (1 unidade de cota).
  const info = await call('playlists', { part: 'contentDetails', id: found.map((i) => i.id.playlistId).join(','), maxResults: 50 });
  const counts = new Map((info.items || []).map((p) => [p.id, p.contentDetails?.itemCount ?? 0]));
  return found.map((i) => ({
    id: i.id.playlistId,
    title: decode(i.snippet.title),
    channel: cleanArtist(decode(i.snippet.channelTitle || '')),
    count: counts.get(i.id.playlistId) ?? 0,
    thumb: bestThumb(i.snippet.thumbnails),
  }));
}

export async function search(q) {
  const musicOnly = isMusicOnly();
  const data = await call('search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: musicOnly ? '10' : undefined,
    videoEmbeddable: 'true',
    maxResults: 25,
    q,
  });
  const tracks = (data.items || [])
    .filter((i) => i.id?.videoId)
    .map((i) => toTrack(i.id.videoId, i.snippet));
  // Mesmo na categoria "Música" aparecem lives e Shorts; o filtro remove.
  return filterMusic(tracks);
}
