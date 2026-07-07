/* Terra News — global news on a spinning globe.
 * Loads data/news.json (built by scripts/fetch-news.mjs), plots each article at
 * its source-country location, and wires up rotation, region fly-to, topic
 * filters, search, and a headlines panel. Pure vanilla JS + globe.gl. */
(function () {
  'use strict';

  const TOPIC_COLORS = {
    Top: '#ff5d5d',
    Politics: '#ff9f43',
    Conflict: '#ff3b6b',
    Economy: '#ffd24c',
    Climate: '#38d39f',
    Technology: '#4c8dff',
    Health: '#5de0e6',
    Science: '#a56bff',
    Sports: '#7bed57',
    Africa: '#e6a355',
    Asia: '#ff8fb1',
    Europe: '#6fa8ff',
    'Middle East': '#d4b54c',
    Americas: '#57e0c0',
  };
  const DEFAULT_COLOR = '#9fb3d1';
  const colorFor = (t) => TOPIC_COLORS[t] || DEFAULT_COLOR;

  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const overlayMsg = el('overlay-msg');

  let ALL = [];          // all articles
  let activeTopics = null; // Set of enabled topics, or null = all
  let searchTerm = '';
  let world;
  let resumeTimer = null;

  /* ---------------- Globe setup ---------------- */
  function initGlobe() {
    world = Globe()(el('globe'))
      .globeImageUrl('img/earth-dark.jpg')
      .bumpImageUrl('img/earth-topology.png')
      .backgroundImageUrl('img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#4c8dff')
      .atmosphereAltitude(0.18)
      .pointsMerge(false)
      .pointAltitude(0.012)
      .pointRadius(0.28)
      .pointResolution(6)
      .pointColor((d) => colorFor(d.topic))
      .pointLabel(tooltipHtml)
      .onPointClick(openArticle)
      .ringColor((d) => (t) => `rgba(${hexToRgb(colorFor(d.topic))},${1 - t})`)
      .ringMaxRadius(3.2)
      .ringPropagationSpeed(1.4)
      .ringRepeatPeriod(900);

    // Gentle auto-rotation; pause while the user interacts.
    const controls = world.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 130;   // limit zoom-in
    controls.maxDistance = 520;   // limit zoom-out
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      if (resumeTimer) clearTimeout(resumeTimer);
    });
    controls.addEventListener('end', () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 3500);
    });

    world.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 0);
    onResize();
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    world.width(window.innerWidth).height(window.innerHeight);
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  /* ---------------- Rendering ---------------- */
  function visibleArticles() {
    return ALL.filter((a) => {
      if (activeTopics && !activeTopics.has(a.topic)) return false;
      if (searchTerm) {
        const hay = (a.title + ' ' + a.country + ' ' + a.domain).toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });
  }

  function render() {
    const arts = visibleArticles();
    world.pointsData(arts);
    // Pulse rings on the 6 most recent visible stories.
    world.ringsData(arts.slice(0, 6));
    renderHeadlines(arts);
    el('stat-articles').textContent = arts.length;
    el('stat-countries').textContent = new Set(arts.map((a) => a.country)).size;
    el('panel-count').textContent = `(${arts.length})`;
  }

  function tooltipHtml(d) {
    const date = d.date ? timeAgo(new Date(d.date)) : '';
    return (
      `<div class="globe-tip">` +
      `<div class="t-country">${escapeHtml(d.country)} · ${escapeHtml(d.topic)}</div>` +
      `<div class="t-title">${escapeHtml(d.title)}</div>` +
      `<div class="t-meta">${escapeHtml(d.domain)}${date ? ' · ' + date : ''}</div>` +
      `<div class="t-hint">Click to read →</div>` +
      `</div>`
    );
  }

  function renderHeadlines(arts) {
    const ul = el('headlines');
    ul.innerHTML = '';
    if (!arts.length) {
      ul.innerHTML = '<li style="cursor:default;color:var(--muted)">No stories match your filters.</li>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const a of arts.slice(0, 120)) {
      const li = document.createElement('li');
      const date = a.date ? timeAgo(new Date(a.date)) : '';
      li.innerHTML =
        `<p class="h-title">${escapeHtml(a.title)}</p>` +
        `<div class="h-meta">` +
        `<span class="pill" style="background:${colorFor(a.topic)}">${escapeHtml(a.country)}</span>` +
        `<span>${escapeHtml(a.domain)}</span>` +
        (date ? `<span>· ${date}</span>` : '') +
        `</div>`;
      li.addEventListener('click', () => focusArticle(a));
      frag.appendChild(li);
    }
    ul.appendChild(frag);
  }

  /* ---------------- Interactions ---------------- */
  function openArticle(d) {
    if (d && d.url) window.open(d.url, '_blank', 'noopener');
  }

  // Fly the camera to an article, then open it.
  function focusArticle(a) {
    world.controls().autoRotate = false;
    world.pointOfView({ lat: a.lat, lng: a.lng, altitude: 0.9 }, 900);
    setTimeout(() => openArticle(a), 950);
  }

  function flyTo(region, btn) {
    world.controls().autoRotate = false;
    if (resumeTimer) clearTimeout(resumeTimer);
    world.pointOfView({ lat: region.lat, lng: region.lng, altitude: region.altitude }, 1100);
    document.querySelectorAll('#regions button').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (region.id === 'world') {
      resumeTimer = setTimeout(() => { world.controls().autoRotate = true; }, 2000);
    }
  }

  /* ---------------- UI building ---------------- */
  function buildRegions() {
    const nav = el('regions');
    for (const r of window.REGIONS) {
      const b = document.createElement('button');
      b.textContent = r.name;
      if (r.id === 'world') b.classList.add('active');
      b.addEventListener('click', () => flyTo(r, b));
      nav.appendChild(b);
    }
  }

  function buildTopics() {
    const wrap = el('topics');
    const topics = [...new Set(ALL.map((a) => a.topic))].sort();
    activeTopics = new Set(topics); // all on initially
    for (const t of topics) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.innerHTML = `<span class="dot" style="background:${colorFor(t)}"></span>${escapeHtml(t)}`;
      chip.addEventListener('click', () => {
        if (activeTopics.has(t)) activeTopics.delete(t);
        else activeTopics.add(t);
        chip.classList.toggle('off', !activeTopics.has(t));
        // Treat "all selected" as no filter for clarity.
        render();
      });
      wrap.appendChild(chip);
    }
  }

  function wireSearch() {
    const input = el('search');
    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        searchTerm = input.value.trim().toLowerCase();
        render();
      }, 180);
    });
  }

  function wirePanel() {
    el('panel-toggle').addEventListener('click', () => {
      el('panel').classList.toggle('open');
    });
  }

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  }

  function setUpdated(iso) {
    if (!iso) { el('stat-updated').textContent = ''; return; }
    el('stat-updated').textContent = 'updated ' + timeAgo(new Date(iso));
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    initGlobe();
    buildRegions();
    wireSearch();
    wirePanel();

    try {
      overlayMsg.textContent = 'Fetching latest headlines…';
      const res = await fetch('data/news.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      ALL = (data.articles || []).filter(
        (a) => Number.isFinite(a.lat) && Number.isFinite(a.lng),
      );
      setUpdated(data.generatedAt);
      buildTopics();
      render();
    } catch (err) {
      overlayMsg.textContent = 'Could not load news data (' + err.message + ').';
      console.error(err);
      // Keep the globe visible even with no data.
      setTimeout(() => overlay.classList.add('hidden'), 1500);
      return;
    }

    // Reveal once the globe texture has had a moment to draw.
    setTimeout(() => overlay.classList.add('hidden'), 900);
  }

  if (typeof Globe !== 'function') {
    overlayMsg.textContent = 'Globe library failed to load.';
  } else {
    boot();
  }
})();
