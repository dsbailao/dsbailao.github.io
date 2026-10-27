// Navidrome pela API Subsonic: login, biblioteca, busca e endereço do áudio.
// O login usa o token md5(senha + salt), então a senha nunca fica salva.
import { store } from './store.js';
import { AuthError } from './auth.js';
import { md5 } from './md5.js';

const CLIENT = { v: '1.16.1', c: 'DriveTunes' };
const COVER_SIZE = 400;

const creds = () => store.get('navidrome');
export const isConnected = () => !!creds();
export function account() {
  const c = creds();
  return c ? { url: c.url, user: c.user } : null;
}

// Aceita "musica.exemplo.com", com ou sem https://, ou o endereço copiado da tela do Navidrome.
function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new Error('Endereço do servidor inválido.');
  }
  return url.origin + url.pathname.replace(/\/(app|rest)(\/.*)?$/i, '').replace(/\/+$/, '');
}

function endpoint(c, method, params = {}) {
  const url = new URL(`rest/${method}.view`, `${c.url}/`);
  for (const [k, v] of Object.entries({ u: c.user, t: c.token, s: c.salt, ...CLIENT, ...params })) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  return url.href;
}

async function call(method, params = {}, c = creds()) {
  if (!c) throw new AuthError('Navidrome desconectado');
  let res;
  try {
    res = await fetch(endpoint(c, method, { ...params, f: 'json' }));
  } catch {
    throw new Error('Sem conexão com o Navidrome. Verifique a internet.');
  }
  const data = (await res.json().catch(() => null))?.['subsonic-response'];
  if (!data) throw new Error(`Erro ${res.status} no Navidrome`);
  if (data.status !== 'ok') {
    if (data.error?.code === 40) throw new AuthError('Usuário ou senha do Navidrome incorretos.');
    throw new Error(data.error?.message || 'Erro no Navidrome');
  }
  return data;
}

export async function connect({ url, user, password }) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const c = { url: normalizeUrl(url), user: String(user || '').trim(), salt, token: md5(password + salt) };
  await call('ping', {}, c);
  store.set('navidrome', c);
  return account();
}

export const disconnect = () => store.remove('navidrome');

/* ---------- conversão para o formato do app ---------- */
const cover = (id, c) => (id ? endpoint(c, 'getCoverArt', { id, size: COVER_SIZE }) : '');

function toTrack(s, c) {
  return {
    id: s.id,
    title: s.title || 'Sem título',
    artist: s.displayArtist || s.artist || '',
    album: s.album || '',
    artistId: s.artistId || '',
    genre: s.genre || '',
    year: s.year || 0,
    duration: s.duration || 0,
    thumb: cover(s.coverArt, c),
  };
}

// Álbuns e playlists usam o mesmo card das playlists do YouTube (`reason` é a linha de baixo).
function toAlbum(a, c) {
  return {
    id: `album:${a.id}`,
    title: a.name || a.title || 'Álbum',
    reason: a.displayArtist || a.artist || '',
    count: a.songCount || 0,
    thumb: cover(a.coverArt, c),
  };
}

function toPlaylist(p, c) {
  return { id: `pl:${p.id}`, title: p.name || 'Playlist', count: p.songCount || 0, thumb: cover(p.coverArt, c) };
}

/* ---------- biblioteca ---------- */
export async function search(q) {
  const c = creds();
  const r = (await call('search3', { query: q, songCount: 50, albumCount: 12, artistCount: 0 })).searchResult3 || {};
  return { albums: (r.album || []).map((a) => toAlbum(a, c)), songs: (r.song || []).map((s) => toTrack(s, c)) };
}

// Autocompletar: nomes de artistas, álbuns e músicas do próprio servidor.
export async function suggest(q) {
  const r = (await call('search3', { query: q, songCount: 5, albumCount: 3, artistCount: 3 })).searchResult3 || {};
  const names = [...(r.artist || []), ...(r.album || [])].map((x) => x.name).concat((r.song || []).map((s) => s.title));
  return [...new Set(names.filter(Boolean))];
}

// type: recent (tocados recentemente), alphabeticalByName, newest, frequent…
export async function getAlbums(type, max = 20) {
  const c = creds();
  const out = [];
  while (out.length < max) {
    const size = Math.min(500, max - out.length);
    const page = (await call('getAlbumList2', { type, size, offset: out.length })).albumList2?.album || [];
    out.push(...page.map((a) => toAlbum(a, c)));
    if (page.length < size) break;
  }
  return out;
}

export async function getPlaylists() {
  const c = creds();
  return ((await call('getPlaylists')).playlists?.playlist || []).map((p) => toPlaylist(p, c));
}

// Músicas marcadas com estrela no Navidrome.
export async function getStarred() {
  const c = creds();
  return ((await call('getStarred2')).starred2?.song || []).map((s) => toTrack(s, c));
}

/* ---------- matéria-prima dos mixes e do rádio ---------- */
// Gêneros da biblioteca, do maior para o menor.
export async function getGenres() {
  const list = (await call('getGenres')).genres?.genre || [];
  return list
    .map((g) => ({ name: g.value || '', songs: g.songCount || 0 }))
    .filter((g) => g.name)
    .sort((a, b) => b.songs - a.songs);
}

// Sorteio do próprio servidor, opcionalmente por gênero ou faixa de anos.
export async function getRandomSongs({ size = 50, genre, fromYear, toYear } = {}) {
  const c = creds();
  const r = await call('getRandomSongs', { size, genre, fromYear, toYear });
  return (r.randomSongs?.song || []).map((s) => toTrack(s, c));
}

// Músicas de artistas parecidos (depende do Navidrome ter Last.fm/Deezer; sem isso volta vazio).
export async function getSimilarSongs(id, count = 50) {
  const c = creds();
  return ((await call('getSimilarSongs2', { id, count })).similarSongs2?.song || []).map((s) => toTrack(s, c));
}

// Músicas de um artista, pela busca (filtra quem só cita o nome no título).
export async function artistSongs(name, max = 40) {
  const c = creds();
  const key = name.toLowerCase();
  const r = (await call('search3', { query: name, songCount: max, albumCount: 0, artistCount: 0 })).searchResult3 || {};
  return (r.song || []).filter((s) => (s.artist || '').toLowerCase().includes(key)).map((s) => toTrack(s, c));
}

// Coleções: "starred", "album:<id>" ou "pl:<id>".
export async function getTracks(id) {
  if (id === 'starred') return getStarred();
  const c = creds();
  const sep = id.indexOf(':');
  const kind = id.slice(0, sep);
  const key = id.slice(sep + 1);
  const songs = kind === 'album'
    ? (await call('getAlbum', { id: key })).album?.song
    : (await call('getPlaylist', { id: key })).playlist?.entry;
  return (songs || []).map((s) => toTrack(s, c));
}

/* ---------- reprodução ---------- */
export function streamUrl(id) {
  const c = creds();
  return c ? endpoint(c, 'stream', { id }) : '';
}

// Registra a música como tocada (alimenta "Tocados recentemente" e as estatísticas do servidor).
export const scrobble = (id) => call('scrobble', { id, submission: true });
