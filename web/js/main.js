/* Router + display page + start page. */
(function (root) {
  'use strict';
  const D = root.ETDisplay;
  const { h, icon, t } = root.ETUI;
  const standalone = root.ET_STANDALONE === true || location.protocol === 'file:';

  function parseRoute() {
    if (standalone || location.hash.length > 1) {
      const raw = location.hash.replace(/^#\/?/, '');
      const [view, q] = raw.split('?');
      const params = new URLSearchParams(q || '');
      if (['display', 'agenda', 'clock', 'plan'].includes(view)) return { view: 'display', params, layout: view === 'display' ? params.get('layout') : view === 'clock' ? 'time' : view };
      if (view === 'moderation' || view === 'cues') return { view, params };
      if (!standalone && view === '') return { view: 'home', params };
      return { view: 'control', params };
    }
    const p = location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(location.search);
    const short = p.match(/^\/(?:timer-?)?([1-8])$/);
    if (short) { params.set('t', short[1]); return { view: 'display', params, layout: params.get('layout') }; }
    if (p === '/display') return { view: 'display', params, layout: params.get('layout') };
    if (p === '/agenda') return { view: 'display', params, layout: 'agenda' };
    if (p === '/moderation' || p === '/cues') return { view: p.slice(1), params };
    if (p === '/plan') return { view: 'display', params, layout: 'plan' };
    if (p === '/clock' || p === '/uhr') return { view: 'display', params, layout: 'time' };
    if (p === '/control') return { view: 'control', params };
    return { view: 'home', params };
  }

  const first = parseRoute();
  const tr = root.ETTransport.create(first.view === 'control' || first.view === 'home' ? 'control' : 'display');
  const app = document.getElementById('app');
  let cleanup = null;

  function mount() {
    if (cleanup) { cleanup(); cleanup = null; }
    const r = parseRoute();
    document.body.dataset.view = r.view === 'display' ? (r.layout === 'agenda' ? 'agenda' : 'display') : r.view;
    document.documentElement.lang = root.ETUI.lang;
    if (r.view === 'control') { document.title = 'Event Timer – ' + t('Regie'); cleanup = root.ETControl.mount(app, tr); }
    else if (r.view === 'display') cleanup = mountDisplay(r);
    else if (r.view === 'moderation') cleanup = root.ETStage.mountModeration(app, tr, r.params);
    else if (r.view === 'cues') cleanup = root.ETStage.mountCues(app, tr);
    else mountHome();
  }

  // ------------------------------------------------------------- display
  function mountDisplay(r) {
    const p = r.params;
    const layout = ['full', 'clock', 'lower', 'agenda', 'time', 'plan'].includes(r.layout) ? r.layout : 'full';
    const seconds = p.get('sec') !== '0';
    const slot = p.get('t');
    const transparent = p.get('bg') === 'transparent';
    const chrome = p.get('chrome') !== '0';
    if (transparent) { document.body.style.background = 'transparent'; document.documentElement.style.background = 'transparent'; document.documentElement.style.colorScheme = 'normal'; }
    const stage = h('div', { class: 'stage' });
    const view = D.create(stage, {});
    const offline = h('div', { class: 'stage-offline', hidden: true, role: 'status' }, t('Verbindung unterbrochen – Zeit läuft weiter'));
    const ui = h('div', { class: 'stage-ui', 'data-idle': '1' });
    if (chrome && document.fullscreenEnabled !== false && document.documentElement.requestFullscreen) {
      ui.appendChild(h('button', { class: 'btn btn-icon', 'aria-label': t('Vollbild'), title: t('Vollbild'), onclick: () => {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
      } }, icon('full')));
    }
    if (standalone && p.get('here') === '1') {
      ui.appendChild(h('button', { class: 'btn', onclick: () => { location.hash = 'control'; } }, icon('back'), t('DSM-Ansicht verlassen')));
    }
    app.replaceChildren(stage, ui, offline);

    let idleTimer = null;
    const wake = () => {
      ui.dataset.idle = '0';
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { ui.dataset.idle = '1'; }, 2500);
      requestWakeLock();
    };
    ['pointermove', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, wake));

    let raf = 0, offlineSince = null, alive = true;
    const loop = () => {
      if (!alive) return;
      const s = tr.state;
      const now = tr.now();
      let tm = null;
      if (s) {
        tm = slot ? s.timers.find(x => x.id === 't' + slot) : s.timers[0];
        if (!tm && layout === 'agenda') tm = s.timers.find(x => x.id === s.agenda.timerId) || s.timers[0];
        document.title = (tm ? tm.name : 'Event Timer') + ' – Display';
      }
      view.update({ state: s, timer: tm, now, wallNow: now, layout, transparent, seconds, i18n: t });
      if (tr.mode === 'server') {
        if (tr.status !== 'online') { offlineSince = offlineSince || Date.now(); } else offlineSince = null;
        offline.hidden = !chrome || !offlineSince || Date.now() - offlineSince < 2500;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(idleTimer); ['pointermove', 'pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, wake)); };
  }

  // keep tablets and laptops from dimming the stage display
  let wakeLock = null;
  async function requestWakeLock() {
    if (wakeLock || !('wakeLock' in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* not allowed yet – next interaction tries again */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.dataset.view !== 'control') requestWakeLock(); });

  // ---------------------------------------------------------------- home
  function mountHome() {
    document.title = 'Event Timer';
    const list = h('div', { class: 'home-actions' });
    const render = () => {
      const s = tr.state;
      const timers = s ? s.timers : [];
      list.replaceChildren(
        h('a', { href: '/control' }, h('b', null, t('Regie')), h('span', null, t('Timer, Einblendungen, Ablaufplan, Cues'))),
        ...timers.map(x => h('a', { href: '/' + x.id.slice(1) }, h('b', null, x.name), h('span', null, t('DSM') + ' · /' + x.id.slice(1)))),
        h('a', { href: '/agenda' }, h('b', null, t('Ablauf-Display')), h('span', null, 'Backstage · /agenda')),
        h('a', { href: '/clock' }, h('b', null, t('Uhr')), h('span', null, t('Nur Uhrzeit') + ' · /clock')),
        h('a', { href: '/moderation' }, h('b', null, t('Moderation')), h('span', null, t('Talkback und Meldungen') + ' · /moderation')),
        h('a', { href: '/cues' }, h('b', null, t('Cue-Display')), h('span', null, '/cues')));
    };
    const off = tr.subscribe(render);
    render();
    cleanup = off;
    app.replaceChildren(h('div', { class: 'home' }, h('div', { class: 'home-card' },
      h('h1', { html: root.ETUI.brandSvg.replace('class="brand-mark"', 'class="brand-mark" style="width:40px;height:40px"') + '<span>Event Timer</span>' }),
      list)));
  }

  window.addEventListener('hashchange', mount);
  mount();
})(globalThis);
