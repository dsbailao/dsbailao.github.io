import { CONFIG } from './config.js';
import { store } from './store.js';
import { initAuth, isAuthReady, signIn, signOut, getToken, AuthError } from './auth.js';
import * as YT from './youtube.js';
import { initPlayer, Player, onPlayer } from './player.js';
import { fetchLyrics } from './lyrics.js';
import * as Media from './media.js';
import { suggestQueries, recordPlay, mostPlayed, getRecommendations, cachedRecommendations } from './suggest.js';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const icon = (id, cls = 'ic') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- estado ---------- */
const S = {
  queue: [], original: null, index: -1,
  shuffle: false, repeat: 'off',
  mode: 'cover', view: 'home', backTo: 'library',
  playing: false, ytState: -1, resumeAt: 0,
  lyrics: null, lyricsFor: null, activeLine: -1, userScrollAt: 0, offset: 0,
  profile: store.get('profile'),
  playlists: store.get('playlists'),
  playlistCache: new Map(),
  recs: cachedRecommendations(), recsLoading: false,
  showVideo: false, // vídeo no modo Player; sempre começa desligado
  seeking: false, seekP: 0, lastSave: 0, errors: 0, videoWarned: false,
  overlayTimer: null,
};
const lists = {};
const TITLES = { home: 'Início', search: 'Buscar', library: 'Biblioteca', playlist: 'Playlist', queue: 'Fila', playing: 'Tocando agora' };
const current = () => S.queue[S.index] || null;

/* ---------- inicialização ---------- */
async function boot() {
  $('#origin-hint').textContent = location.origin;
  // Com Client ID fixo no código não faz sentido oferecer a troca.
  if (CONFIG.GOOGLE_CLIENT_ID) $$('[data-action="change-client"]').forEach((el) => { el.hidden = true; });
  injectTemplates();
  bindEvents();

  const clientId = CONFIG.GOOGLE_CLIENT_ID || store.get('clientId');
  if (!clientId) return showScreen('setup');

  try {
    await initAuth(clientId);
  } catch {
    toast('Não foi possível carregar o login do Google. Verifique a internet.');
  }
  // Já logou antes? Entra direto: a reprodução não depende do token,
  // e se ele expirou pedimos para reconectar só quando precisar.
  if (getToken() || S.profile) enterApp();
  else showScreen('login');
}

function showScreen(name) {
  $('#screen-setup').hidden = name !== 'setup';
  $('#screen-login').hidden = name !== 'login';
  $('#app').hidden = name !== 'app';
  placePlayer();
}

let entered = false;
function enterApp() {
  showScreen('app');
  if (entered) return;
  entered = true;

  initPlayer('yt-player').then(() => {
    const t = current();
    if (t) Player.cue(t.id, S.resumeAt);
  });

  Media.initMedia({
    play: () => togglePlay(true),
    pause: () => Player.pause(),
    nexttrack: () => next(),
    previoustrack: () => prev(),
    seekto: (d) => Player.seek(d.seekTime),
    seekbackward: () => Player.seek(Player.time() - 10),
    seekforward: () => Player.seek(Player.time() + 10),
  });

  restoreSession();
  navigate('home');
  updateNowPlaying();
  updateButtons();
  renderProfile();
  startClock();
  setInterval(tick, 250);

  if (getToken()) {
    loadProfile();
    loadPlaylists().then(() => loadRecommendations());
  } else {
    authExpired();
  }
}

function injectTemplates() {
  const progress = `
    <div class="progress-wrap">
      <div class="progress js-seek" role="slider" aria-label="Posição da música">
        <div class="progress-track"><div class="progress-fill"></div><div class="progress-knob"></div></div>
      </div>
      <div class="times"><span class="js-cur">0:00</span><span class="js-dur">0:00</span></div>
    </div>`;
  const controls = (compact) => `
    <div class="ctrls${compact ? ' compact' : ''}">
      <button class="ctrl js-shuffle" data-action="shuffle" aria-label="Aleatório">${icon('shuffle')}</button>
      <button class="ctrl" data-action="prev" aria-label="Anterior">${icon('prev')}</button>
      <button class="ctrl ctrl-main js-play" data-action="toggle" aria-label="Tocar/Pausar">${icon('play')}</button>
      <button class="ctrl" data-action="next" aria-label="Próxima">${icon('next')}</button>
      <button class="ctrl js-repeat" data-action="repeat" aria-label="Repetir">${icon('repeat')}</button>
    </div>`;
  $$('[data-progress]').forEach((el) => { el.outerHTML = progress; });
  $$('[data-controls]').forEach((el) => { el.outerHTML = controls(el.dataset.controls === 'compact'); });
  $$('.js-seek').forEach(bindSeek);
}

/* ---------- eventos ---------- */
function bindEvents() {
  document.addEventListener('click', onClick);

  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#client-id').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) {
      toast('Client ID inválido. Ele termina com .apps.googleusercontent.com');
      return;
    }
    store.set('clientId', id);
    location.reload();
  });

  $('#btn-login').addEventListener('click', async () => {
    if (!isAuthReady()) {
      const id = CONFIG.GOOGLE_CLIENT_ID || store.get('clientId');
      initAuth(id).then(() => toast('Pronto. Toque em "Entrar com Google" novamente.'))
        .catch(() => toast('Sem conexão com o Google. Verifique a internet.'));
      return;
    }
    try {
      await signIn();
      enterApp();
      loadProfile();
      loadPlaylists().then(() => loadRecommendations());
    } catch (e) {
      toast(e.message);
    }
  });

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const active = $('#suggest .sg.active .sg-main');
    doSearch(active ? active.dataset.q : $('#search-input').value);
  });
  bindSuggest();

  const lyr = $('#lyrics');
  const mark = () => { S.userScrollAt = Date.now(); };
  lyr.addEventListener('wheel', mark, { passive: true });
  lyr.addEventListener('touchmove', mark, { passive: true });

  $('#video-stage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .progress')) { showOverlay(); return; }
    const ov = $('#video-overlay');
    if (ov.classList.contains('show')) hideOverlay();
    else showOverlay();
  });

  window.addEventListener('resize', () => requestAnimationFrame(placePlayer));
  new ResizeObserver(() => placePlayer()).observe(document.body);

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key;
    if (k === ' ' || k === 'MediaPlayPause') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowRight') Player.seek(Player.time() + 10);
    else if (k === 'ArrowLeft') Player.seek(Player.time() - 10);
    else if (k === 'MediaTrackNext' || k === 'n') next();
    else if (k === 'MediaTrackPrevious' || k === 'p') prev();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu, #btn-avatar')) $('#menu').hidden = true;
  }, true);

  onPlayer('state', onPlayerState);
  onPlayer('error', onPlayerError);
}

function onClick(e) {
  const nav = e.target.closest('[data-nav]');
  if (nav) { navigate(nav.dataset.nav); return; }

  const mode = e.target.closest('[data-mode].mode-tab');
  if (mode) { setMode(mode.dataset.mode); return; }

  const line = e.target.closest('.ly[data-t]');
  if (line) {
    Player.seek(Number(line.dataset.t) - S.offset);
    S.userScrollAt = 0;
    return;
  }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, list, index, id, q } = el.dataset;
  const tracks = lists[list];
  const i = Number(index);

  switch (action) {
    case 'toggle': togglePlay(); break;
    case 'next': next(); break;
    case 'prev': prev(); break;
    case 'shuffle': toggleShuffle(); break;
    case 'repeat': cycleRepeat(); break;
    case 'play-from': playList(tracks, i); break;
    case 'play-list': playList(tracks, 0); break;
    case 'shuffle-list': playList(tracks, 0, { shuffle: true }); break;
    case 'play-next': playNext(tracks[i]); break;
    case 'jump': playIndex(i); break;
    case 'queue-remove': removeFromQueue(i); break;
    case 'queue-clear': clearQueue(); break;
    case 'open-playlist': openPlaylist(id); break;
    case 'shuffle-liked': shuffleLiked(); break;
    case 'voice': startVoice(); break;
    case 'search-chip': doSearch(q); break;
    case 'back': navigate(S.backTo || 'library'); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'menu': $('#menu').hidden = !$('#menu').hidden; break;
    case 'logout': logout(); break;
    case 'change-client': changeClient(); break;
    case 'modal-ok': $('#modal').hidden = true; break;
    case 'lyrics-retry': S.lyricsFor = null; maybeLoadLyrics(true); break;
    case 'sync-minus': setOffset(S.offset - 0.5); break;
    case 'sync-plus': setOffset(S.offset + 0.5); break;
    case 'reconnect': reconnect(); break;
    case 'toggle-video': toggleVideo(); break;
    case 'suggest-pick': doSearch(q); break;
    case 'suggest-fill': fillSuggestion(q); break;
    case 'artist-mix': playArtistMix(i); break;
    case 'recs-refresh': loadRecommendations({ force: true }); break;
  }
}

/* ---------- navegação ---------- */
function navigate(view, opts = {}) {
  if (view !== 'playlist' && view !== 'playing') S.backTo = view;
  S.view = view;
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  $$('.rail-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === view || (view === 'playlist' && b.dataset.nav === 'library'));
  });
  $('#view-title').textContent = opts.title || TITLES[view];
  $('#btn-back').hidden = view !== 'playlist';
  $('#app').dataset.view = view;
  $('#mini').hidden = !current() || view === 'playing';
  $('#menu').hidden = true;
  $('#views').scrollTop = 0;

  if (view === 'home') renderHome();
  if (view === 'library') renderLibrary();
  if (view === 'queue') renderQueue();
  if (view === 'search' && !$('#search-body').innerHTML) renderSearchIdle();
  if (view === 'playing') setMode(S.mode);

  requestAnimationFrame(placePlayer);
}

function warnVideo() {
  if (S.videoWarned) return;
  S.videoWarned = true;
  $('#modal').hidden = false;
}

function toggleVideo() {
  S.showVideo = !S.showVideo;
  if (S.showVideo) warnVideo();
  const btn = $('#btn-art-toggle');
  btn.setAttribute('aria-pressed', S.showVideo);
  btn.querySelector('use').setAttribute('href', S.showVideo ? '#i-album' : '#i-video');
  btn.querySelector('span').textContent = S.showVideo ? 'Mostrar capa' : 'Mostrar vídeo';
  placePlayer();
}

function setMode(mode) {
  if (mode === 'video' && S.view === 'playing') warnVideo();
  S.mode = mode;
  $('#view-playing').dataset.mode = mode;
  $$('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== mode; });
  if (mode === 'lyrics') requestAnimationFrame(() => scrollToActive(true));
  if (mode === 'video') showOverlay();
  requestAnimationFrame(placePlayer);
  saveSession();
}

/* ---------- player do YouTube posicionado sobre o slot visível ---------- */
// O vídeo só aparece no modo Vídeo ou no modo Player com "Mostrar vídeo" ligado.
// Nos demais casos o player fica fora da tela (o áudio continua) e o slot mostra a capa.
function placePlayer() {
  const wrap = $('#player-wrap');
  const hide = () => { wrap.style.cssText = 'left:-10000px;top:0;width:320px;height:180px'; };
  if (!current() || $('#app').hidden || S.view !== 'playing') return hide();
  const videoVisible = S.mode === 'video' || (S.mode === 'cover' && S.showVideo);
  if (!videoVisible) return hide();
  const slot = $(`#slot-${S.mode}`);
  const r = slot?.getBoundingClientRect();
  if (!r || r.width < 2 || r.height < 2) return hide();
  const radius = getComputedStyle(slot).borderRadius;
  const css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${radius}`;
  if (wrap.style.cssText !== css) wrap.style.cssText = css;
}

/* ---------- reprodução ---------- */
function playList(tracks, start = 0, { shuffle = false } = {}) {
  if (!tracks?.length) return;
  S.queue = tracks.slice();
  S.original = null;
  S.index = clamp(start, 0, S.queue.length - 1);
  if (shuffle) {
    S.index = Math.floor(Math.random() * S.queue.length);
    S.shuffle = true;
  }
  if (S.shuffle) applyShuffle();
  playIndex(S.index);
  updateButtons();
}

function playIndex(i) {
  if (i < 0 || i >= S.queue.length) return;
  S.index = i;
  const t = current();
  S.lyrics = null;
  S.lyricsFor = null;
  S.activeLine = -1;
  S.resumeAt = 0;
  setOffset(0);
  Player.load(t.id);
  addRecent(t);
  recordPlay(t);
  updateNowPlaying();
  renderLyrics();
  if (S.view === 'queue') renderQueue();
  saveSession(0);
}

function togglePlay(forcePlay = false) {
  const t = current();
  if (!t) return;
  if (S.playing && !forcePlay) {
    Player.pause();
  } else if (Player.loadedId !== t.id) {
    Player.load(t.id, S.resumeAt);
  } else {
    Player.play();
  }
}

function next(auto = false) {
  if (!S.queue.length) return;
  if (auto && S.repeat === 'one') {
    Player.seek(0);
    Player.play();
    return;
  }
  if (S.index < S.queue.length - 1) playIndex(S.index + 1);
  else if (S.repeat === 'all' || !auto) playIndex(0);
  else { S.playing = false; updateButtons(); }
}

function prev() {
  if (!S.queue.length) return;
  if (Player.time() > 3 || S.index === 0) Player.seek(0);
  else playIndex(S.index - 1);
}

function applyShuffle() {
  S.original = S.queue.slice();
  const cur = S.queue[S.index];
  const rest = shuffleArr(S.queue.filter((_, k) => k !== S.index));
  S.queue = cur ? [cur, ...rest] : rest;
  S.index = 0;
}

function toggleShuffle() {
  S.shuffle = !S.shuffle;
  if (S.shuffle) {
    if (S.queue.length) applyShuffle();
  } else if (S.original) {
    const id = current()?.id;
    S.queue = S.original;
    S.original = null;
    S.index = Math.max(0, S.queue.findIndex((t) => t.id === id));
  }
  toast(S.shuffle ? 'Aleatório ativado' : 'Aleatório desativado');
  updateButtons();
  if (S.view === 'queue') renderQueue();
  saveSession();
}

function cycleRepeat() {
  S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat];
  toast({ off: 'Repetição desativada', all: 'Repetir fila', one: 'Repetir esta música' }[S.repeat]);
  updateButtons();
  saveSession();
}

function playNext(track) {
  if (!track) return;
  if (!S.queue.length) { playList([track]); return; }
  S.queue.splice(S.index + 1, 0, track);
  S.original?.push(track);
  toast('Vai tocar a seguir');
  if (S.view === 'queue') renderQueue();
  saveSession();
}

function removeFromQueue(i) {
  if (i === S.index) return;
  const [t] = S.queue.splice(i, 1);
  if (i < S.index) S.index--;
  if (S.original) {
    const k = S.original.findIndex((x) => x.id === t.id);
    if (k >= 0) S.original.splice(k, 1);
  }
  renderQueue();
  saveSession();
}

function clearQueue() {
  const t = current();
  S.queue = t ? [t] : [];
  S.original = null;
  S.index = t ? 0 : -1;
  renderQueue();
  saveSession();
}

function onPlayerState(st) {
  S.ytState = st;
  if (st === 1) {
    S.errors = 0;
    maybeLoadLyrics();
  }
  if (st === 0) { next(true); return; }
  S.playing = st === 1 || st === 3;
  Media.setPlaying(S.playing);
  updateButtons();
}

function onPlayerError(code) {
  S.errors++;
  if (S.errors > 5) {
    toast('Várias músicas indisponíveis seguidas. Reprodução parada.');
    return;
  }
  const embedBlocked = code === 101 || code === 150;
  toast(embedBlocked ? 'O dono desta música não permite tocar fora do YouTube. Pulando…' : 'Música indisponível. Pulando…');
  setTimeout(() => {
    if (S.index < S.queue.length - 1) playIndex(S.index + 1);
    else if (S.repeat === 'all') playIndex(0);
  }, 1200);
}

/* ---------- barra de progresso ---------- */
function setProgress(p) {
  $$('.js-seek, .js-bar').forEach((el) => el.style.setProperty('--p', p));
}

function bindSeek(el) {
  el.addEventListener('pointerdown', (e) => {
    const dur = Player.duration();
    if (!dur) return;
    el.setPointerCapture(e.pointerId);
    S.seeking = true;
    const upd = (ev) => {
      const r = el.getBoundingClientRect();
      S.seekP = clamp((ev.clientX - r.left) / r.width, 0, 1);
      setProgress(S.seekP);
      $$('.js-cur').forEach((x) => { x.textContent = fmt(S.seekP * dur); });
    };
    const up = () => {
      el.removeEventListener('pointermove', upd);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      S.seeking = false;
      Player.seek(S.seekP * dur);
    };
    upd(e);
    el.addEventListener('pointermove', upd);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function tick() {
  placePlayer();
  const t = current();
  if (!t) return;
  const cur = Player.time();
  const dur = Player.duration();
  if (!S.seeking) {
    const shown = Player.loadedId === t.id && S.ytState !== 5 && S.ytState !== -1 ? cur : S.resumeAt;
    setProgress(dur ? shown / dur : 0);
    $$('.js-cur').forEach((x) => { x.textContent = fmt(shown); });
  }
  $$('.js-dur').forEach((x) => { x.textContent = fmt(dur); });
  updateLyricHighlight(cur + S.offset);

  const now = Date.now();
  if (now - S.lastSave > 5000) {
    S.lastSave = now;
    saveSession();
    if (S.playing) Media.setPosition(cur, dur);
  }
}

/* ---------- atualização da interface ---------- */
function updateNowPlaying() {
  const t = current();
  $$('.js-title').forEach((e) => { e.textContent = t?.title || 'Nada tocando'; });
  $$('.js-artist').forEach((e) => { e.textContent = t?.artist || ''; });
  $('#mini').hidden = !t || S.view === 'playing';
  $('#np-body').hidden = !t;
  $('#np-empty').hidden = !!t;
  $('#np-bg').style.backgroundImage = t ? `url("${t.thumb}")` : '';
  document.documentElement.style.setProperty('--cover', t ? `url("${t.thumb}")` : 'none');
  $$('.track[data-id]').forEach((li) => li.classList.toggle('is-current', li.dataset.id === t?.id));
  Media.setMeta(t);
  if (S.view === 'home') renderHome();
  requestAnimationFrame(placePlayer);
}

function updateButtons() {
  $$('.js-play use').forEach((u) => u.setAttribute('href', S.playing ? '#i-pause' : '#i-play'));
  $$('.js-play').forEach((b) => b.setAttribute('aria-label', S.playing ? 'Pausar' : 'Tocar'));
  $$('.js-shuffle').forEach((b) => {
    b.classList.toggle('on', S.shuffle);
    b.setAttribute('aria-pressed', S.shuffle);
  });
  $$('.js-repeat').forEach((b) => {
    b.classList.toggle('on', S.repeat !== 'off');
    b.setAttribute('aria-pressed', S.repeat !== 'off');
    b.querySelector('use').setAttribute('href', S.repeat === 'one' ? '#i-repeat-one' : '#i-repeat');
  });
}

/* ---------- telas ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const loadingBlock = (txt = 'Carregando…') => `<div class="state"><div class="spinner"></div><p>${esc(txt)}</p></div>`;
const emptyBlock = (txt) => `<div class="state"><p>${esc(txt)}</p></div>`;

function playlistCard(p) {
  return `<button class="card" data-action="open-playlist" data-id="${esc(p.id)}">
    <div class="card-img">${p.thumb ? `<img loading="lazy" src="${esc(p.thumb)}" alt="">` : icon('queue')}</div>
    <span class="card-t">${esc(p.title)}</span>
    <span class="card-s">${esc(p.reason || `${p.count} músicas`)}</span>
  </button>`;
}

function mixCard(m, i) {
  return `<button class="card" data-action="artist-mix" data-index="${i}">
    <div class="card-img mix">
      ${m.thumb ? `<img loading="lazy" src="${esc(m.thumb)}" alt="">` : ''}
      <span class="mix-label">${icon('shuffle')}<span>Mix</span></span>
    </div>
    <span class="card-t">${esc(m.name)}</span>
    <span class="card-s">Mix de ${esc(m.name)} e músicas parecidas</span>
  </button>`;
}

function trackCard(t, listKey, i) {
  return `<button class="card" data-action="play-from" data-list="${listKey}" data-index="${i}">
    <div class="card-img wide"><img loading="lazy" src="${esc(t.thumb)}" alt=""></div>
    <span class="card-t">${esc(t.title)}</span>
    <span class="card-s">${esc(t.artist)}</span>
  </button>`;
}

function trackRows(tracks, listKey) {
  lists[listKey] = tracks;
  const cur = current()?.id;
  return `<ul class="tracks">${tracks.map((t, i) => `
    <li class="track${t.id === cur ? ' is-current' : ''}" data-id="${esc(t.id)}">
      <button class="track-main" data-action="play-from" data-list="${listKey}" data-index="${i}">
        <img loading="lazy" src="${esc(t.thumb)}" alt="">
        <span class="track-text"><span class="track-t">${esc(t.title)}</span><span class="track-a">${esc(t.artist)}</span></span>
      </button>
      <button class="icon-btn" data-action="play-next" data-list="${listKey}" data-index="${i}" aria-label="Tocar a seguir">${icon('add')}</button>
    </li>`).join('')}</ul>`;
}

function renderHome() {
  const el = $('#view-home');
  const name = (S.profile?.name || '').split(' ')[0];
  const t = current();
  const recent = store.get('recent', []);
  lists.recent = recent;

  let html = `<p class="greet">${greeting()}${name ? `, ${esc(name)}` : ''}</p>`;

  if (t) {
    html += `<button class="resume" data-nav="playing">
      <img src="${esc(t.thumb)}" alt="">
      <span class="resume-text">
        <span class="eyebrow">${S.playing ? 'Tocando agora' : 'Continuar ouvindo'}</span>
        <span class="resume-t">${esc(t.title)}</span>
        <span class="resume-a">${esc(t.artist)}</span>
      </span>
      <span class="resume-play">${icon(S.playing ? 'now' : 'play')}</span>
    </button>`;
  }

  html += `<div class="tiles">
    <button class="tile tile-accent" data-action="open-playlist" data-id="liked">${icon('heart')}<span>Músicas curtidas</span></button>
    <button class="tile" data-action="voice">${icon('mic')}<span>Buscar por voz</span></button>
    <button class="tile" data-action="shuffle-liked">${icon('shuffle')}<span>Aleatório das curtidas</span></button>
  </div>`;

  const mixes = S.recs?.mixes || [];
  if (mixes.length) {
    html += `<div class="section-head"><h2>Mixes para você</h2></div>
      <div class="row-scroll">${mixes.map(mixCard).join('')}</div>`;
  }

  html += `<div class="section-head"><h2>Suas playlists</h2><button class="link" data-nav="library">Ver todas</button></div>`;
  if (!S.playlists) html += loadingBlock('Carregando playlists…');
  else if (!S.playlists.length) html += emptyBlock('Você ainda não tem playlists.');
  else html += `<div class="row-scroll">${S.playlists.slice(0, 12).map(playlistCard).join('')}</div>`;

  const recPls = S.recs?.playlists || [];
  html += `<div class="section-head"><h2>Playlists para você</h2>
    <button class="icon-btn" data-action="recs-refresh" aria-label="Atualizar sugestões" ${S.recsLoading ? 'disabled' : ''}>${icon('refresh')}</button></div>`;
  if (recPls.length) html += `<div class="row-scroll">${recPls.map(playlistCard).join('')}</div>`;
  else if (S.recsLoading) html += loadingBlock('Montando sugestões com base no seu gosto…');
  else html += emptyBlock(mixes.length
    ? 'Nenhuma sugestão agora. Toque em atualizar para tentar de novo.'
    : 'Curta ou toque algumas músicas para receber sugestões.');

  const top = mostPlayed();
  lists.top = top;
  if (top.length >= 3) {
    html += `<div class="section-head"><h2>Suas mais tocadas</h2>
      <button class="link" data-action="play-list" data-list="top">Tocar todas</button></div>
      <div class="row-scroll">${top.map((r, i) => trackCard(r, 'top', i)).join('')}</div>`;
  }

  if (recent.length) {
    html += `<div class="section-head"><h2>Tocadas recentemente</h2></div>
      <div class="row-scroll">${recent.slice(0, 15).map((r, i) => trackCard(r, 'recent', i)).join('')}</div>`;
  }
  el.innerHTML = html;
}

function renderLibrary() {
  const el = $('#view-library');
  let html = `<div class="grid">
    <button class="card" data-action="open-playlist" data-id="liked">
      <div class="card-img liked">${icon('heart')}</div>
      <span class="card-t">Músicas curtidas</span><span class="card-s">Automática</span>
    </button>`;
  if (S.playlists) html += S.playlists.map(playlistCard).join('');
  html += `</div>`;
  if (!S.playlists) html += loadingBlock('Carregando playlists…');
  el.innerHTML = html;
}

async function openPlaylist(id) {
  const meta = id === 'liked'
    ? { title: 'Músicas curtidas', thumb: '' }
    : S.playlists?.find((p) => p.id === id) || S.recs?.playlists?.find((p) => p.id === id) || { title: 'Playlist', thumb: '' };
  navigate('playlist', { title: meta.title });
  const el = $('#view-playlist');
  el.dataset.id = id;
  const key = `pl:${id}`;

  const head = (tracks) => `<div class="pl-head">
    <div class="pl-cover">${meta.thumb ? `<img src="${esc(meta.thumb)}" alt="">` : icon(id === 'liked' ? 'heart' : 'queue')}</div>
    <div class="pl-info">
      <h2>${esc(meta.title)}</h2>
      <p class="muted">${tracks ? `${tracks.length} músicas` : 'Carregando…'}</p>
      <div class="pl-actions">
        <button class="btn btn-primary btn-lg" data-action="play-list" data-list="${key}" ${tracks?.length ? '' : 'disabled'}>${icon('play')}Tocar</button>
        <button class="btn btn-lg" data-action="shuffle-list" data-list="${key}" ${tracks?.length ? '' : 'disabled'}>${icon('shuffle')}Aleatório</button>
      </div>
    </div>
  </div>`;

  let tracks = S.playlistCache.get(id);
  if (!tracks) {
    el.innerHTML = head(null) + loadingBlock();
    tracks = await guard(() => (id === 'liked' ? YT.getLiked() : YT.getPlaylistTracks(id)));
    if (S.view !== 'playlist' || el.dataset.id !== id) return;
    if (!tracks) { el.innerHTML = head([]) + emptyBlock('Não foi possível carregar esta playlist.'); return; }
    S.playlistCache.set(id, tracks);
  }
  el.innerHTML = head(tracks) + (tracks.length ? trackRows(tracks, key) : emptyBlock('Playlist vazia.'));
}

async function shuffleLiked() {
  let tracks = S.playlistCache.get('liked');
  if (!tracks) {
    toast('Carregando suas curtidas…');
    tracks = await guard(() => YT.getLiked());
    if (!tracks) return;
    S.playlistCache.set('liked', tracks);
  }
  lists['pl:liked'] = tracks;
  playList(tracks, 0, { shuffle: true });
  navigate('playing');
}

/* ---------- recomendações ---------- */
async function loadRecommendations({ force = false } = {}) {
  if (S.recsLoading) return;
  S.recsLoading = true;
  if (S.view === 'home') renderHome();
  try {
    let liked = S.playlistCache.get('liked');
    if (!liked) {
      liked = (await guard(() => YT.getLiked())) || [];
      if (liked.length) S.playlistCache.set('liked', liked);
    }
    const recs = await guard(() => getRecommendations({
      liked,
      ownIds: (S.playlists || []).map((p) => p.id),
      force,
    }));
    if (recs) {
      S.recs = recs;
      if (force) toast('Sugestões atualizadas');
    }
  } finally {
    S.recsLoading = false;
    if (S.view === 'home') renderHome();
  }
}

// Mix = músicas que você já curtiu/ouviu do artista + resultados novos da busca, embaralhados.
async function playArtistMix(i) {
  const mix = S.recs?.mixes?.[i];
  if (!mix) return;
  toast(`Montando o mix de ${mix.name}…`);
  const found = getToken() ? (await guard(() => YT.search(`${mix.name} músicas`))) || [] : [];
  const seen = new Set();
  const tracks = [...mix.tracks, ...found].filter((t) => !seen.has(t.id) && seen.add(t.id));
  if (!tracks.length) { toast('Não foi possível montar este mix agora.'); return; }
  playList(tracks, 0, { shuffle: true });
  navigate('playing');
}

/* ---------- autocompletar da busca ---------- */
let suggestTimer = null;
let suggestSeq = 0;

function bindSuggest() {
  const input = $('#search-input');
  const box = $('#suggest');
  // Mantém o foco no campo ao tocar numa sugestão (evita fechar a lista antes do clique).
  box.addEventListener('pointerdown', (e) => e.preventDefault());

  input.addEventListener('input', () => {
    if (recognizer) return;
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if (!q) { hideSuggest(); return; }
    suggestTimer = setTimeout(() => updateSuggest(q), 150);
  });
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) updateSuggest(q);
  });
  input.addEventListener('blur', () => setTimeout(hideSuggest, 120));
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    const items = $$('.sg', box);
    let k = items.findIndex((x) => x.classList.contains('active'));
    if (e.key === 'ArrowDown') k = (k + 1) % items.length;
    else if (e.key === 'ArrowUp') k = k <= 0 ? items.length - 1 : k - 1;
    else if (e.key === 'Escape') { hideSuggest(); return; }
    else return;
    e.preventDefault();
    items.forEach((x, j) => x.classList.toggle('active', j === k));
    items[k]?.scrollIntoView({ block: 'nearest' });
  });
}

async function updateSuggest(q) {
  const seq = ++suggestSeq;
  const lower = q.toLowerCase();
  const history = store.get('searches', [])
    .filter((s) => s.toLowerCase().startsWith(lower) && s.toLowerCase() !== lower)
    .slice(0, 3);
  renderSuggest(q, history, []);

  let remote = [];
  try { remote = await suggestQueries(q); } catch { /* sem sugestões online */ }
  if (seq !== suggestSeq || document.activeElement !== $('#search-input')) return;
  const known = new Set([lower, ...history.map((s) => s.toLowerCase())]);
  remote = remote.filter((s) => !known.has(s.toLowerCase())).slice(0, 8 - history.length);
  renderSuggest(q, history, remote);
}

function renderSuggest(q, history, remote) {
  const box = $('#suggest');
  const items = [...history.map((s) => ({ s, past: true })), ...remote.map((s) => ({ s }))];
  if (!items.length) { closeSuggestBox(); return; }
  const mark = (s) => (s.toLowerCase().startsWith(q.toLowerCase())
    ? `${esc(s.slice(0, q.length))}<b>${esc(s.slice(q.length))}</b>`
    : esc(s));
  box.innerHTML = items.map(({ s, past }) => `
    <div class="sg" role="option">
      <button class="sg-main" type="button" data-action="suggest-pick" data-q="${esc(s)}">
        ${icon(past ? 'history' : 'search')}<span>${mark(s)}</span>
      </button>
      <button class="icon-btn sg-fill" type="button" data-action="suggest-fill" data-q="${esc(s)}" aria-label="Completar com “${esc(s)}”">${icon('fill')}</button>
    </div>`).join('');
  box.hidden = false;
  $('#search-input').setAttribute('aria-expanded', 'true');
}

// Fecha a lista e cancela sugestões que ainda estão chegando.
function hideSuggest() {
  suggestSeq++;
  clearTimeout(suggestTimer);
  closeSuggestBox();
}

function closeSuggestBox() {
  $('#suggest').hidden = true;
  $('#search-input').setAttribute('aria-expanded', 'false');
}

function fillSuggestion(q) {
  const input = $('#search-input');
  input.value = `${q} `;
  input.focus();
  updateSuggest(q);
}

function renderQueue() {
  const el = $('#view-queue');
  if (!S.queue.length) {
    el.innerHTML = emptyBlock('A fila está vazia. Escolha uma playlist ou busque uma música.');
    return;
  }
  el.innerHTML = `<div class="section-head"><h2>${S.queue.length} músicas na fila</h2>
      <button class="btn" data-action="queue-clear">Limpar fila</button></div>
    <ul class="tracks">${S.queue.map((t, i) => `
      <li class="track${i === S.index ? ' is-current' : ''}" data-id="${esc(t.id)}">
        <button class="track-main" data-action="jump" data-index="${i}">
          <span class="track-num">${i === S.index ? icon('now') : i + 1}</span>
          <img loading="lazy" src="${esc(t.thumb)}" alt="">
          <span class="track-text"><span class="track-t">${esc(t.title)}</span><span class="track-a">${esc(t.artist)}</span></span>
        </button>
        ${i === S.index ? '' : `<button class="icon-btn" data-action="queue-remove" data-index="${i}" aria-label="Remover da fila">${icon('close')}</button>`}
      </li>`).join('')}</ul>`;
  el.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
}

/* ---------- busca ---------- */
function renderSearchIdle() {
  const recent = store.get('searches', []);
  $('#search-body').innerHTML = recent.length
    ? `<div class="section-head"><h2>Buscas recentes</h2></div>
       <div class="chips">${recent.map((q) => `<button class="chip" data-action="search-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
    : `<div class="state"><p>Digite ou toque no microfone ${icon('mic', 'ic inline')} para buscar.</p></div>`;
}

async function doSearch(query, { autoplay = false } = {}) {
  const q = (query || '').trim();
  if (!q) return;
  if (S.view !== 'search') navigate('search');
  hideSuggest();
  $('#search-input').value = q;
  $('#search-input').blur();
  store.set('searches', [q, ...store.get('searches', []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10));
  const body = $('#search-body');
  body.innerHTML = loadingBlock('Buscando…');
  const res = await guard(() => YT.search(q));
  if (!res) { body.innerHTML = emptyBlock('Não foi possível buscar agora.'); return; }
  body.innerHTML = res.length ? trackRows(res, 'search') : emptyBlock('Nenhum resultado.');
  if (autoplay && res.length) {
    playList(res, 0);
    navigate('playing');
  }
}

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

function startVoice() {
  if (!SpeechRec) { toast('Busca por voz não é suportada neste navegador.'); return; }
  if (recognizer) { recognizer.abort(); return; }
  if (S.view !== 'search') navigate('search');
  const input = $('#search-input');
  const mic = $('#btn-mic');
  recognizer = new SpeechRec();
  recognizer.lang = 'pt-BR';
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;
  let finalText = '';
  mic.classList.add('listening');
  input.value = '';
  input.placeholder = 'Fale: "tocar" + nome da música…';
  recognizer.onresult = (e) => {
    let txt = '';
    for (const r of e.results) {
      txt += r[0].transcript;
      if (r.isFinal) finalText = txt;
    }
    input.value = txt;
  };
  recognizer.onerror = (e) => {
    if (e.error === 'not-allowed') toast('Permita o uso do microfone para buscar por voz.');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`Erro no microfone: ${e.error}`);
  };
  recognizer.onend = () => {
    recognizer = null;
    mic.classList.remove('listening');
    input.placeholder = 'Música, artista ou álbum';
    const spoken = (finalText || input.value).trim();
    if (!spoken) return;
    // "tocar Coldplay Yellow" → toca o primeiro resultado direto
    const cmd = spoken.match(/^(tocar|toca|toque|ouvir|play|coloca|coloque|bota)\s+(.+)/i);
    doSearch(cmd ? cmd[2] : spoken, { autoplay: true });
  };
  recognizer.start();
}

/* ---------- letras ---------- */
function maybeLoadLyrics(force = false) {
  const t = current();
  if (!t || (!force && S.lyricsFor === t.id)) return;
  S.lyricsFor = t.id;
  S.lyrics = { loading: true };
  renderLyrics();
  fetchLyrics(t, Player.duration())
    .then((res) => {
      if (current()?.id !== t.id) return;
      S.lyrics = res || { notFound: true };
      S.activeLine = -1;
      renderLyrics();
    })
    .catch(() => {
      if (current()?.id !== t.id) return;
      S.lyrics = { error: true };
      S.lyricsFor = null;
      renderLyrics();
    });
}

function renderLyrics() {
  const el = $('#lyrics');
  const L = S.lyrics;
  $('#cover-lyric').textContent = '';
  $('#sync-adjust').hidden = !L?.synced;
  if (!current()) { el.innerHTML = ''; return; }
  if (!L || L.loading) el.innerHTML = `<div class="lyrics-msg"><div class="spinner"></div>Buscando letra…</div>`;
  else if (L.error) el.innerHTML = `<div class="lyrics-msg">Não foi possível buscar a letra.<button class="btn" data-action="lyrics-retry">Tentar novamente</button></div>`;
  else if (L.notFound) el.innerHTML = `<div class="lyrics-msg">Letra não encontrada para esta música.</div>`;
  else if (L.instrumental) el.innerHTML = `<div class="lyrics-msg big">♪ Instrumental ♪</div>`;
  else if (L.synced) {
    el.innerHTML = `<div class="lyrics-pad"></div>${L.synced.map((l, i) =>
      `<p class="ly" data-i="${i}" data-t="${l.time}">${esc(l.text) || '♪'}</p>`).join('')}
      <div class="lyrics-pad"></div><p class="lyrics-src">Letra: ${esc(L.source)} · LRCLIB</p>`;
  } else {
    el.innerHTML = `<div class="lyrics-plain">${L.plain.split('\n').map((x) => `<p>${esc(x) || '&nbsp;'}</p>`).join('')}</div>
      <p class="lyrics-src">Letra sem sincronização · ${esc(L.source)} · LRCLIB</p>`;
  }
  el.scrollTop = 0;
}

function updateLyricHighlight(time) {
  const lines = S.lyrics?.synced;
  if (!lines) return;
  let lo = 0;
  let hi = lines.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time + 0.2) { i = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (i === S.activeLine) return;
  S.activeLine = i;
  const el = $('#lyrics');
  el.querySelector('.ly.active')?.classList.remove('active');
  el.querySelector(`.ly[data-i="${i}"]`)?.classList.add('active');
  $('#cover-lyric').textContent = i >= 0 ? lines[i].text || '♪' : '';
  if (S.view === 'playing' && S.mode === 'lyrics') scrollToActive();
}

function scrollToActive(instant = false) {
  if (!instant && Date.now() - S.userScrollAt < 4000) return;
  const el = $('#lyrics');
  const line = el.querySelector('.ly.active');
  if (!line) return;
  el.scrollTo({ top: line.offsetTop - el.clientHeight * 0.38, behavior: instant ? 'auto' : 'smooth' });
}

function setOffset(v) {
  S.offset = Math.round(v * 10) / 10;
  const sign = S.offset > 0 ? '+' : S.offset < 0 ? '−' : '';
  $('#sync-value').textContent = `Sincronia ${sign}${Math.abs(S.offset).toFixed(1).replace('.', ',')}s`;
  S.activeLine = -2;
}

/* ---------- modo vídeo: controles que somem sozinhos ---------- */
function showOverlay() {
  const ov = $('#video-overlay');
  ov.classList.add('show');
  clearTimeout(S.overlayTimer);
  S.overlayTimer = setTimeout(hideOverlay, 4500);
}
function hideOverlay() {
  if (S.seeking) { showOverlay(); return; }
  $('#video-overlay').classList.remove('show');
}

/* ---------- conta ---------- */
async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) authExpired();
    else toast(e.message || 'Erro inesperado');
    return null;
  }
}

function authExpired() {
  toast('Sua sessão do Google expirou.', { label: 'Reconectar', fn: reconnect, duration: 12000 });
}

async function reconnect() {
  try {
    await signIn({ silent: true });
    toast('Conectado novamente');
    loadProfile();
    loadPlaylists().then(() => loadRecommendations());
    if (S.view === 'playlist') openPlaylist($('#view-playlist').dataset.id);
  } catch (e) {
    toast(e.message);
  }
}

async function loadProfile() {
  const p = await guard(() => YT.getProfile());
  if (!p) return;
  S.profile = p;
  store.set('profile', p);
  renderProfile();
  if (S.view === 'home') renderHome();
}

function renderProfile() {
  const p = S.profile;
  const img = $('#avatar-img');
  img.hidden = !p?.avatar;
  if (p?.avatar) img.src = p.avatar;
  $('#avatar-letter').hidden = !!p?.avatar;
  $('#avatar-letter').textContent = (p?.name || '?').charAt(0).toUpperCase();
  $('#menu-name').textContent = p?.name || 'Minha conta';
}

async function loadPlaylists() {
  const pls = await guard(() => YT.getPlaylists());
  if (!pls) {
    S.playlists ||= [];
  } else {
    S.playlists = pls;
    store.set('playlists', pls);
  }
  if (S.view === 'home') renderHome();
  if (S.view === 'library') renderLibrary();
}

function logout() {
  if (!confirm('Sair da sua conta do YouTube neste aparelho?')) return;
  signOut();
  ['profile', 'playlists', 'session', 'recent', 'searches', 'plays', 'recs'].forEach((k) => store.remove(k));
  location.reload();
}

function changeClient() {
  const cur = store.get('clientId') || CONFIG.GOOGLE_CLIENT_ID || '';
  const id = prompt('Client ID OAuth do Google:', cur);
  if (id === null) return;
  if (!/\.apps\.googleusercontent\.com$/.test(id.trim())) { toast('Client ID inválido.'); return; }
  store.set('clientId', id.trim());
  store.remove('token');
  location.reload();
}

/* ---------- sessão / histórico ---------- */
function saveSession(time) {
  const t = current();
  if (!t) { store.remove('session'); return; }
  const playedHere = Player.loadedId === t.id && S.ytState !== 5 && S.ytState !== -1;
  store.set('session', {
    queue: S.queue.slice(0, 500),
    index: S.index,
    time: time ?? (playedHere ? Player.time() : S.resumeAt),
    shuffle: S.shuffle,
    repeat: S.repeat,
    mode: S.mode,
  });
}

function restoreSession() {
  const s = store.get('session');
  if (!s?.queue?.length) return;
  S.queue = s.queue;
  S.index = clamp(s.index ?? 0, 0, s.queue.length - 1);
  S.shuffle = !!s.shuffle;
  S.repeat = s.repeat || 'off';
  // Por segurança nunca reabre direto no modo vídeo (o carro pode estar em movimento).
  S.mode = s.mode === 'lyrics' ? 'lyrics' : 'cover';
  S.resumeAt = s.time || 0;
}

function addRecent(t) {
  const recent = store.get('recent', []).filter((x) => x.id !== t.id);
  recent.unshift(t);
  store.set('recent', recent.slice(0, 30));
}

/* ---------- extras ---------- */
function startClock() {
  const f = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const upd = () => { $('#clock').textContent = f.format(new Date()); };
  upd();
  setInterval(upd, 10_000);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Tela cheia não disponível.'));
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn btn-sm btn-primary">${esc(action.label)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').onclick = () => {
      el.classList.remove('show');
      action.fn();
    };
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action?.duration || 3500);
}

boot();
