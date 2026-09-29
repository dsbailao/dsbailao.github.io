// Configuração do DriveTunes.
// O Client ID OAuth não é segredo: o Google só aceita login vindo das origens
// autorizadas no Console. Cada endereço de produção tem o seu Client ID fixo aqui;
// em outros endereços (ex.: localhost) o site pede o Client ID e guarda no navegador.
const CLIENT_IDS = {
  'dsbailao.github.io': '404609106134-qhcedv4fs5psuctd7i8bln2nifirpg11.apps.googleusercontent.com',
};

// Chave da Google Maps Platform (Maps JavaScript, Places API (New) e Routes API).
// Também é pública por natureza: proteja restringindo por site (HTTP referrer) no Console.
// Sem chave aqui, o GPS pede a chave na primeira vez e guarda no navegador.
const MAPS_KEYS = {
  'dsbailao.github.io': '',
};

export const CONFIG = {
  GOOGLE_CLIENT_ID: CLIENT_IDS[location.hostname] || '',
  MAPS_API_KEY: MAPS_KEYS[location.hostname] || '',
  SCOPE: 'https://www.googleapis.com/auth/youtube.readonly',
};
