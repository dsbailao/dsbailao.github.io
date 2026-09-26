// Persistência local (tolerante a navegadores que bloqueiam storage).
const PREFIX = 'drivetunes.';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* sem storage */ }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* sem storage */ }
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
