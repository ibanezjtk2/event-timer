/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Pages built from modules.
 *  DSM pages  – display only (stage monitors, no touch): nothing can be sent or confirmed there
 *  mod pages  – the presenter's phone/tablet: everything, including talkback and messages to the Regie
 * The old addresses (/1…/8, /plan, /uhr, /moderation) are built-in pages; a custom page can stand in
 * for /moderation or /1…/8 ("standard address"), so bookmarks and kiosk browsers keep working.
 */
(function (root) {
  'use strict';
  const E = root.ETEngine, D = root.ETDisplay;
  const { h, icon, toast, t } = root.ETUI;
  const store = root.ETTransport.store;
  const hm = ms => D.clockText(ms, false);

  // ------------------------------------------------------------ catalogue
  const MODULES = {
    timer: { label: 'Timer', help: 'Zeit groß mit Titel, Fortschrittsbalken, Vorwarnung und Kritisch.' },
    clock: { label: 'Uhr', help: 'Die aktuelle Uhrzeit.' },
    next: { label: 'Nächster Punkt', help: '„Danach: …“ mit Planzeit.' },
    agenda: { label: 'Ablaufplan', help: 'Der ganze Ablauf, laufender Punkt mit Balken, Restzeit, Vorwarnung und Kritisch.' },
    message: { label: 'Einblendung', help: 'Die Einblendung der Regie für diesen DSM.', helpMod: 'Spiegel: zeigt, was gerade auf einem DSM steht.' },
    note: { label: 'Hinweis', help: 'Der Hinweis der Regie zum laufenden Programmpunkt. Privat, nur für die Moderation.' },
    talkback: { label: 'Von der Regie', help: 'Talkback der Regie mit „Verstanden“.' },
    request: { label: 'An die Regie', help: 'Meldungen an die Regie: Schnelltasten, Freitext und ob sie bestätigt sind.' },
  };
  const LAYOUTS = { full: 'Vollbild', side: 'Haupt + Seite', bottom: 'Haupt + Leiste unten', two: 'Zwei Spalten', one: 'Eine Spalte' };
  const SLOT_NAMES = { full: ['Bild'], side: ['Haupt', 'Seite'], bottom: ['Haupt', 'Leiste unten'], two: ['Spalte A', 'Spalte B'], one: ['Spalte'] };
  const KIND_NAMES = { dsm: 'DSM', mod: 'Moderation' };

  // ------------------------------------------------------- built-in pages
  const agendaTimerId = s => (s.timers.find(x => x.id === s.agenda.timerId) || s.timers[0] || { id: 't1' }).id;
  function mk(id, kind, name, route, layout, slots) {
    return {
      id, kind, name, route, builtin: true, slug: '', layout,
      slots: slots.map((sl, i) => sl.map((m, j) => ({ id: 'b' + i + j, type: m[0], opts: m[1] || {} }))),
    };
  }
  const builtinDsm = (n, name) => mk('d' + n, 'dsm', 'DSM ' + n + (name ? ' · ' + name : ''), n, 'full', [[['timer', { timer: 't' + n, variant: 'full' }]]]);
  /** The pages that always exist – shown as templates in the editor. */
  function builtins(s) {
    const at = agendaTimerId(s);
    const list = s.timers.map(tm => builtinDsm(tm.id.slice(1), tm.name));
    list.push(mk('plan', 'dsm', 'Ablaufplan', 'plan', 'side', [[['timer', { timer: at, variant: 'full' }]], [['agenda']]]));
    list.push(mk('uhr', 'dsm', 'Uhr', 'uhr', 'full', [[['clock', { seconds: true }]]]));
    list.push(mk('mod', 'mod', 'Moderation', 'moderation', 'two', [
      [['timer', { timer: at, variant: 'full' }], ['note'], ['agenda']],
      [['talkback'], ['request']],
    ]));
    return list;
  }

  /** r = { route: "moderation" | "1"…"8" | "plan" | "uhr" } or { slug } → page definition or null */
  function resolvePage(s, r) {
    if (!s) return null;
    if (r.slug != null) return s.pages.find(p => p.slug === r.slug) || null;
    const key = String(r.route);
    const customId = s.routes && s.routes[key];
    const custom = customId && s.pages.find(p => p.id === customId);
    if (custom) return custom;
    const id = key === 'moderation' ? 'mod' : /^[1-8]$/.test(key) ? 'd' + key : key;
    const b = builtins(s).find(p => p.id === id) || (/^[1-8]$/.test(key) ? builtinDsm(key, '') : null);
    // old links: /moderation?t=2 follows timer 2
    if (b && b.id === 'mod' && r.params && /^[1-8]$/.test(r.params.get('t') || '')) {
      b.slots[0][0].opts.timer = 't' + r.params.get('t');
    }
    return b;
  }

  /** Address of a page, relative to the server root ("/p/slug", "/moderation", "/3"). */
  function pagePath(pg) {
    if (!pg.builtin) return '/p/' + pg.slug;
    return { moderation: '/moderation', plan: '/plan', uhr: '/uhr' }[pg.route] || '/' + pg.route;
  }
  /** "/moderation" or "/1"… this custom page stands in for, or "" */
  function standardOf(s, pg) {
    const k = Object.keys(s.routes || {}).find(x => s.routes[x] === pg.id);
    return k ? (k === 'moderation' ? '/moderation' : '/' + k) : '';
  }

  const showsOverlay = pg => pg.kind === 'dsm' && pg.slots.some(sl => sl.some(m => m.type === 'timer' || m.type === 'message'));
  /**
   * DSM pages the Regie can send overlays to. Built-in /N counts unless a custom page stands in for it.
   * The built-in /plan is not a chip of its own but gets everything sent to "Alle".
   */
  function dsmTargets(s, withHidden) {
    const out = [];
    for (const tm of s.timers) {
      const n = tm.id.slice(1);
      if (!s.routes[n]) out.push({ id: 'd' + n, name: 'DSM ' + n, sub: tm.name });
    }
    for (const pg of s.pages) {
      if (!showsOverlay(pg)) continue;
      const std = standardOf(s, pg);
      out.push({ id: pg.id, name: pg.name, sub: std || pagePath(pg) });
    }
    if (withHidden) out.push({ id: 'plan', name: 'Ablaufplan', sub: '/plan', hidden: true });
    return out;
  }
  /** The DSM page behind "/N" (custom stand-in or built-in dN). */
  const dsmPageFor = (s, n) => (s.routes && s.routes[n]) || 'd' + n;
  const overlayOf = (s, pageId) => (s.dsmMsg && s.dsmMsg[pageId]) || null;

  // ---------------------------------------------------------- helpers
  let wakeLock = null;
  async function keepAwake() {
    if (wakeLock || document.hidden || !('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* needs a tap first */ }
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const setData = (el, k, v) => { const sv = String(v); if (el.dataset[k] !== sv) el.dataset[k] = sv; };
  function phaseOf(ms, tm) {
    if (ms == null) return 'normal';
    if (ms < 0) return 'over';
    if (tm && ms <= tm.critMs) return 'crit';
    if (tm && ms <= tm.warnMs) return 'warn';
    return 'normal';
  }

  // ============================================================ DSM modules
  // Every DSM module gets (box, module, ctx) and returns { tick(state, now) }.
  // ctx: { page, preview, seconds, transparent, presetId, hasMessage }
  const DSM = {
    timer(box, m, c) {
      const v = D.create(box, {});
      return {
        tick(s, now) {
          const tm = s.timers.find(x => x.id === m.opts.timer) || null;
          v.update({
            state: s.blackout ? Object.assign({}, s, { blackout: false }) : s,
            timer: tm, now, wallNow: now, layout: m.opts.variant || 'full', transparent: c.transparent, seconds: c.seconds, i18n: t,
            // the overlay sits inside the timer unless the page has its own "Einblendung" module
            message: c.hasMessage ? null : overlayOf(s, c.page.id),
          });
        },
      };
    },
    clock(box, m, c) {
      const v = D.create(box, {});
      return {
        tick(s, now) {
          const base = s.timers[0];
          if (!base) return;
          v.update({ state: Object.assign({}, s, { blackout: false }), timer: Object.assign({}, base, { kind: 'time', presetId: c.presetId }), now, wallNow: now, layout: 'time', transparent: c.transparent, seconds: c.seconds && m.opts.seconds !== false, i18n: t });
        },
      };
    },
    next(box) {
      const lbl = h('span', { class: 'pgm-next-l' }, t('Danach'));
      const what = h('b');
      const when = h('span', { class: 'pgm-next-t' });
      box.append(h('div', { class: 'pgm-next' }, lbl, what, when));
      return {
        tick(s, now) {
          const rv = E.runView(s, now);
          const nx = rv.next;
          setData(box, 'empty', nx ? 0 : 1);
          if (!nx) return;
          setText(lbl, t(rv.started ? 'Danach' : 'Als Erstes'));
          setText(what, nx.item.title + (nx.item.speaker ? ' – ' + nx.item.speaker : ''));
          setText(when, nx.start != null ? hm(nx.start) : '');
        },
      };
    },
    agenda(box, m, c) {
      const list = h('ol', { class: 'pgm-ros' });
      box.append(list);
      let key = '', bar = null, rest = null, live = null;
      return {
        tick(s, now) {
          const rv = E.runView(s, now);
          const k = JSON.stringify(rv.rows.map(r => [r.item.id, r.item.title, r.item.speaker, r.item.durationMs, r.start, r.status])) + t('Danach');
          if (k !== key) {
            key = k; bar = null; rest = null; live = null;
            list.replaceChildren(...(rv.rows.length ? rv.rows.map(r => {
              const right = h('span', { class: 'pgm-ros-dur' }, E.formatMs(r.item.durationMs));
              const li = h('li', { 'data-status': r.status },
                h('span', { class: 'pgm-ros-time' }, r.start != null ? hm(r.start) : String(r.index + 1)),
                h('span', { class: 'pgm-ros-what' }, h('b', null, r.item.title || '—'), r.item.speaker ? h('span', null, r.item.speaker) : null),
                right);
              if (r.status === 'live') { bar = h('i', { class: 'pgm-ros-bar' }); li.prepend(bar); rest = right; live = li; }
              return li;
            }) : [h('li', { class: 'pgm-ros-empty' }, t('Noch kein Ablauf'))]));
            if (live) setTimeout(() => { list.scrollTop = Math.max(0, live.offsetTop - list.clientHeight / 3); }, 0);
          }
          if (live && rv.current) {
            const tm = s.timers.find(x => x.id === s.agenda.timerId);
            bar.style.width = (rv.progress * 100).toFixed(1) + '%';
            setText(rest, (rv.remainingMs < 0 ? '+' : '') + E.formatMs(Math.abs(rv.remainingMs)));
            setData(live, 'phase', phaseOf(rv.remainingMs, tm));
          }
        },
      };
    },
    message(box, m, c) {
      const txt = h('div', { class: 'pgm-msg-text' });
      const card = h('div', { class: 'pgm-msg' }, txt);
      box.append(card);
      return {
        tick(s) {
          const msg = overlayOf(s, c.page.id);
          const on = msg && msg.visible && msg.text ? 1 : 0;
          setData(box, 'empty', on ? 0 : 1);
          setText(txt, on ? msg.text : '');
          setData(card, 'flash', on && msg.flash ? 1 : 0);
          setData(card, 'long', on && msg.text.length > 60 ? 2 : on && msg.text.length > 24 ? 1 : 0);
        },
      };
    },
  };

  function buildDsm(host, tr, pg, params, o) {
    const s = tr.state;
    const firstTimer = pg.slots.flat().find(m => m.type === 'timer');
    const ptimer = (firstTimer && s.timers.find(x => x.id === firstTimer.opts.timer)) || s.timers[0];
    const presetId = ptimer ? ptimer.presetId : 'stage';
    const c = {
      page: pg, preview: Boolean(o.preview), presetId,
      seconds: params.get('sec') !== '0',
      transparent: params.get('bg') === 'transparent',
      hasMessage: pg.slots.some(sl => sl.some(m => m.type === 'message')),
    };
    const rootEl = h('div', { class: 'pg pg-dsm', 'data-layout': pg.layout });
    const slots = pg.slots.map(() => h('div', { class: 'pg-slot' }));
    rootEl.append(...slots, h('div', { class: 'pg-blackout' }));
    host.append(rootEl);
    const mods = [];
    pg.slots.forEach((sl, i) => sl.forEach(m => {
      const box = h('div', { class: 'pgm', 'data-type': m.type });
      slots[i].append(box);
      if (DSM[m.type]) mods.push(DSM[m.type](box, m, c));
    }));
    if (!mods.length) rootEl.append(h('div', { class: 'pg-empty' }, t('Diese Seite hat noch keine Module.')));
    let presetKey = '';
    return {
      tick(st, now) {
        const p = st.presets.find(x => x.id === presetId) || st.presets[0];
        const pk = JSON.stringify(p) + c.transparent;
        if (pk !== presetKey) { presetKey = pk; D.applyPreset(rootEl, p, c.transparent); }
        setData(rootEl, 'blackout', st.blackout && !c.preview ? 1 : 0);
        for (const md of mods) md.tick(st, now);
      },
      destroy() {},
    };
  }

  // ======================================================= presenter modules
  // (box, module, ctx) → { tick(state, now) }; ctx: { page, preview, me(), tr }
  const MOD = {
    timer(box, m) {
      const title = h('div', { class: 'mod-title' });
      const drift = h('span', { class: 'mod-drift', hidden: true });
      const time = h('div', { class: 'mod-time num' });
      const sub = h('div', { class: 'mod-sub' });
      const bar = h('i');
      const next = h('div', { class: 'mod-next' });
      box.append(h('div', { class: 'mod-now-head' }, title, drift), time, sub, h('div', { class: 'mod-bar' }, bar), next);
      return {
        tick(s, now) {
          const a = s.agenda;
          const tm = s.timers.find(x => x.id === m.opts.timer);
          if (!tm) { setText(title, t('Timer gibt es nicht')); setText(time, '--:--'); return; }
          const v = E.timerView(tm, now);
          const seg = tm.segmentId ? a.items.find(x => x.id === tm.segmentId) : null;
          const nx = seg ? a.items[a.items.indexOf(seg) + 1] : null;
          setText(title, seg ? seg.title : tm.name);
          const txt = E.isStatic(tm.kind) ? D.clockText(now, false) : E.formatMs(v.ms, { up: tm.kind === 'countup' });
          setText(time, txt);
          setData(time, 'phase', v.phase || 'normal');
          setText(sub, { running: t('Läuft'), paused: t('Pausiert'), idle: t('Bereit'), finished: t('Abgelaufen') }[v.state] || '');
          bar.style.width = ((v.progress || 0) * 100).toFixed(1) + '%';
          setText(next, nx ? t('Danach') + ': ' + nx.title : '');
          // deviation from the plan – only for the timer that runs the show
          let dt = '';
          if (tm.id === a.timerId) {
            const av = E.agendaView(s, now);
            if (av.started && !av.done && Math.abs(av.drift) >= 30000) dt = E.formatMs(Math.abs(av.drift)) + ' ' + (av.drift > 0 ? t('hinter Plan') : t('vor Plan'));
            setData(drift, 'tone', av.drift > 0 ? 'behind' : 'ahead');
          }
          setText(drift, dt);
          drift.hidden = !dt;
        },
      };
    },
    clock(box, m) {
      const el = h('div', { class: 'mpg-clock num' });
      box.append(el);
      return { tick(s, now) { setText(el, D.clockText(now, m.opts.seconds !== false)); } };
    },
    next(box) {
      const what = h('b');
      const when = h('span', { class: 'muted' });
      const lbl = h('div', { class: 'mod-h' }, t('Danach'));
      box.append(lbl, h('div', { class: 'mpg-next' }, what, when));
      return {
        tick(s, now) {
          const rv = E.runView(s, now);
          const nx = rv.next;
          setText(lbl, t(rv.started ? 'Danach' : 'Als Erstes'));
          setText(what, nx ? nx.item.title + (nx.item.speaker ? ' – ' + nx.item.speaker : '') : t(rv.finished ? 'Programm beendet' : 'Nichts mehr geplant'));
          setText(when, nx && nx.start != null ? t('Plan') + ' ' + hm(nx.start) : '');
        },
      };
    },
    note(box) {
      const txt = h('div');
      box.append(h('div', { class: 'mod-h' }, t('Hinweis')), txt);
      return {
        tick(s) {
          const tm = s.timers.find(x => x.id === s.agenda.timerId);
          const seg = tm && tm.segmentId ? s.agenda.items.find(x => x.id === tm.segmentId) : null;
          const note = seg && seg.note ? seg.note : '';
          setData(box, 'empty', note ? 0 : 1);
          setText(txt, note);
        },
      };
    },
    agenda(box) {
      const list = h('ol', { class: 'mod-prog-list' });
      box.append(h('div', { class: 'mod-h' }, t('Programm')), list);
      let key = '', bar = null, rest = null, live = null;
      return {
        tick(s, now) {
          const rv = E.runView(s, now);
          const k = JSON.stringify(rv.rows.map(r => [r.item.id, r.item.title, r.item.speaker, r.item.note, r.item.durationMs, r.start, r.status])) + root.ETUI.lang;
          if (k !== key) {
            key = k; bar = null; rest = null; live = null;
            list.replaceChildren(...(rv.rows.length ? rv.rows.map(r => {
              const right = h('span', { class: 'mod-prog-dur num' }, E.formatMs(r.item.durationMs));
              const li = h('li', { 'data-status': r.status },
                h('span', { class: 'mod-prog-time num' }, r.start != null ? hm(r.start) : '–'),
                h('span', { class: 'mod-prog-what' }, h('b', null, r.item.title || '—'),
                  r.item.speaker ? h('span', null, r.item.speaker) : null,
                  r.item.note ? h('em', null, t('Hinweis') + ': ' + r.item.note) : null),
                right);
              if (r.status === 'live') { bar = h('i', { class: 'mod-prog-bar' }); li.prepend(bar); rest = right; live = li; }
              return li;
            }) : [h('li', { class: 'muted' }, t('Noch kein Ablauf'))]));
            if (live) setTimeout(() => { list.scrollTop = Math.max(0, live.offsetTop - list.offsetTop - 40); }, 0);
          }
          if (live && rv.current) {
            const tm = s.timers.find(x => x.id === s.agenda.timerId);
            bar.style.width = (rv.progress * 100).toFixed(1) + '%';
            setText(rest, (rv.remainingMs < 0 ? '+' : '') + E.formatMs(Math.abs(rv.remainingMs)));
            setData(live, 'phase', phaseOf(rv.remainingMs, tm));
          }
        },
      };
    },
    message(box, m) {
      const txt = h('div', { class: 'mpg-dsm-text' });
      const head = h('div', { class: 'mpg-dsm-head' }, icon('screen'), h('span', null, t('Steht auf dem DSM')));
      box.append(head, txt);
      return {
        tick(s) {
          const pid = m.opts.page || dsmPageFor(s, agendaTimerId(s).slice(1));
          const msg = overlayOf(s, pid);
          const on = msg && msg.visible && msg.text ? 1 : 0;
          setData(box, 'on', on);
          setText(txt, on ? msg.text : t('Nichts eingeblendet'));
        },
      };
    },
    talkback(box, m, c) {
      const text = h('div', { class: 'mod-talk-text' });
      const meta = h('small');
      const ok = h('button', { class: 'btn btn-go mod-talk-ok', onclick: () => c.tr.talkAck() }, icon('check'), t('Verstanden'));
      const idle = h('div', { class: 'mpg-talk-idle' }, icon('talk'), h('span', null, t('Von der Regie')), h('small', null, t('keine offene Nachricht')));
      const card = h('div', { class: 'mod-talk', role: 'alert' }, h('div', { class: 'mod-talk-head' }, icon('talk'), h('b', null, t('Von der Regie')), meta), text, ok);
      box.append(idle, card);
      const seen = new Set();
      let init = false, key = null;
      return {
        tick(s) {
          const open = (s.talkback || []).filter(k => k.ackAt == null);
          const k = open.map(x => x.id).join();
          if (k === key) return;
          key = k;
          const fresh = open.some(x => !seen.has(x.id));
          open.forEach(x => seen.add(x.id));
          setData(box, 'open', open.length ? 1 : 0);
          card.hidden = !open.length;
          idle.hidden = Boolean(open.length);
          if (open.length) {
            const last = open[open.length - 1];
            text.replaceChildren(...open.slice(-3).reverse().map(x => h('p', null, x.text)));
            meta.textContent = hm(last.at) + (open.length > 1 ? ' · ' + open.length + ' ' + t('offen') : '');
            if (fresh && init && !c.preview && navigator.vibrate) { try { navigator.vibrate([80, 60, 80]); } catch { /* ignore */ } }
          }
          init = true;
        },
      };
    },
    request(box, m, c) {
      const grid = h('div', { class: 'mod-grid' });
      const input = h('input', { class: 'input', placeholder: t('Freitext an die Regie'), maxlength: 120, enterkeyhint: 'send', 'aria-label': t('Freitext an die Regie') });
      const mine = h('ol', { class: 'mod-mine' });
      let lastSend = 0;
      const send = txt => {
        if (!txt || !txt.trim() || c.preview) return;
        // the server accepts one message per 1.5 s per device – say so instead of losing it
        if (Date.now() - lastSend < 1600) { toast(t('Bitte kurz warten')); return; }
        lastSend = Date.now();
        c.tr.request(txt.trim(), c.me());
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch { /* ignore */ } }
        toast(t('An die Regie gesendet'));
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { send(input.value); input.value = ''; } });
      box.append(h('div', { class: 'mpg-req-head' }, icon('bell'), h('b', null, t('An die Regie'))), grid,
        h('div', { class: 'row mod-free' }, h('div', { style: { flex: '1 1 200px' } }, input),
          h('button', { class: 'btn btn-go', onclick: () => { send(input.value); input.value = ''; } }, t('Senden'))),
        mine);
      let gk = '', mk2 = '';
      return {
        tick(s) {
          const q = (s.stageQuick || []).join('\n');
          if (q !== gk) { gk = q; grid.replaceChildren(...(s.stageQuick || []).map(x => h('button', { class: 'mod-btn', onclick: () => send(x) }, x))); }
          const me = c.me();
          const list = s.requests.filter(r => r.from === me).slice(-4).reverse();
          const k = list.map(r => r.id + r.ack).join() + me + root.ETUI.lang;
          if (k === mk2) return;
          mk2 = k;
          mine.replaceChildren(...(list.length ? list.map(r => h('li', { 'data-ack': r.ack ? 1 : 0 },
            h('span', null, r.text), h('small', null, hm(r.at) + ' · ' + (r.ack ? t('bestätigt') + ' ✓' : t('gesendet'))))) : [h('li', { class: 'muted' }, t('Noch nichts gesendet.'))]));
        },
      };
    },
  };

  function buildMod(host, tr, pg, params, o) {
    const nameKey = pg.builtin ? 'et-from' : 'et-from-' + pg.id;
    let me = store.get(nameKey) || pg.name;
    const conn = h('i', { class: 'mod-dot' });
    const event = h('span', { class: 'mod-event' });
    const who = h('button', { class: 'chip', title: t('Name ändern') });
    who.addEventListener('click', () => {
      if (o.preview) return;
      const field = h('input', { class: 'input', value: me, maxlength: 30, 'aria-label': t('Name ändern') });
      const done = () => { me = field.value.trim() || pg.name; store.set(nameKey, me); field.replaceWith(who); who.textContent = me; };
      field.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
      field.addEventListener('blur', done);
      who.replaceWith(field);
      field.focus();
      field.select();
    });
    const cols = pg.slots.map(() => h('div', { class: 'mpg-col' }));
    const rootEl = h('div', { class: 'mpg' },
      h('header', { class: 'mod-head' }, conn, event, who),
      h('div', { class: 'mpg-cols', 'data-layout': pg.layout }, ...cols));
    host.append(rootEl);
    const c = { page: pg, preview: Boolean(o.preview), tr, me: () => me };
    const mods = [];
    pg.slots.forEach((sl, i) => sl.forEach(m => {
      const box = h('section', { class: 'mpg-card', 'data-type': m.type });
      cols[i].append(box);
      if (MOD[m.type]) mods.push(MOD[m.type](box, m, c));
    }));
    if (!mods.length) cols[0].append(h('p', { class: 'muted' }, t('Diese Seite hat noch keine Module.')));
    const onVis = () => { if (!document.hidden) keepAwake(); };
    if (!o.preview) {
      document.addEventListener('visibilitychange', onVis);
      document.addEventListener('pointerdown', keepAwake);
      keepAwake();
    }
    return {
      tick(s, now) {
        conn.dataset.status = tr.status;
        setText(event, s.event.title || 'Event Timer');
        setText(who, me);
        for (const md of mods) md.tick(s, now);
      },
      destroy() {
        document.removeEventListener('visibilitychange', onVis);
        document.removeEventListener('pointerdown', keepAwake);
      },
    };
  }

  // ============================================================== mount
  /**
   * Mounts a page into `app`. r: { route } | { slug }, params: URLSearchParams.
   * o.page: () => page definition (editor preview), o.preview: no chrome, no wake lock, not clickable.
   * The page follows its definition live: after "Übernehmen" in the Regie every open device rebuilds.
   */
  function mountPage(app, tr, r, o) {
    o = o || {};
    const params = r.params || new URLSearchParams();
    const host = h('div', { class: 'pg-host' + (o.preview ? ' pg-host-preview' : '') });
    if (o.preview) host.inert = true;
    if (o.size) {
      host.style.width = o.size.w + 'px';
      host.style.height = o.size.h + 'px';
      host.style.transform = 'scale(' + o.size.scale + ')';
    }
    const ui = h('div', { class: 'stage-ui', 'data-idle': '1' });
    const offline = h('div', { class: 'stage-offline', hidden: true, role: 'status' }, t('Verbindung unterbrochen – Zeit läuft weiter'));
    if (o.preview) app.replaceChildren(host); else app.replaceChildren(host, ui, offline);
    let key = null, inst = null, kind = '', alive = true, raf = 0, offlineSince = null, idle = null;
    const chrome = !o.preview && params.get('chrome') !== '0';
    function rebuild(pg) {
      if (inst) inst.destroy();
      host.replaceChildren();
      inst = null;
      kind = pg ? pg.kind : '';
      host.classList.toggle('pg-host-mod', kind === 'mod');
      if (!o.preview) {
        document.body.dataset.view = pg && pg.kind === 'mod' ? 'moderation' : 'display';
        document.title = (pg ? pg.name : t('Seite nicht gefunden')) + ' – Event Timer';
        if (pg && pg.kind === 'dsm' && params.get('bg') === 'transparent') {
          document.body.style.background = 'transparent'; document.documentElement.style.background = 'transparent'; document.documentElement.style.colorScheme = 'normal';
        }
        ui.replaceChildren();
        if (pg && pg.kind === 'dsm' && chrome && document.fullscreenEnabled !== false && document.documentElement.requestFullscreen) {
          ui.append(h('button', { class: 'btn btn-icon', 'aria-label': t('Vollbild'), title: t('Vollbild'), onclick: () => {
            if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
          } }, icon('full')));
        }
        if (pg && pg.kind === 'dsm' && tr.mode === 'standalone' && params.get('here') === '1') {
          ui.append(h('button', { class: 'btn', onclick: () => { location.hash = 'control'; } }, icon('back'), t('DSM-Ansicht verlassen')));
        }
      }
      if (!pg) {
        host.append(h('div', { class: 'pg-missing' }, h('b', null, t('Diese Seite gibt es (noch) nicht.')),
          h('span', null, t('Sie erscheint automatisch, sobald sie in der Regie angelegt ist.'))));
        return;
      }
      inst = pg.kind === 'dsm' ? buildDsm(host, tr, pg, params, o) : buildMod(host, tr, pg, params, o);
    }
    const wake = () => {
      ui.dataset.idle = '0';
      clearTimeout(idle);
      idle = setTimeout(() => { ui.dataset.idle = '1'; }, 2500);
      if (kind === 'dsm') keepAwake();
    };
    if (!o.preview) ['pointermove', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, wake));
    const loop = () => {
      if (!alive) return;
      const s = tr.state;
      if (s) {
        const pg = o.page ? o.page() : resolvePage(s, Object.assign({ params }, r));
        const k = pg ? JSON.stringify(pg) + root.ETUI.lang : 'none';
        if (k !== key) { key = k; rebuild(pg); }
        if (inst) inst.tick(s, tr.now());
      }
      if (!o.preview && tr.mode === 'server') {
        if (tr.status !== 'online') offlineSince = offlineSince || Date.now(); else offlineSince = null;
        offline.hidden = !chrome || kind !== 'dsm' || !offlineSince || Date.now() - offlineSince < 2500;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      if (inst) inst.destroy();
      if (!o.preview) ['pointermove', 'pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, wake));
    };
  }

  /** Lower-case address from a name: "Moderation Lea" → "moderation-lea". */
  function slugify(name) {
    const s = String(name || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return s || 'seite';
  }

  root.ETPages = {
    MODULES, LAYOUTS, SLOT_NAMES, KIND_NAMES, builtins, resolvePage, pagePath, standardOf, dsmTargets, dsmPageFor, overlayOf, mountPage, slugify,
  };
})(globalThis);
