// Tema do DriveTunes: modo dia (claro, alto contraste para usar sob o sol) das 7h às 16h
// e modo noite (escuro) das 16h às 7h. O botão do topo troca na mão até a próxima virada
// automática; depois disso o horário volta a mandar.
//
// Script comum (não é módulo) carregado no <head>: aplica o tema antes da primeira
// pintura, para a tela não piscar escura de dia. O app usa window.DriveTheme.
(() => {
  const DAY_FROM = 7;
  const NIGHT_FROM = 16;
  const KEY = 'drivetunes.theme';
  const BAR = { light: '#ffffff', dark: '#07080b' };
  const listeners = [];

  const scheduled = (d = new Date()) => (d.getHours() >= DAY_FROM && d.getHours() < NIGHT_FROM ? 'light' : 'dark');

  // Próxima virada automática (7h ou 16h), em milissegundos.
  function nextSwitch(d = new Date()) {
    const n = new Date(d);
    n.setMinutes(0, 0, 0);
    if (d.getHours() < DAY_FROM) n.setHours(DAY_FROM);
    else if (d.getHours() < NIGHT_FROM) n.setHours(NIGHT_FROM);
    else { n.setDate(n.getDate() + 1); n.setHours(DAY_FROM); }
    return n.getTime();
  }

  function manual() {
    try {
      const m = JSON.parse(localStorage.getItem(KEY));
      return m && m.until > Date.now() ? m.value : null;
    } catch {
      return null;
    }
  }

  function apply() {
    const theme = manual() || scheduled();
    const root = document.documentElement;
    if (root.dataset.theme === theme) return;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
    listeners.forEach((fn) => fn(theme));
  }

  window.DriveTheme = {
    get current() { return document.documentElement.dataset.theme; },
    // Troca o tema e devolve { theme, until } (até quando vale a escolha manual).
    toggle() {
      const theme = this.current === 'light' ? 'dark' : 'light';
      const until = nextSwitch();
      try { localStorage.setItem(KEY, JSON.stringify({ value: theme, until })); } catch { /* sem storage */ }
      apply();
      return { theme, until };
    },
    onChange(fn) { listeners.push(fn); },
  };

  apply();
  setInterval(apply, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
})();
