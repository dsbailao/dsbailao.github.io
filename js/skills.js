// Constelação de tecnologias: grafo 3D desenhado em canvas 2D, que gira ao arrastar.
(function () {
  const canvas = document.getElementById('skills-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const info = document.getElementById('skill-info');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SKILLS = [
    ['SQL Server', 'db', 'DBA na Solfarma desde 2021: tuning, deadlocks e jobs em produção.'],
    ['T-SQL', 'db', 'Procedures, funções e scripts de deploy de todos os sistemas do GS300.'],
    ['Tuning de consultas', 'db', 'Até −95% de tempo e −99% de CPU em consultas críticas.'],
    ['Análise de falhas', 'db', 'Investigação diária de deadlocks, locks e erros do banco.'],
    ['Automação de rotinas', 'db', 'Criador do GS300TI, que automatiza deploy de banco e backup estrutural.'],
    ['Modelagem relacional', 'db', 'Estruturas de pedidos, integrações e parâmetros do ERP.'],
    ['C#', 'dev', 'Sistemas desktop e serviços do GS300, além do DSB-ERP.'],
    ['.NET', 'dev', 'WinForms, WCF e serviços Windows rodando em produção.'],
    ['Entity Framework', 'dev', 'Camada de dados do DSB-ERP.'],
    ['Java (Android)', 'dev', 'Manutenção do app Android nativo da Solfarma.'],
    ['Angular', 'dev', 'Manutenção do portal web da Solfarma.'],
    ['JavaScript', 'dev', 'DriveTunes e este site, sem framework.'],
    ['Three.js', 'dev', 'A cena 3D de partículas que acompanha esta página.'],
    ['HTML & CSS', 'dev', 'Este portfólio, feito à mão.'],
    ['Scrum', 'tools', 'Scrum Master de 12 sprints do time do ERP entre 2018 e 2021.'],
    ['TFS', 'tools', 'Backlog de 2015 a 2021: 1.874 itens antes da migração para o Azure DevOps.'],
    ['Azure DevOps', 'tools', 'Backlog desde 2022, pull requests e a migração do TFS que conduzi.'],
    ['Git & GitHub', 'tools', 'Versionamento de todos os projetos.'],
    ['Visual Studio', 'tools', 'A IDE do dia a dia há mais de 10 anos.'],
    ['Unity 3D', 'tools', 'App RA nas Escolas e curso de extensão na UNIFAFIBE.'],
    ['Blender 3D', 'tools', 'Modelagem 3D no curso de desenvolvimento de jogos.'],
    ['Vuforia', 'tools', 'Realidade aumentada no TCC.'],
    ['Adobe XD', 'tools', 'Protótipos de interface.'],
  ];
  const LINKS = [
    ['SQL Server', 'C#'], ['T-SQL', 'Entity Framework'], ['C#', 'Unity 3D'], ['JavaScript', 'Three.js'],
    ['Git & GitHub', 'Azure DevOps'], ['TFS', 'Azure DevOps'], ['Scrum', 'Azure DevOps'], ['Automação de rotinas', 'Azure DevOps'], ['.NET', 'Visual Studio'],
    ['Unity 3D', 'Blender 3D'], ['Unity 3D', 'Vuforia'], ['HTML & CSS', 'Adobe XD'], ['Angular', 'JavaScript'],
  ];

  const index = new Map(SKILLS.map(([name], i) => [name, i]));
  const n = SKILLS.length;
  const nodes = SKILLS.map(([name, group, text], i) => {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), phi = i * 2.39996;
    return { name, group, text, x: Math.cos(phi) * r, y, z: Math.sin(phi) * r, px: 0, py: 0, d: 0 };
  });
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (const k of [1, 2]) if (i + k < n && nodes[i + k].group === nodes[i].group) edges.push([i, i + k]);
  }
  LINKS.forEach(([a, b]) => edges.push([index.get(a), index.get(b)]));

  // cores do tema
  let colors = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (p) => cs.getPropertyValue(p).trim();
    colors = { db: v('--accent'), dev: v('--accent-2'), tools: v('--warm'), text: v('--text'), dim: v('--text-3') };
    draw();
  }

  let W = 0, H = 0, R = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height; R = Math.min(W, H) * 0.36;
    draw();
  }

  let ax = -0.35, ay = 0.4, hover = -1, active = 0, drag = null, visible = false;
  const focus = () => (hover >= 0 ? hover : active);

  function project() {
    const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
    nodes.forEach((p) => {
      const x1 = p.x * cb + p.z * sb, z1 = -p.x * sb + p.z * cb;
      const y2 = p.y * ca - z1 * sa, z2 = p.y * sa + z1 * ca;
      const s = 3 / (3 - z2);
      p.px = W / 2 + x1 * R * s;
      p.py = H / 2 + y2 * R * s;
      p.d = (z2 + 1) / 2;
    });
  }

  function draw() {
    if (!W) return;
    project();
    ctx.clearRect(0, 0, W, H);
    const f = focus();

    edges.forEach(([a, b]) => {
      const pa = nodes[a], pb = nodes[b], on = a === f || b === f;
      ctx.globalAlpha = on ? 0.9 : 0.08 + 0.3 * ((pa.d + pb.d) / 2);
      ctx.strokeStyle = on ? colors[nodes[f].group] : colors.dim;
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(pa.px, pa.py);
      ctx.lineTo(pb.px, pb.py);
      ctx.stroke();
    });

    const near = new Set(edges.filter(([a, b]) => a === f || b === f).flat());
    [...nodes.keys()].sort((a, b) => nodes[a].d - nodes[b].d).forEach((i) => {
      const p = nodes[i], on = i === f, linked = near.has(i);
      const r = 2.5 + p.d * 3.5 + (on ? 3 : 0);
      ctx.globalAlpha = on ? 1 : 0.35 + 0.65 * p.d;
      ctx.fillStyle = colors[p.group];
      if (on) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, r + 6, 0, Math.PI * 2);
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = on ? 1 : linked ? 0.9 : 0.2 + 0.7 * p.d;
      ctx.fillStyle = on || linked ? colors.text : colors.dim;
      ctx.font = `${on ? 700 : 500} ${on ? 14 : 11 + Math.round(p.d * 2)}px Inter, system-ui, sans-serif`;
      // rótulo à esquerda do ponto quando não cabe na borda direita
      const tw = ctx.measureText(p.name).width;
      const lx = p.px + r + 6 + tw > W - 4 ? p.px - r - 6 - tw : p.px + r + 6;
      ctx.fillText(p.name, lx, p.py + 4);
    });
    ctx.globalAlpha = 1;
  }

  function showInfo() {
    const p = nodes[focus()];
    info.querySelector('b').textContent = p.name;
    info.querySelector('span').textContent = p.text;
    info.dataset.group = p.group;
    document.querySelectorAll('[data-skill]').forEach((c) => c.classList.toggle('on', c.dataset.skill === p.name));
  }

  function hit(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bestD = 18;
    nodes.forEach((p, i) => {
      const d = Math.hypot(p.px - x, p.py - y);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ax, ay, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      ay = drag.ay + dx * 0.008;
      ax = Math.max(-1.2, Math.min(1.2, drag.ax + dy * 0.008));
    } else {
      const h = hit(e);
      if (h !== hover) { hover = h; canvas.style.cursor = h >= 0 ? 'pointer' : 'grab'; showInfo(); }
    }
    if (reduce) draw();
  });
  const endDrag = (e, click) => {
    if (drag && !drag.moved && click) {
      const h = hit(e);
      if (h >= 0) { active = h; showInfo(); }
    }
    drag = null;
    if (reduce) draw();
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, true));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, false));
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = -1; showInfo(); if (reduce) draw(); } });

  document.querySelectorAll('[data-skill]').forEach((chip) => {
    const i = index.get(chip.dataset.skill);
    if (i === undefined) return;
    chip.addEventListener('mouseenter', () => { hover = i; showInfo(); if (reduce) draw(); });
    chip.addEventListener('mouseleave', () => { hover = -1; showInfo(); if (reduce) draw(); });
    chip.addEventListener('click', () => { active = i; showInfo(); if (reduce) draw(); });
  });

  function loop() {
    if (!visible) return;
    if (!drag && hover < 0) ay += 0.0035;
    draw();
    requestAnimationFrame(loop);
  }

  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  readTheme();
  showInfo();

  if (!reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      const was = visible;
      visible = entries.some((en) => en.isIntersecting);
      if (visible && !was) requestAnimationFrame(loop);
    }).observe(canvas);
  }
})();
