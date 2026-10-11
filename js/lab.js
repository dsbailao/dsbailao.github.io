// Laboratório "antes × depois do índice": simula um Table Scan e um Index Seek.
(function () {
  const lab = document.getElementById('lab');
  if (!lab) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOTAL = 192;
  const HITS = new Set([19, 44, 70, 101, 127, 150, 181]);
  const PATH = ['r', 'r-b1', 'b1', 'b1-l3', 'l3'];

  const plans = {
    scan: {
      op: 'Clustered Index Scan',
      desc: 'Sem índice, o SQL Server lê a tabela inteira para achar 7 notas.',
      time: 100, cpu: 100, rows: TOTAL, ms: 2600,
      result: `Clustered Index Scan: ${TOTAL} linhas lidas para devolver 7.`,
    },
    seek: {
      op: 'Index Seek (NonClustered)',
      desc: 'Com o índice, ele desce pela árvore e vai direto às 7 notas.',
      time: 5, cpu: 1, rows: HITS.size, ms: 1100,
      result: 'Index Seek: 7 linhas lidas · −95% de tempo · −99% de CPU.',
    },
  };

  const grid = lab.querySelector('.lab-grid');
  const cells = Array.from({ length: TOTAL }, () => grid.appendChild(document.createElement('i')));
  const opName = lab.querySelector('#lab-op-name');
  const opDesc = lab.querySelector('#lab-op-desc');
  const result = lab.querySelector('#lab-result');
  const runBtn = lab.querySelector('#lab-run');
  const planBtns = [...lab.querySelectorAll('[data-plan-btn]')];
  const treeParts = Object.fromEntries([...lab.querySelectorAll('[data-node]')].map((el) => [el.dataset.node, el]));

  let plan = 'scan';
  let running = false;

  function animate(ms, fn) {
    return new Promise((resolve) => {
      if (!ms) { fn(1); resolve(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        fn(p);
        if (p < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function setMeters(name, p) {
    const cfg = plans[name];
    lab.querySelectorAll(`[data-meter]`).forEach((m) => {
      const kind = m.dataset.meter;
      const bar = m.querySelector(`.m-bar[data-plan="${name}"] i`);
      const val = m.querySelector(`.m-val[data-plan="${name}"]`);
      if (kind === 'rows') {
        const n = Math.round(cfg.rows * p);
        bar.style.width = `${(n / TOTAL) * 100}%`;
        val.textContent = n;
      } else {
        const v = cfg[kind] * p;
        bar.style.width = `${v}%`;
        val.textContent = `${Math.round(v)}%`;
      }
    });
  }

  function reset() {
    cells.forEach((c) => { c.className = ''; });
    Object.values(treeParts).forEach((el) => el.classList.remove('on'));
    result.textContent = '';
  }

  async function run() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    reset();
    const cfg = plans[plan];
    const ms = reduce ? 0 : cfg.ms;

    if (plan === 'scan') {
      let lit = 0;
      await animate(ms, (p) => {
        const upto = Math.floor(p * TOTAL);
        for (; lit < upto; lit++) cells[lit].className = HITS.has(lit) ? 'hit' : 'read';
        setMeters('scan', p);
      });
    } else {
      await animate(ms, (p) => {
        PATH.forEach((id, k) => { if (p >= (k / PATH.length) * 0.6) treeParts[id].classList.add('on'); });
        if (p >= 0.6) HITS.forEach((i) => { cells[i].className = 'hit'; });
        setMeters('seek', p);
      });
    }

    result.textContent = cfg.result;
    running = false;
    runBtn.disabled = false;
  }

  function select(name) {
    plan = name;
    lab.dataset.plan = name;
    planBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.planBtn === name)));
    opName.textContent = plans[name].op;
    opDesc.textContent = plans[name].desc;
    reset();
  }

  planBtns.forEach((b) => b.addEventListener('click', () => {
    if (running || b.dataset.planBtn === plan) return;
    select(b.dataset.planBtn);
    run();
  }));
  runBtn.addEventListener('click', run);

  select('scan');

  // roda o Table Scan sozinho na primeira vez que o laboratório aparece
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.45 });
    io.observe(lab);
  }
})();
