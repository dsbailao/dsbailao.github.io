// Wrapper do YouTube IFrame Player API.
import { loadScript } from './store.js';

let player = null;
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
    loadScript('https://www.youtube.com/iframe_api');
  });
  return readyPromise;
}

// Estados: -1 não iniciado, 0 fim, 1 tocando, 2 pausado, 3 carregando, 5 preparado
export const Player = {
  loadedId: null,
  async load(id, start = 0) {
    const p = await readyPromise;
    this.loadedId = id;
    p.loadVideoById({ videoId: id, startSeconds: start });
  },
  async cue(id, start = 0) {
    const p = await readyPromise;
    this.loadedId = id;
    p.cueVideoById({ videoId: id, startSeconds: start });
  },
  play() { player?.playVideo?.(); },
  pause() { player?.pauseVideo?.(); },
  seek(sec) { player?.seekTo?.(Math.max(0, sec), true); },
  getVolume() { return player?.getVolume?.() ?? 100; },
  setVolume(v) { player?.setVolume?.(Math.max(0, Math.min(100, Math.round(v)))); },
  time() { return player?.getCurrentTime?.() || 0; },
  duration() { return player?.getDuration?.() || 0; },
  get ready() { return !!player?.playVideo; },
};
