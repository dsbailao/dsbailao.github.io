// Interações do portfólio: tema, menu, seção ativa, animação ao rolar, efeitos e easter egg.
(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Contador que sobe até o valor (data-count)
  function countUp(el) {
    if (reduceMotion) return;
    const end = Number(el.dataset.count), t0 = performance.now(), dur = 1400;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Título que se "decodifica" ao aparecer
  const GLYPHS = '01<>/{}[]#$%*+=_';
  function scramble(el) {
    if (reduceMotion) return;
    const final = el.textContent, total = 28;
    let frame = 0;
    el.setAttribute('aria-label', final);
    const step = () => {
      frame++;
      const shown = Math.floor((final.length * frame) / total);
      el.textContent = final.slice(0, shown) + [...final.slice(shown)]
        .map((c) => (c === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      if (frame < total) requestAnimationFrame(step);
      else { el.textContent = final; el.removeAttribute('aria-label'); }
    };
    requestAnimationFrame(step);
  }

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
  // + barra de progresso e HUD "query em execução"
  const topbar = document.querySelector('.topbar');
  const progress = document.getElementById('progress');
  const steps = [...document.querySelectorAll('[data-scene]')];
  const hudStep = document.getElementById('hud-step');
  const hudName = document.getElementById('hud-name');
  const hudPct = document.getElementById('hud-pct');
  const onScroll = () => {
    topbar.classList.toggle('scrolled', window.scrollY > 8);
    const max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progress.style.transform = `scaleX(${p})`;
    let idx = 0;
    steps.forEach((s, i) => { if (s.getBoundingClientRect().top < window.innerHeight * 0.5) idx = i; });
    hudStep.textContent = `${String(idx + 1).padStart(2, '0')}/${String(steps.length).padStart(2, '0')}`;
    hudName.textContent = steps[idx].dataset.label;
    hudPct.textContent = `${Math.round(p * 100)}%`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Animação de entrada + link ativo no menu
  const links = new Map([...nav.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-count]').forEach(countUp);
        const title = en.target.querySelector('.section-head h2');
        if (title) scramble(title);
        reveal.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' }); // sem threshold: seções mais altas que a tela também aparecem
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

  // Cards que inclinam em 3D seguindo o mouse
  if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.project, .pillar, .work, .kpi, .stat, .stack-group, .side-card').forEach((card) => {
      card.classList.add('tilt');
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        const max = Math.min(1, 420 / r.width) * 8;
        card.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
        card.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Easter egg: Konami code, digitar "drop table" ou tocar 5 vezes no logo
  const egg = document.getElementById('egg');
  const KONAMI = 'arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a';
  let keys = [], typed = '', taps = [];
  function dropTable() {
    if (egg.open) return;
    window.dispatchEvent(new CustomEvent('drop-table'));
    setTimeout(() => egg.showModal(), reduceMotion ? 0 : 700);
  }
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    keys = [...keys, k].slice(-10);
    typed = (typed + (k.length === 1 ? k : '')).slice(-10);
    if (keys.join() === KONAMI || typed === 'drop table') { keys = []; typed = ''; dropTable(); }
  });
  document.querySelector('.logo').addEventListener('click', () => {
    const t = Date.now();
    taps = [...taps.filter((x) => t - x < 2000), t];
    if (taps.length >= 5) { taps = []; dropTable(); }
  });
  console.log('%c> psst: digite "drop table" em qualquer lugar da página.', 'color:#8b8bff;font-family:monospace');
})();
