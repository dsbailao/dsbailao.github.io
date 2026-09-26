// Login com Google (Google Identity Services — fluxo de token no navegador).
import { CONFIG } from './config.js';
import { store, loadScript } from './store.js';

export class AuthError extends Error {}

let client = null;
let pending = null;

export async function initAuth(clientId) {
  await loadScript('https://accounts.google.com/gsi/client');
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: CONFIG.SCOPE,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (resp.error) {
        p?.reject(new AuthError(resp.error_description || resp.error));
        return;
      }
      const ttl = (Number(resp.expires_in) || 3600) * 1000;
      store.set('token', { value: resp.access_token, exp: Date.now() + ttl - 60_000 });
      p?.resolve(resp.access_token);
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      const msg = err?.type === 'popup_closed' ? 'Login cancelado'
        : err?.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela de login'
        : (err?.message || 'Falha no login');
      p?.reject(new AuthError(msg));
    },
  });
}

export const isAuthReady = () => client !== null;

// Precisa ser chamado direto de um toque/clique (senão o popup é bloqueado).
export function signIn({ silent = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!client) {
      reject(new AuthError('Login do Google ainda não carregou. Verifique a internet.'));
      return;
    }
    pending?.reject(new AuthError('Login substituído'));
    pending = { resolve, reject };
    client.requestAccessToken({ prompt: silent ? '' : 'select_account' });
  });
}

export function getToken() {
  const t = store.get('token');
  return t && t.exp > Date.now() ? t.value : null;
}

export function signOut() {
  const t = store.get('token');
  if (t && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(t.value, () => {});
  }
  store.remove('token');
}
