// Chamadas à YouTube Data API v3 com o token do usuário.
import { getToken, AuthError } from './auth.js';

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

export async function getPlaylistTracks(id, limit = 500) {
  const items = await paginate('playlistItems', { part: 'snippet', playlistId: id }, limit);
  return items
    .filter((i) => i.snippet?.resourceId?.videoId && i.snippet.videoOwnerChannelTitle)
    .map((i) => toTrack(i.snippet.resourceId.videoId, i.snippet));
}

export async function getLiked(limit = 200) {
  const items = await paginate('videos', { part: 'snippet', myRating: 'like' }, limit);
  return items.map((v) => toTrack(v.id, v.snippet));
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
  const data = await call('search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: 25,
    q,
  });
  return (data.items || [])
    .filter((i) => i.id?.videoId)
    .map((i) => toTrack(i.id.videoId, i.snippet));
}
