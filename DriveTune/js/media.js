// Integração com o sistema: botões do volante / Bluetooth (Media Session)
// e tela sempre acesa (Wake Lock).
//
// O áudio do YouTube toca dentro de um iframe de outro domínio, então o navegador
// não associa os comandos de mídia a esta página. Tocamos um áudio silencioso em loop
// na própria página para que ela "possua" a sessão de mídia e receba os comandos.
let silent = null;
let wakeLock = null;
// Motivos para manter a tela acesa: música tocando e/ou GPS aberto.
const awakeReasons = new Set();
const wantAwake = () => awakeReasons.size > 0;

export function keepAwake(reason, on) {
  if (on) awakeReasons.add(reason);
  else awakeReasons.delete(reason);
  if (wantAwake()) requestWake();
  else releaseWake();
}

function silentWavUrl(seconds = 10) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function initMedia(handlers) {
  silent = new Audio(silentWavUrl());
  silent.loop = true;
  if ('mediaSession' in navigator) {
    for (const [action, fn] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* ação não suportada */ }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantAwake()) requestWake();
  });
}

export function setPlaying(playing) {
  if (silent) {
    if (playing) silent.play().catch(() => {});
    else silent.pause();
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  keepAwake('play', playing);
}

export function setMeta(track) {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  navigator.mediaSession.metadata = track
    ? new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'DriveTunes',
        artwork: [{ src: track.thumb, sizes: '480x360', type: 'image/jpeg' }],
      })
    : null;
}

export function setPosition(position, duration) {
  if (!('mediaSession' in navigator) || !duration) return;
  try {
    navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 });
  } catch { /* ignorado */ }
}

async function requestWake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* negado */ }
}

function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
