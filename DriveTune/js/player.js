// Reprodução: YouTube IFrame Player no modo YouTube e um <audio> comum no modo Navidrome.
// Os dois falam com o app pelos mesmos estados do YouTube.
import { loadScript } from './store.js';

let player = null;
let audio = null;
let urlFor = null;
let pendingSeek = 0;
let readyPromise = null;
const listeners = {};

export function onPlayer(evt, fn) {
  (listeners[evt] ||= []).push(fn);
}

function emit(evt, ...args) {
  (listeners[evt] || []).forEach((fn) => fn(...args));
}

export function initPlayer(elementId) {
  readyPromise ||= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => {
      player = new window.YT.Player(elementId, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: location.origin,
        },
        events: {
          onReady: () => resolve(player),
          onStateChange: (e) => emit('state', e.data),
          onError: (e) => emit('error', e.data),
        },
      });
    };
    // O player do YouTube é pesado (script + iframe próprio); fica para logo depois da
    // primeira pintura, para a tela inicial aparecer antes em aparelhos fracos.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    idle(() => loadScript('https://www.youtube.com/iframe_api'), { timeout: 2000 });
  });
  return readyPromise;
}

// Modo Navidrome. `streamUrl(id)` devolve o endereço do áudio de cada música.
export function initAudioPlayer(streamUrl) {
  if (readyPromise) return readyPromise;
  urlFor = streamUrl;
  audio = new Audio();
  audio.preload = 'auto';
  const states = { play: 3, waiting: 3, playing: 1, pause: 2, ended: 0 };
  for (const [evt, st] of Object.entries(states)) audio.addEventListener(evt, () => emit('state', st));
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek) audio.currentTime = pendingSeek;
    pendingSeek = 0;
  });
  audio.addEventListener('error', () => emit('error', audio.error?.code));
  readyPromise = Promise.resolve(audio);
  return readyPromise;
}

const youtube = {
  async load(id, start) {
    (await readyPromise).loadVideoById({ videoId: id, startSeconds: start });
  },
  async cue(id, start) {
    (await readyPromise).cueVideoById({ videoId: id, startSeconds: start });
  },
  play() { player?.playVideo?.(); },
  pause() { player?.pauseVideo?.(); },
  seek(sec) { player?.seekTo?.(sec, true); },
  time() { return player?.getCurrentTime?.() || 0; },
  duration() { return player?.getDuration?.() || 0; },
};

const html5 = {
  load(id, start) {
    this.cue(id, start);
    this.play();
  },
  cue(id, start) {
    pendingSeek = start;
    audio.src = urlFor(id);
    emit('state', 5);
  },
  play() { audio.play().catch(() => {}); },
  pause() { audio.pause(); },
  seek(sec) {
    if (audio.readyState) audio.currentTime = sec;
    else pendingSeek = sec;
  },
  time() { return audio.currentTime || 0; },
  duration() { return Number.isFinite(audio.duration) ? audio.duration : 0; },
};

const backend = () => (audio ? html5 : youtube);

// Estados: -1 não iniciado, 0 fim, 1 tocando, 2 pausado, 3 carregando, 5 preparado
export const Player = {
  loadedId: null,
  load(id, start = 0) {
    this.loadedId = id;
    return backend().load(id, start);
  },
  cue(id, start = 0) {
    this.loadedId = id;
    return backend().cue(id, start);
  },
  play() { backend().play(); },
  pause() { backend().pause(); },
  seek(sec) { backend().seek(Math.max(0, sec)); },
  time() { return backend().time(); },
  duration() { return backend().duration(); },
};
