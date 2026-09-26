// Interações do portfólio: tema, menu, seção ativa, animação ao rolar e copiar e-mail.
(function () {
  const root = document.documentElement;

  // Tema claro/escuro (segue o sistema até o visitante escolher)
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* sem storage */ }
  });

  // Menu no celular
  const nav = document.getElementById('nav');
  const menuBtn = document.getElementById('menu-btn');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  // Borda do topo ao rolar
  const topbar = document.querySelector('.topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Animação de entrada + link ativo no menu
  const links = new Map([...nav.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.remove('active'));
        links.get(en.target.id)?.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  }

  // Copiar e-mail
  const copyBtn = document.getElementById('copy-mail');
  copyBtn.addEventListener('click', async () => {
    const label = copyBtn.querySelector('span');
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.mail);
      label.textContent = 'Copiado!';
    } catch (e) {
      label.textContent = copyBtn.dataset.mail;
    }
    setTimeout(() => { label.textContent = 'Copiar e-mail'; }, 2200);
  });

  // Anos de carreira sempre atualizados (data-years-since="AAAA-MM")
  const now = new Date();
  document.querySelectorAll('[data-years-since]').forEach((el) => {
    const [y, m] = el.dataset.yearsSince.split('-').map(Number);
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    el.textContent = Math.max(0, Math.floor(months / 12));
  });

  document.getElementById('year').textContent = now.getFullYear();
})();
