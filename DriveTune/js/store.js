// Persistência local (tolerante a navegadores que bloqueiam storage).
const BASE = 'drivetunes.';

// O app funciona em um modo por vez: Navidrome (padrão) ou YouTube.
// Cada modo tem fila, histórico e buscas próprios; o YouTube mantém o prefixo
// original para não perder o que já estava salvo.
function readSource() {
  try { return JSON.parse(localStorage.getItem(`${BASE}source`)); } catch { return null; }
}
export const SOURCE = readSource() === 'youtube' ? 'youtube' : 'navidrome';
const PREFIX = SOURCE === 'navidrome' ? `${BASE}nd.` : BASE;
const SHARED = new Set(['source', 'navidrome']);
const keyOf = (key) => (SHARED.has(key) ? BASE : PREFIX) + key;

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(keyOf(key));
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(keyOf(key), JSON.stringify(value)); } catch { /* sem storage */ }
  },
  remove(key) {
    try { localStorage.removeItem(keyOf(key)); } catch { /* sem storage */ }
  },
};

const scripts = new Map();

export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => {
        scripts.delete(src);
        el.remove();
        reject(new Error(`Falha ao carregar ${src}`));
      };
      document.head.appendChild(el);
    }));
  }
  return scripts.get(src);
}
