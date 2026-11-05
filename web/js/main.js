/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/* Router + display page + start page. */
(function (root) {
  'use strict';
  const D = root.ETDisplay;
  const { h, icon, t } = root.ETUI;
  const standalone = root.ET_STANDALONE === true || location.protocol === 'file:';

  /**
   * Screens: /1 … /16 (or /p/<name>), /moderation = first presenter screen; fixed pages /plan, /uhr, /cues.
   * Old display links with ?layout=… and /agenda keep the classic single-timer view.
   */
  function parseRoute() {
    if (standalone || location.hash.length > 1) {
      const raw = location.hash.replace(/^#\/?/, '');
      const [view, q] = raw.split('?');
      const params = new URLSearchParams(q || '');
      const slug = view.match(/^p\/([a-z0-9-]+)$/);
      if (slug) return { view: 'page', slug: slug[1], params };
      if (view === 'display') return params.get('layout') ? { view: 'display', params, layout: params.get('layout') } : { view: 'page', num: Number(params.get('t')) || 1, params };
      if (view === 'agenda') return { view: 'display', params, layout: 'agenda' };
      if (view === 'plan') return { view: 'page', route: 'plan', params };
      if (view === 'clock' || view === 'uhr') return { view: 'page', route: 'uhr', params };
      if (view === 'moderation') return { view: 'page', route: 'moderation', params };
      if (view === 'cues') return { view, params };
      if (!standalone && view === '') return { view: 'home', params };
      return { view: 'control', params };
    }
    const p = location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(location.search);
    const slug = p.match(/^\/p\/([a-z0-9-]+)$/);
    if (slug) return { view: 'page', slug: slug[1], params };
    const short = p.match(/^\/(?:timer-?)?([1-9]|1[0-6])$/);
    if (short) {
      params.set('t', short[1]);
      return params.get('layout') ? { view: 'display', params, layout: params.get('layout') } : { view: 'page', num: Number(short[1]), params };
    }
    if (p === '/display') return params.get('layout') ? { view: 'display', params, layout: params.get('layout') } : { view: 'page', num: Number(params.get('t')) || 1, params };
    if (p === '/agenda') return { view: 'display', params, layout: 'agenda' };
    if (p === '/moderation') return { view: 'page', route: 'moderation', params };
    if (p === '/cues') return { view: 'cues', params };
    if (p === '/plan') return { view: 'page', route: 'plan', params };
    if (p === '/clock' || p === '/uhr') return { view: 'page', route: 'uhr', params };
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
    else if (r.view === 'page') cleanup = root.ETPages.mountPage(app, tr, r);
    else if (r.view === 'cues') cleanup = root.ETStage.mountCues(app, tr);
    else mountHome();
  }

  // ------------------------------------------------------------- display
  function mountDisplay(r) {
    const p = r.params;
    const layout = ['full', 'clock', 'lower', 'agenda', 'time', 'plan'].includes(r.layout) ? r.layout : 'full';
    document.body.dataset.view = layout === 'agenda' ? 'agenda' : 'display';
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
      document.body.dataset.idle = '0';
      clearTimeout(idleTimer);
      // chrome and mouse pointer disappear after a moment: nothing but the time on stage
      idleTimer = setTimeout(() => { ui.dataset.idle = '1'; document.body.dataset.idle = '1'; }, 2500);
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
      const msg = s && tm ? root.ETPages.overlayOf(s, root.ETPages.dsmPageFor(s, tm.id.slice(1))) : null;
      view.update({ state: s, timer: tm, now, wallNow: now, layout, transparent, seconds, message: msg, i18n: t });
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
      list.replaceChildren(
        h('a', { href: '/control' }, h('b', null, t('Regie')), h('span', null, t('Timer, Einblendungen, Agenda, Cues'))),
        ...(s ? root.ETPages.byNum(s) : []).map(x => h('a', { href: '/' + x.num }, h('b', null, x.num + ' · ' + x.name), h('span', null, t(root.ETPages.KIND_NAMES[x.kind]) + ' · /' + x.num))),
        h('a', { href: '/plan' }, h('b', null, t('Agenda-Monitor')), h('span', null, '/plan')),
        h('a', { href: '/uhr' }, h('b', null, t('Uhr')), h('span', null, '/uhr')),
        h('a', { href: '/cues' }, h('b', null, t('Cue-Liste')), h('span', null, '/cues')));
    };
    const off = tr.subscribe(render);
    render();
    cleanup = off;
    app.replaceChildren(h('div', { class: 'home' }, h('div', { class: 'home-card' },
      h('h1', null, root.ETUI.logo('home-logo')),
      list)));
  }

  window.addEventListener('hashchange', mount);
  mount();
})(globalThis);
