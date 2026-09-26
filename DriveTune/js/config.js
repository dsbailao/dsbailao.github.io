// Configuração do DriveTunes.
// O Client ID OAuth não é segredo: o Google só aceita login vindo das origens
// autorizadas no Console. Cada endereço de produção tem o seu Client ID fixo aqui;
// em outros endereços (ex.: localhost) o site pede o Client ID e guarda no navegador.
const CLIENT_IDS = {
  'dsbailao.github.io': '404609106134-qhcedv4fs5psuctd7i8bln2nifirpg11.apps.googleusercontent.com',
};

export const CONFIG = {
  GOOGLE_CLIENT_ID: CLIENT_IDS[location.hostname] || '',
  SCOPE: 'https://www.googleapis.com/auth/youtube.readonly',
};
