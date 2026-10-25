/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/* Control room view. */
(function (root) {
  'use strict';
  const E = root.ETEngine, D = root.ETDisplay, Q = root.ETQR;
  const { h, icon, toast, armed, copy, t } = root.ETUI;

  const MIN = 60000;
  const QUICK_MINUTES = [1, 3, 5, 10, 15, 20, 30, 45, 60];
  const pad = n => String(n).padStart(2, '0');
  const hhmm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  /** "14:32 Uhr" – clock times never read like durations */
  const uhr = hm => t('{hm} Uhr').replace('{hm}', hm);
  const minutesLabel = ms => {
    const m = ms / MIN;
    return Number.isInteger(m) ? String(m) : E.formatMs(ms);
  };
  const store = root.ETTransport.store;

  function mount(app, tr) {
    // sel = the timer being controlled · selScreen = the selected screen ("p…") or group ("g…")
    let sel = store.get('et-sel') || 't1';
    let selScreen = store.get('et-sel-screen') || '';
    let editingItem = null;
    let drawerTab = 'connect';
    let designId = null;
    let viewOnly = false;
    const S = () => tr.state;
    const timer = () => (S() ? S().timers.find(x => x.id === sel) || S().timers[0] : null);
    const act = a => tr.act(a);
    const focused = el => document.activeElement === el;

    // -------------------------------------------------------- skeleton
    /** Small keyboard hint inside a button (hidden on touch devices). */
    const kbd = k => h('kbd', null, k);
    const conn = h('div', { class: 'conn', 'data-status': 'connecting' }, h('i'), h('span'));
    const titleInput = h('input', { class: 'event-title', placeholder: t('Name der Veranstaltung'), maxlength: 80, 'aria-label': t('Name der Veranstaltung') });
    titleInput.addEventListener('change', () => act({ type: 'event.update', title: titleInput.value }));
    const hdrClock = h('div', { class: 'hdr-clock num', 'aria-label': t('Uhrzeit') }, '--:--:--');
    const blackoutBtn = h('button', { class: 'btn btn-stop', 'aria-pressed': 'false', onclick: () => act({ type: 'blackout.toggle' }) }, t('Blackout alle'), kbd('B'));
    const soundSlot = h('span', { class: 'sound-slot' });
    const menuBtn = h('button', { class: 'btn btn-icon', 'aria-label': t('Menü'), title: t('Menü'), onclick: () => openDrawer() }, icon('menu'));
    const topbar = h('header', { class: 'topbar' },
      h('div', { class: 'brand', html: root.ETUI.brandSvg + '<span>Event Timer</span>' }),
      titleInput,
      hdrClock,
      h('div', { class: 'topbar-right' }, soundSlot, conn, blackoutBtn, menuBtn));

    const banner = h('div', { class: 'banner', hidden: true });
    // pinned alert zone: messages from the stage and cues waiting for GO never scroll away
    const alerts = h('div', { class: 'alerts', 'aria-live': 'assertive' });
    const topWrap = h('div', { class: 'top' }, topbar, banner, alerts);
    const mv = h('div', { class: 'mv', role: 'toolbar', 'aria-label': t('Screens') });

    // timer panel
    const nameInput = h('input', { class: 'name-input', maxlength: 40, 'aria-label': t('Name') });
    nameInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { name: nameInput.value } }));
    const kindSeg = h('div', { class: 'seg', role: 'group' });
    const kinds = [['countdown', 'Countdown'], ['countup', 'Hochzählen'], ['clock', 'Zielzeit'], ['time', 'Uhrzeit']];
    kinds.forEach(([k, label]) => kindSeg.appendChild(h('button', {
      'data-kind': k, 'aria-pressed': 'false',
      onclick: () => {
        const tm = timer();
        if (k === 'clock') { if (tm.kind !== 'clock') { kindForced = 'clock'; syncPanel(true); setTimeout(() => targetInput.focus(), 0); } return; }
        kindForced = null;
        act({ type: 'timer.update', id: sel, patch: { kind: k } });
      },
    }, t(label))));
    let kindForced = null;
    const removeBtn = armed(h('button', { class: 'btn btn-quiet btn-icon', title: t('Timer löschen'), 'aria-label': t('Timer löschen') }, icon('trash')),
      () => { act({ type: 'timer.remove', id: sel }); });

    const readTime = h('div', { class: 'readout-time' }, '00:00');
    const readSub = h('span');
    const readEnd = h('small');
    const readState = h('div', { class: 'readout-state' }, h('b'), readSub, readEnd);
    const readBar = h('i');
    const readout = h('div', { class: 'readout' }, readTime, readState, h('div', { class: 'readout-bar' }, readBar));

    const playBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => act({ type: 'timer.toggle', id: sel }) });
    const resetBtn = h('button', { class: 'btn btn-big', onclick: () => act({ type: 'timer.reset', id: sel }) }, icon('reset'), t('Zurücksetzen'), kbd('R'));
    const transport = h('div', { class: 'transport' }, playBtn, resetBtn);
    // While this timer carries the agenda, GO sits in the timer card: "now" and "next" in one place.
    // Start/Pause and Reset shrink to icons next to it.
    const nextGo = h('button', { class: 'btn btn-go btn-big go-next', onclick: () => act({ type: 'agenda.next' }) });
    const iconPlay = h('button', { class: 'btn btn-big btn-square', onclick: () => act({ type: 'timer.toggle', id: sel }) });
    const iconReset = h('button', { class: 'btn btn-big btn-square', title: t('Zurücksetzen') + ' (R)', 'aria-label': t('Zurücksetzen'), onclick: () => act({ type: 'timer.reset', id: sel }) }, icon('reset'));
    const goRow = h('div', { class: 'go-row', hidden: true }, nextGo, iconPlay, iconReset);
    const nextInfo = h('div', { class: 'next-info', hidden: true });
    const nudges = h('div', { class: 'nudges' },
      [[-MIN, '−1:00', '↓'], [-10000, '−0:10', '←'], [10000, '+0:10', '→'], [MIN, '+1:00', '↑'], [5 * MIN, '+5:00', null]].map(([ms, label, key]) =>
        h('button', { class: 'btn', onclick: () => act({ type: 'timer.adjust', id: sel, ms }) }, label, key ? kbd(key) : null)));

    const durInput = h('input', { class: 'input', placeholder: t('Minuten oder mm:ss'), inputmode: 'decimal', 'aria-label': t('Dauer') });
    const setDur = start => {
      const ms = E.parseDuration(durInput.value);
      if (ms == null) { durInput.focus(); durInput.select(); return; }
      act({ type: 'timer.set', id: sel, ms, start });
      durInput.value = '';
    };
    durInput.addEventListener('keydown', e => { if (e.key === 'Enter') setDur(e.shiftKey); });
    const chips = h('div', { class: 'row' }, QUICK_MINUTES.map(m => h('button', {
      class: 'chip num', 'data-ms': m * MIN, onclick: () => act({ type: 'timer.set', id: sel, ms: m * MIN }),
    }, String(m))));
    const durSection = h('div', { class: 'section' },
      h('h3', { class: 'section-title', 'data-dur-title': '' }, t('Dauer')),
      chips,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('div', { style: { flex: '1 1 150px' } }, durInput),
        h('button', { class: 'btn', title: '↵', onclick: () => setDur(false) }, t('Setzen')),
        h('button', { class: 'btn', title: '⇧ ↵', onclick: () => setDur(true) }, icon('play'), t('Setzen & Start'))));

    const targetInput = h('input', { class: 'input num', type: 'time', 'aria-label': t('Zielzeit') });
    const setTarget = () => {
      const v = targetInput.value;
      if (!/^\d{2}:\d{2}$/.test(v)) return;
      const [hh, mm] = v.split(':').map(Number);
      const d = new Date(tr.now());
      d.setHours(hh, mm, 0, 0);
      if (d.getTime() < tr.now() - 60 * 60000) d.setDate(d.getDate() + 1); // 00:30 after 23:00 means tomorrow
      kindForced = null;
      act({ type: 'timer.target', id: sel, at: d.getTime(), label: v });
    };
    targetInput.addEventListener('keydown', e => { if (e.key === 'Enter') setTarget(); });
    const targetSection = h('div', { class: 'section' },
      h('h3', { class: 'section-title' }, t('Zielzeit')),
      h('div', { class: 'row' }, h('div', { style: { flex: '0 1 180px' } }, targetInput), h('button', { class: 'btn btn-go', onclick: setTarget }, t('Zielzeit setzen'))));

    // options (collapsed by default – rarely touched during a show)
    const overtimeToggle = h('input', { type: 'checkbox' });
    overtimeToggle.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { overtime: overtimeToggle.checked } }));
    const warnInput = h('input', { class: 'input num', type: 'number', min: 0, max: 60, step: 0.5 });
    const critInput = h('input', { class: 'input num', type: 'number', min: 0, max: 60, step: 0.5 });
    warnInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { warnMs: Number(warnInput.value) * MIN } }));
    critInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { critMs: Number(critInput.value) * MIN } }));
    const presetSelect = h('select', { class: 'input' });
    presetSelect.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { presetId: presetSelect.value } }));
    const optSummary = h('span', { class: 'opt-summary' });
    const optSection = h('details', { class: 'section opt' },
      h('summary', null, h('span', { class: 'section-title' }, t('Optionen')), optSummary),
      h('div', { class: 'grid2', style: { marginTop: '10px' } },
        h('label', { class: 'field' }, h('span', null, t('Vorwarnung (Min.)')), warnInput),
        h('label', { class: 'field' }, h('span', null, t('Kritisch (Min.)')), critInput),
        h('label', { class: 'field' }, h('span', null, t('Design')), presetSelect)),
      h('label', { class: 'switch', style: { marginTop: '12px' } }, overtimeToggle, t('Überzeit anzeigen')));
    if (store.get('et-opt-open') === '1') optSection.open = true;
    optSection.addEventListener('toggle', () => store.set('et-opt-open', optSection.open ? '1' : '0'));

    // timers are sources: chips to pick the one to control, and where it runs
    const timerChips = h('div', { class: 'timer-chips', role: 'group', 'aria-label': t('Timer') });
    const timerWhere = h('p', { class: 'help timer-where' });

    const timerPanel = h('section', { class: 'panel', 'aria-label': 'Timer' },
      timerChips,
      h('div', { class: 'panel-head' }, nameInput, kindSeg, removeBtn),
      timerWhere,
      readout, nudges, transport, goRow, nextInfo, durSection, targetSection, optSection);

    // agenda panel
    const ros = h('ol', { class: 'ros' });
    const stat = label => h('div', { class: 'stat' }, h('small', null, t(label)), h('b', null, '—'), h('span', { class: 'stat-note' }));
    const statDrift = stat('Abweichung vom Plan');
    const statEnd = stat('Voraussichtliches Ende');
    const statTotal = stat('Gesamtdauer');
    const plannedInput = h('input', { class: 'input num', type: 'time', 'aria-label': t('Planbeginn') });
    plannedInput.addEventListener('change', () => act({ type: 'agenda.settings', plannedStart: plannedInput.value }));
    const rosTimerSelect = h('select', { class: 'input', 'aria-label': t('Verknüpfter Timer') });
    rosTimerSelect.addEventListener('change', () => act({ type: 'agenda.settings', timerId: rosTimerSelect.value }));
    const autoToggle = h('input', { type: 'checkbox' });
    autoToggle.addEventListener('change', () => act({ type: 'agenda.settings', autoStart: autoToggle.checked }));

    const addTitle = h('input', { class: 'input', placeholder: t('Titel'), maxlength: 80 });
    const addSpeaker = h('input', { class: 'input', placeholder: t('Sprecher*in'), maxlength: 80 });
    const addDur = h('input', { class: 'input num', placeholder: '10', inputmode: 'decimal', 'aria-label': t('Dauer') });
    const addFrom = h('input', { class: 'input num', type: 'time', 'aria-label': t('Beginn') });
    const addTo = h('input', { class: 'input num', type: 'time', 'aria-label': t('Ende') });
    const addItem = () => {
      if (!addTitle.value.trim()) { addTitle.focus(); return; }
      act({ type: 'agenda.add', item: { title: addTitle.value, speaker: addSpeaker.value, start: addFrom.value, end: addTo.value, durationMs: E.parseDuration(addDur.value || '10') ?? 10 * MIN } });
      // the next item usually starts where this one ends
      addFrom.value = addTo.value ? addTo.value : '';
      addTitle.value = ''; addSpeaker.value = ''; addDur.value = ''; addTo.value = '';
      addTitle.focus();
    };
    [addTitle, addSpeaker, addDur, addFrom, addTo].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); }));
    const importBox = h('textarea', { class: 'input', rows: 5, placeholder: '13:00-15:00; Workshop A; Anna Schmidt\n15:00-15:30; Kaffeepause\nKeynote; Ben Okafor; 25' });
    const importDetails = h('details', null,
      h('summary', { class: 'btn btn-quiet', style: { display: 'inline-flex' } }, t('Importieren')),
      h('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } },
        h('p', { class: 'help' }, t('Eine Zeile pro Programmpunkt: [Beginn-Ende;] Titel; Sprecher*in; [Minuten]. Auch direkt aus Excel kopierbar.')),
        importBox,
        h('div', { class: 'row' },
          armed(h('button', { class: 'btn' }, t('Importieren')), () => {
            const items = parseImport(importBox.value);
            if (!items.length) return;
            act({ type: 'agenda.replace', items });
            importBox.value = '';
            importDetails.open = false;
          }),
          h('span', { class: 'help' }, t('Ersetzt die bisherige Agenda.')))));

    const modeHelp = h('p', { class: 'help mode-help' }, t('Du schaltest jeden Programmpunkt selbst weiter (Taste G). Der verknüpfte Timer zählt die geplante Dauer herunter.'));

    const prevBtn = h('button', { class: 'btn btn-quiet', title: t('Zurück zum vorigen Programmpunkt'), onclick: () => act({ type: 'agenda.prev' }) }, icon('prev'), t('Zurück'));
    const goBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => act({ type: 'agenda.next' }) });
    // only needed while another timer is selected – otherwise GO is in the timer card
    const rosGo = h('div', { class: 'ros-go' }, goBtn);
    const rosSettings = h('details', { class: 'section ros-settings' },
      h('summary', null, h('span', { class: 'section-title' }, t('Einstellungen')), h('span', { class: 'opt-summary ros-set-summary' })),
      modeHelp,
      h('div', { class: 'row' },
        h('label', { class: 'field', style: { width: '130px' } }, h('span', null, t('Planbeginn')), plannedInput),
        h('label', { class: 'field', style: { width: '180px' } }, h('span', null, t('Verknüpfter Timer')), rosTimerSelect),
        h('span', { class: 'help ros-where' })),
      h('label', { class: 'switch', style: { marginTop: '12px' } }, autoToggle, t('Timer automatisch starten')));
    if (store.get('et-ros-set-open') === '1') rosSettings.open = true;
    rosSettings.addEventListener('toggle', () => store.set('et-ros-set-open', rosSettings.open ? '1' : '0'));
    const rosPanel = h('section', { class: 'panel', 'aria-label': t('Agenda') },
      h('div', { class: 'panel-head' }, h('h2', null, t('Agenda')), h('div', { class: 'spacer' }), prevBtn),
      ros,
      rosGo,
      h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Programmpunkt hinzufügen')),
        h('div', { class: 'ros-add' },
          h('label', { class: 'field ros-add-title' }, h('span', null, t('Titel')), addTitle),
          h('label', { class: 'field ros-add-speaker' }, h('span', null, t('Sprecher*in')), addSpeaker),
          h('label', { class: 'field' }, h('span', null, t('Beginn')), addFrom),
          h('label', { class: 'field' }, h('span', null, t('Ende')), addTo),
          h('label', { class: 'field ros-add-dur' }, h('span', null, t('oder Dauer (Min.)')), addDur),
          h('button', { class: 'btn ros-add-btn', onclick: addItem }, icon('plus'), t('Hinzufügen')))),
      rosSettings,
      h('div', { class: 'section row' },
        importDetails,
        h('button', { class: 'btn btn-quiet', onclick: () => copy(exportText()) }, t('Als Text exportieren')),
        armed(h('button', { class: 'btn btn-quiet' }, t('Agenda zurücksetzen')), () => act({ type: 'agenda.reset' }))));

    // ------------------------------------------- timeline (plan against actual)
    // Full width above the desk; folds to one line with the time account, hidden without an agenda.
    let tlOpen = store.get('et-tl-open') !== '0';
    const tlLanes = h('div', { class: 'tl-lanes' });
    const tlFold = h('button', { class: 'tl-fold', 'aria-expanded': String(tlOpen), title: t('Zeitleiste auf- oder zuklappen') + ' (T)', onclick: () => setTlOpen(!tlOpen) },
      h('span', { class: 'tl-chev', 'aria-hidden': 'true' }, '▾'), t('Zeitleiste'), h('span', { class: 'tl-sub' }, t('Plan gegen Ist')), kbd('T'));
    const tlPanel = h('section', { class: 'panel tl', 'aria-label': t('Zeitleiste') },
      h('div', { class: 'tl-head' }, tlFold, h('div', { class: 'ros-summary' }, statDrift, statEnd, statTotal)),
      tlLanes);
    function setTlOpen(v) {
      tlOpen = v;
      store.set('et-tl-open', v ? '1' : '0');
      tlKey = '';
      tickTimeline(S(), tr.now());
    }
    /** planned and actual/forecast span per programme item (epoch ms) */
    function timeline(s, now) {
      const a = s.agenda, rv = E.runView(s, now), n = a.items.length;
      // without planned times the plan starts where the show started (or now)
      const anchor = a.items[0] && a.items[0].startedAt != null ? a.items[0].startedAt : now;
      let pe = anchor;
      const plan = rv.rows.map(r => {
        const x = r.start != null ? { s: r.start, e: r.end } : { s: pe, e: pe + r.item.durationMs };
        pe = x.e;
        return x;
      });
      let c = null;
      const ist = a.items.map((it, i) => {
        if (i < a.cursor || rv.finished) {
          const s0 = it.startedAt != null ? it.startedAt : (c != null ? c : now);
          const e0 = it.endedAt != null ? it.endedAt : s0 + it.durationMs;
          c = e0;
          return { s: s0, e: e0, k: 'done' };
        }
        if (i === a.cursor) {
          const s0 = it.startedAt != null ? it.startedAt : now;
          const rem = rv.remainingMs == null ? it.durationMs : rv.remainingMs;
          c = now + Math.max(0, rem);
          return { s: s0, e: c, k: rem < 0 ? 'over' : 'live' };
        }
        const s0 = Math.max(c != null ? c : now, now);
        c = s0 + it.durationMs;
        return { s: s0, e: c, k: i === a.cursor + 1 ? 'next' : 'todo' };
      });
      return { plan, ist, planEnd: n ? plan[n - 1].e : now, istEnd: n ? ist[n - 1].e : now };
    }
    let tlKey = '';
    let tlAt = 0;
    function tickTimeline(s, now) {
      const items = s.agenda.items;
      tlPanel.hidden = !items.length;
      tlPanel.dataset.open = tlOpen ? '1' : '0';
      tlFold.setAttribute('aria-expanded', String(tlOpen));
      if (!items.length || !tlOpen) { tlKey = ''; return; }
      if (now - tlAt < 500 && tlKey) return;
      tlAt = now;
      const tl = timeline(s, now);
      const t0 = Math.min(tl.plan[0].s, tl.ist[0].s, now);
      const t1 = Math.max(tl.planEnd, tl.istEnd, now) + 5 * MIN;
      const span = t1 - t0;
      const key = JSON.stringify([Math.round(now / 5000), s.agenda.cursor, items.map(x => [x.title, x.durationMs]), tl.plan, tl.ist.map(x => [Math.round(x.s / 5000), Math.round(x.e / 5000), x.k]), root.ETUI.lang]);
      if (key === tlKey) return;
      tlKey = key;
      const x = v => ((v - t0) / span * 100).toFixed(2) + '%';
      const w = (a, b) => (Math.max(0, b - a) / span * 100).toFixed(2) + '%';
      const blk = (it, r, cls) => h('div', { class: 'tl-blk ' + cls, style: { left: x(r.s), width: w(r.s, r.e) }, title: it.title + ' · ' + hhmm(r.s) + '–' + hhmm(r.e) }, it.title || '—');
      const step = span <= 3 * 60 * MIN ? 15 * MIN : span <= 6 * 60 * MIN ? 30 * MIN : 60 * MIN;
      const ticks = [];
      for (let v = Math.ceil(t0 / step) * step; v <= t1; v += step) ticks.push(h('span', { style: { left: x(v) } }, hhmm(v)));
      tlLanes.replaceChildren(
        h('div', { class: 'tl-lane' }, h('span', { class: 'tl-tag' }, t('Plan')), ...items.map((it, i) => blk(it, tl.plan[i], 'tl-plan'))),
        h('div', { class: 'tl-lane' }, h('span', { class: 'tl-tag' }, t('Ist und Prognose')), ...items.map((it, i) => blk(it, tl.ist[i], 'tl-' + tl.ist[i].k))),
        h('div', { class: 'tl-planend', style: { left: x(tl.planEnd) }, title: t('Geplantes Ende') }),
        h('div', { class: 'tl-now', style: { left: x(now) } }, h('span', null, t('jetzt') + ' ' + uhr(hhmm(now)))),
        h('div', { class: 'tl-axis' }, ...ticks));
    }

    // ------------------------------------------------------- cue bar
    const cueList = h('ol', { class: 'cue-list' });
    const cueCount = h('span', { class: 'help' });
    const cuePanel = h('section', { class: 'panel cue-panel', 'aria-label': t('Cues') },
      h('div', { class: 'panel-head' }, h('h2', null, t('Cues')), cueCount, h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet', onclick: () => openUrl(tr.mode === 'standalone' ? viewUrl('cues') : baseUrl() + '/cues') }, icon('open'), t('Cue-Liste'))),
      cueList);
    const goCue = c => act({ type: 'cue.done', itemId: c.item.id, cueId: c.cue.id });
    const cuePillText = c => (c.status === 'go' ? t('jetzt') : c.status === 'ready' ? t('Auf Abruf') : c.inMs != null ? E.formatMs(c.inMs) : t('wartet'));
    function cueWhen(c) {
      const m = minutesLabel(Math.abs(c.offsetMs));
      if (c.ref === 'end') return c.offsetMs < 0 ? m + ' ' + t('Min. vor Ende') : t('bei Ende');
      return c.offsetMs < 0 ? m + ' ' + t('Min. vor Start') : c.offsetMs > 0 ? m + ' ' + t('Min. nach Start') : t('bei Start');
    }
    let cueSig = '';
    let cueShown = [];
    let goCues = [];
    function tickCues(s, now) {
      const all = E.cueView(s, now);
      goCues = all.filter(c => c.status === 'go');
      // fixed place in the desk; calm – cues are fired by other operators
      if (!all.length) {
        cueShown = [];
        if (cueSig !== 'empty' + root.ETUI.lang) {
          cueSig = 'empty' + root.ETUI.lang;
          cueList.replaceChildren(h('li', { class: 'cue-empty' }, t('Keine Cues in der Agenda. Cues legst du über den Stift am Programmpunkt an.')));
          cueCount.textContent = '';
        }
      } else {
        const active = all.filter(c => c.status === 'go' || c.status === 'standby' || c.status === 'ready');
        const later = all.filter(c => c.status === 'later').slice(0, Math.max(0, 5 - active.length));
        cueShown = active.concat(later);
        const sig = cueShown.map(c => c.cue.id + c.status + c.cue.text + c.cue.offsetMs + c.cue.ref).join('|') + root.ETUI.lang;
        if (sig !== cueSig) {
          cueSig = sig;
          const rows = cueShown.map((c, i) => h('li', { class: 'cue-row', 'data-status': c.status, 'data-cue': c.cue.id },
            h('span', { class: 'cue-pill num' }),
            h('span', { class: 'cue-what' }, h('b', null, c.cue.text), h('span', null, c.item.title), h('small', null, cueWhen(c.cue))),
            h('button', { class: 'btn', onclick: () => goCue(c) }, 'GO', i === 0 ? kbd('C') : null)));
          cueList.replaceChildren(...(rows.length ? rows : [h('li', { class: 'cue-empty' }, t('Keine offenen Cues'))]));
        }
        const open = all.filter(c => c.status !== 'done' && c.status !== 'missed').length;
        const ct = open + ' ' + t('offen');
        if (cueCount.textContent !== ct) cueCount.textContent = ct;
        cueShown.forEach(c => {
          const pill = cueList.querySelector(`[data-cue="${c.cue.id}"] .cue-pill`);
          if (!pill) return;
          const txt = cuePillText(c);
          if (pill.textContent !== txt) pill.textContent = txt;
        });
      }
    }

    // ------------------------------------------------- Einblendung → Screens (overlay on display screens)
    // Separate from "Talkback → Moderation" on purpose: no switch that could point the wrong way during a show.
    const P = () => root.ETPages;
    // "all" = every display screen · "sel" = the selected screen or group (from the tiles above)
    let dsmTo = store.get('et-dsm-to') === 'sel' ? 'sel' : 'all';
    const dsmChips = h('div', { class: 'row dsm-to', role: 'group', 'aria-label': t('Ziel') });
    const dsmInput = h('input', { class: 'input', placeholder: t('Text für die Einblendung'), maxlength: 280, 'aria-label': t('Text für die Einblendung') });
    const dsmQuick = h('div', { class: 'row', style: { marginTop: '10px' } });
    const dsmNow = h('div', { class: 'dsm-now' });
    /** display screens in the current selection */
    const selShowIds = () => selectedScreens().filter(x => x.kind === 'show').map(x => x.id);
    /** screen ids a send goes to: the selection or all display screens (the fixed /plan included) */
    function dsmSendIds() {
      const sel2 = selShowIds();
      return dsmTo === 'sel' && sel2.length ? sel2 : P().dsmTargets(S(), true).map(x => x.id);
    }
    const sendDsm = text => { if (text && text.trim()) act({ type: 'dsm.message', pages: dsmSendIds(), text }); };
    dsmInput.addEventListener('keydown', e => { if (e.key === 'Enter') { sendDsm(dsmInput.value); dsmInput.value = ''; } });
    const dsmPanel = h('section', { class: 'panel dsm-panel', 'aria-label': t('Einblendung') },
      h('div', { class: 'panel-head' }, icon('screen'), h('h2', null, t('Einblendung')), h('span', { class: 'help' }, t('→ Screens · öffentlich, bleibt bis „Ausblenden“'))),
      dsmChips, dsmNow,
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { style: { flex: '1 1 200px' } }, dsmInput),
        h('button', { class: 'btn btn-dsm', onclick: () => { sendDsm(dsmInput.value); dsmInput.value = ''; } }, t('Senden'))),
      dsmQuick);
    function syncDsm(s) {
      const targets = P().dsmTargets(s, false);
      const all = P().dsmTargets(s, true);
      const selIds = selShowIds();
      const g = selScreen && selScreen[0] === 'g' ? s.groups.find(x => x.id === selScreen) : null;
      const selName = g ? t('Gruppe') + ' ' + g.name : selIds.length ? P().screenLabel(s.screens.find(x => x.id === selIds[0])) : '';
      const ck = JSON.stringify([targets.length, selName, dsmTo, root.ETUI.lang]);
      if (dsmChips.dataset.key !== ck) {
        dsmChips.dataset.key = ck;
        const chip = (id, label) => h('button', { class: 'chip', 'aria-pressed': String(dsmTo === id || (id === 'all' && !selName)), onclick: () => { dsmTo = id; store.set('et-dsm-to', id); syncDsm(S()); } }, label);
        dsmChips.replaceChildren(h('span', { class: 'help' }, t('An') + ':'), chip('all', t('Alle Screens')),
          selName && targets.length > 1 ? chip('sel', selName) : h('span', { class: 'help' }, selName ? '' : t('oder oben einen Screen auswählen')));
      }
      const qk = s.quickMessages.join('\n');
      if (dsmQuick.dataset.key !== qk) {
        dsmQuick.dataset.key = qk;
        dsmQuick.replaceChildren(...s.quickMessages.map(q => h('button', { class: 'chip', onclick: () => sendDsm(q) }, q)));
      }
      // what is on the DSMs right now – identical overlays (sent to "Alle") are one line
      const groups = [];
      for (const x of all) {
        const m = s.dsmMsg[x.id];
        if (!m || !m.text) continue;
        const g = groups.find(y => y.text === m.text && y.flash === m.flash && y.visible === m.visible);
        if (g) g.ids.push(x.id); else groups.push({ text: m.text, flash: m.flash, visible: m.visible, ids: [x.id] });
      }
      const nk = JSON.stringify([groups, targets.map(x => x.id), root.ETUI.lang]);
      if (dsmNow.dataset.key === nk) return;
      dsmNow.dataset.key = nk;
      const visibleIds = targets.map(x => x.id);
      const label = ids => {
        if (visibleIds.length > 1 && visibleIds.every(id => ids.includes(id))) return t('Alle Screens');
        const grp = s.groups.find(gr => { const m = s.screens.filter(x => x.group === gr.id && x.kind === 'show').map(x => x.id); return m.length > 1 && m.length === ids.length && m.every(id => ids.includes(id)); });
        if (grp) return t('Gruppe') + ' ' + grp.name;
        return ids.map(id => (all.find(x => x.id === id) || { name: id }).name).join(', ');
      };
      dsmNow.replaceChildren(...(groups.length ? groups.map(g => {
        const state = g.visible ? 'live' : 'hidden';
        return h('div', { class: 'msg-card', 'data-state': state, 'data-flash': g.flash && g.visible ? '1' : '0' },
          h('div', { class: 'msg-card-head' },
            h('span', { class: 'badge' }, g.visible ? t('LIVE') : t('Ausgeblendet')),
            targets.length > 1 || g.ids.some(id => !visibleIds.includes(id)) ? h('span', { class: 'help' }, label(g.ids)) : null,
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn', 'aria-pressed': String(g.flash), onclick: () => act({ type: 'dsm.message', pages: g.ids, flash: !g.flash }) }, t('Blinken')),
            h('button', { class: 'btn', onclick: () => act({ type: 'dsm.message', pages: g.ids, visible: !g.visible }) }, g.visible ? t('Ausblenden') : t('Einblenden')),
            h('button', { class: 'btn btn-quiet', onclick: () => act({ type: 'dsm.clear', pages: g.ids }) }, icon('trash'), t('Löschen'))),
          h('div', { class: 'msg-card-text' }, g.text));
      }) : [h('div', { class: 'msg-card', 'data-state': 'empty' }, h('div', { class: 'msg-card-head' }, h('span', { class: 'badge' }, t('Keine Einblendung aktiv'))))]));
    }

    // ------------------------------------------------- talkback (Regie → Moderation)
    const talkInput = h('input', { class: 'input', placeholder: t('Freitext an die Moderation'), maxlength: 120, 'aria-label': t('Freitext an die Moderation') });
    const sendTalk = text => { if (text && text.trim()) act({ type: 'talkback.send', text: text.trim() }); };
    talkInput.addEventListener('keydown', e => { if (e.key === 'Enter') { sendTalk(talkInput.value); talkInput.value = ''; } });
    const talkQuickRow = h('div', { class: 'row' });
    const talkLog = h('ol', { class: 'talk-log' });
    const talkClear = armed(h('button', { class: 'btn btn-quiet' }, t('Verlauf löschen')), () => act({ type: 'talkback.clear' }));
    const talkPanel = h('section', { class: 'panel talk-panel', 'aria-label': t('Talkback') },
      h('div', { class: 'panel-head' }, icon('talk'), h('h2', null, t('Talkback')), h('span', { class: 'help' }, t('→ Moderation · privat, mit „Verstanden“')), h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet', onclick: () => openUrl(tr.mode === 'standalone' ? viewUrl('moderation') : baseUrl() + '/moderation') }, icon('open'), '/moderation')),
      talkQuickRow,
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { style: { flex: '1 1 200px' } }, talkInput),
        h('button', { class: 'btn btn-talk', onclick: () => { sendTalk(talkInput.value); talkInput.value = ''; } }, t('Senden'))),
      talkLog,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, talkClear));
    const seenAck = new Set();
    let talkInit = false;
    function syncTalk(s) {
      const qk = (s.talkQuick || []).join('\n');
      if (talkQuickRow.dataset.key !== qk) {
        talkQuickRow.dataset.key = qk;
        talkQuickRow.replaceChildren(...(s.talkQuick || []).map(q => h('button', { class: 'chip', onclick: () => sendTalk(q) }, q)));
      }
      const acked = (s.talkback || []).filter(k => k.ackAt != null);
      const freshAck = acked.some(k => !seenAck.has(k.id));
      acked.forEach(k => seenAck.add(k.id));
      if (talkInit && freshAck && ackSoundOn()) signal('ack');
      talkInit = true;
      const list = (s.talkback || []).slice(-5).reverse();
      const key = list.map(k => k.id + ':' + k.ackAt).join() + root.ETUI.lang;
      if (talkLog.dataset.key !== key) {
        talkLog.dataset.key = key;
        talkLog.replaceChildren(...list.map(k => h('li', { 'data-ack': k.ackAt != null ? 1 : 0 },
          h('span', null, k.text),
          h('small', null, hhmm(k.at) + ' · ' + (k.ackAt != null ? t('verstanden') + ' ✓ ' + hhmm(k.ackAt) : t('gesendet'))))));
      }
      talkClear.hidden = !(s.talkback || []).length;
    }

    // ------------------------------------------- messages from the stage
    const seenReq = new Set();
    let reqInit = false;
    // ---------------------------------------------------------- sound
    // A hard-edged intercom call (square wave) cuts through programme audio
    // far better than a soft sine beep.
    let actx = null;
    const soundOn = () => store.get('et-req-sound') !== '0';
    const remindOn = () => store.get('et-req-remind') !== '0';
    const ackSoundOn = () => store.get('et-ack-sound') === '1';
    const VOLUMES = { normal: 0.3, laut: 0.6, max: 1 };
    const volume = () => VOLUMES[store.get('et-req-vol')] || VOLUMES.laut;
    let lastSignal = 0;
    const unlockAudio = () => {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
      } catch { /* no audio */ }
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
    const audioReady = () => Boolean(actx && actx.state === 'running');
    function tone(at, freq, dur, vol, type) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
      g.gain.setValueAtTime(vol, at + dur - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(actx.destination);
      o.start(at);
      o.stop(at + dur + 0.02);
    }
    /** alert: 3× "di-da" (~1.2 s) · remind: 1× "di-da" · ack: soft rising chime · test: like alert */
    function signal(kind) {
      if (!audioReady()) return;
      try {
        const v = volume();
        const t0 = actx.currentTime + 0.02;
        if (kind === 'ack') { tone(t0, 660, 0.1, v * 0.5, 'sine'); tone(t0 + 0.11, 990, 0.16, v * 0.5, 'sine'); return; }
        const reps = kind === 'remind' ? 1 : 3;
        for (let i = 0; i < reps; i++) {
          tone(t0 + i * 0.4, 988, 0.14, v * 0.55);
          tone(t0 + i * 0.4 + 0.17, 1319, 0.14, v * 0.55);
        }
      } catch { /* no audio */ }
    }
    /** play on a click: the click itself unlocks audio, so wait for it */
    const testSound = kind => { unlockAudio(); if (actx) actx.resume().then(() => signal(kind)).catch(() => {}); };
    const soundHint = h('button', { class: 'sound-hint', hidden: true, title: t('Browser spielen erst nach einem Klick Ton ab.'), onclick: unlockAudio }, '🔇', h('span', { class: 'sound-hint-l' }, ' ' + t('Ton aus – klicken')));
    soundSlot.append(soundHint);
    /** reminder every 15 s while a stage message is unacknowledged; hint when the browser keeps us muted */
    function tickSound(s) {
      const hint = !soundOn() || audioReady();
      if (soundHint.hidden !== hint) soundHint.hidden = hint;
      if (!soundOn() || !remindOn() || !s.requests.some(r => !r.ack)) return;
      if (Date.now() - lastSignal >= 15000) { lastSignal = Date.now(); signal('remind'); }
    }
    /** Alert zone: open messages from the stage (cues have their own calm panel). */
    function syncAlerts(s) {
      const open = s.requests.filter(r => !r.ack);
      const key = open.map(r => r.id).join() + root.ETUI.lang;
      if (alerts.dataset.key !== key) {
        alerts.dataset.key = key;
        const items = open.slice(-4).reverse().map(r => h('div', { class: 'alert alert-req', role: 'alert' }, icon('bell'),
          h('div', { class: 'alert-text' }, h('b', null, r.text), h('span', null, t('Von Moderation') + (r.from && r.from !== t('Moderation') && r.from !== 'Moderation' ? ' · ' + r.from : '') + ' · ' + hhmm(r.at))),
          h('button', { class: 'btn', onclick: () => act({ type: 'request.ack', requestId: r.id }) }, icon('check'), t('Bestätigen'))));
        if (open.length > 1) items.push(h('button', { class: 'btn btn-quiet alert-all', onclick: () => act({ type: 'request.ackAll' }) }, t('Alle bestätigen')));
        alerts.replaceChildren(...items);
      }
      const fresh = open.filter(r => !seenReq.has(r.id));
      open.forEach(r => seenReq.add(r.id));
      if (reqInit && fresh.length && soundOn()) { lastSignal = Date.now(); signal('alert'); }
      reqInit = true;
      const n = open.length;
      const title = (n ? `(${n}) ` : '') + 'Event Timer – ' + t('Regie');
      if (document.title !== title) document.title = title;
    }

    // columns: 1 (phone/tablet) · 2 (laptop) · 3 (≥ 1600 px)
    // 3 columns = cockpit: agenda left, timer in the middle, the control side right (screens, talkback, overlay, cues)
    const cols = [h('div', { class: 'col' }), h('div', { class: 'col' }), h('div', { class: 'col col-side' })];
    const desk = h('main', { class: 'desk' }, ...cols);
    const mq3 = window.matchMedia('(min-width: 1600px)');
    const mq2 = window.matchMedia('(min-width: 1100px)');
    let deskCols = 0;
    function layoutDesk() {
      const n = mq3.matches ? 3 : mq2.matches ? 2 : 1;
      desk.dataset.cols = n;
      if (n === 3) { cols[0].append(rosPanel); cols[1].append(timerPanel); cols[2].append(mv, talkPanel, dsmPanel, cuePanel); }
      else {
        desk.before(mv);
        if (n === 2) { cols[0].append(timerPanel, rosPanel); cols[1].append(talkPanel, dsmPanel, cuePanel); }
        else cols[0].append(timerPanel, talkPanel, dsmPanel, cuePanel, rosPanel);
      }
      cols.forEach((c, i) => { c.hidden = i >= n; });
      mv.dataset.side = n === 3 ? '1' : '0';
      // the tiles are drawn for one height: small in the side column, large in the row above
      if (deskCols && deskCols !== n && S()) { tileKey = ''; buildTiles(); }
      deskCols = n;
    }
    mq3.addEventListener('change', layoutDesk);
    mq2.addEventListener('change', layoutDesk);

    // gate (PIN)
    const pinInput = h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('PIN eingeben') });
    const pinError = h('div', { class: 'gate-error', role: 'alert' });
    const gate = h('div', { class: 'gate', hidden: true },
      h('form', { onsubmit: e => { e.preventDefault(); pinError.textContent = ''; tr.auth(pinInput.value); } },
        h('h2', null, t('Regie gesperrt')),
        h('label', { class: 'field' }, h('span', null, t('PIN eingeben')), pinInput),
        pinError,
        h('button', { class: 'btn btn-go', type: 'submit' }, t('Entsperren')),
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { viewOnly = true; sync(); } }, t('Nur ansehen'))));
    tr.onAuth(ok => { if (!ok) { pinError.textContent = t('Falsche PIN'); pinInput.select(); } else { viewOnly = false; pinInput.value = ''; } });

    // drawer
    const drawerBody = h('div', { class: 'drawer-body' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const drawer = h('dialog', { class: 'drawer', 'aria-label': t('Menü') },
      h('div', { class: 'drawer-head' }, h('h2', null, t('Menü')),
        h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Schließen'), onclick: () => drawer.close() }, icon('close'))),
      tabs, drawerBody);
    drawer.addEventListener('click', e => { if (e.target === drawer) drawer.close(); });

    app.replaceChildren(topWrap, tlPanel, mv, desk, gate, drawer);
    layoutDesk();

    // ------------------------------------------------------- helpers
    function baseUrl() {
      if (tr.mode === 'standalone') return location.href.split('#')[0];
      const m = tr.meta;
      const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
      if (!local || !m || !m.addresses || !m.addresses.length) return location.origin;
      return `${location.protocol}//${m.addresses[0]}:${m.port}`;
    }
    function viewUrl(view, params) {
      const q = new URLSearchParams(params || {}).toString();
      if (tr.mode === 'standalone') return baseUrl() + '#' + view + (q ? '?' + q : '');
      return baseUrl() + '/' + view + (q ? '?' + q : '');
    }
    /** address number of the selected screen (or the first one) */
    function curNum() { const sc = selectedScreens()[0] || P().byNum(S())[0]; return sc ? sc.num : 1; }
    function displayUrl(id, extra) {
      const n = id.slice(1);
      if (tr.mode === 'standalone' || extra) return viewUrl('display', Object.assign({ t: n }, extra || {}));
      return baseUrl() + '/' + n;
    }
    /** "http://event-timer.local" (+ ":2468" unless port 80 is on), or null without mDNS. */
    function shortBase() {
      const m = tr.meta || {};
      if (tr.mode !== 'server' || !m.mdns || !m.nameHost) return null;
      return 'http://' + m.nameHost + (m.port80 ? '' : ':' + m.port);
    }
    function openUrl(url) {
      const w = tr.mode === 'standalone' ? tr.openWindow(url) : window.open(url, '_blank');
      if (!w) toast(t('Neues Fenster wurde blockiert – nutze „DSM hier öffnen“.'));
    }

    function parseImport(text) {
      return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const parts = line.split(/\t|;|\|/).map(x => x.trim());
        // optional leading "13:00-15:00" or "13:00"
        let start = '', end = '';
        const tm = /^([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*(?:-|–|bis)\s*([01]?\d|2[0-3])[:.]([0-5]\d))?(?:\s+(.*))?$/.exec(parts[0] || '');
        if (tm) {
          start = tm[1].padStart(2, '0') + ':' + tm[2];
          if (tm[3]) end = tm[3].padStart(2, '0') + ':' + tm[4];
          if (tm[5]) parts[0] = tm[5]; else parts.shift();
        }
        let [title, speaker, dur] = parts;
        if (parts.length === 2 && E.parseDuration(parts[1]) != null) { dur = parts[1]; speaker = ''; }
        const ms = E.parseDuration(dur || '');
        return { title: title || '—', speaker: speaker || '', start, end, durationMs: ms == null ? 10 * MIN : ms };
      }).filter(x => x.title).slice(0, 200);
    }
    function exportText() {
      return S().agenda.items.map(it => {
        const when = it.start ? (it.end ? it.start + '-' + it.end : it.start) : '';
        return [when, it.title, it.speaker, it.end ? '' : minutesLabel(it.durationMs)].filter((x, i) => i !== 0 || x).join('; ');
      }).join('\n');
    }

    function stateLabel(v) {
      return { running: t('Läuft'), paused: t('Pausiert'), idle: t('Bereit'), finished: t('Abgelaufen') }[v.state] || '';
    }

    // ---------------------------------------------------- multiviewer
    // The tiles are the screens (outputs), drawn by the real page renderer – what you see is what each device shows.
    let tileKey = '';
    const tileViews = new Map();
    const TILE = { show: [1280, 720], mod: [1180, 820] };
    const tileH = () => (deskCols === 3 ? 70 : 124);
    function buildTiles() {
      const s = S();
      const key = JSON.stringify([s.screens.map(x => [x.id, x.num, x.name, x.kind, x.group]), s.groups.map(g => [g.id, g.name]), selScreen, root.ETUI.lang, tileH()]);
      if (key === tileKey) return;
      tileKey = key;
      for (const tv of tileViews.values()) tv.cleanup();
      tileViews.clear();
      mv.replaceChildren();
      const tile = sc => {
        const [w, hgt] = TILE[sc.kind];
        const th = tileH();
        const scale = th / hgt;
        const stage = h('div', { class: 'tile-stage', style: { width: Math.round(w * scale) + 'px', height: th + 'px' } });
        const badge = h('span', { class: 'tile-badge', hidden: true });
        const btn = h('button', { class: 'tile', 'data-kind': sc.kind, 'aria-pressed': String(selScreen === sc.id), 'aria-label': P().screenLabel(sc), onclick: () => selectScreen(sc.id) },
          stage, h('span', { class: 'tile-label' }, h('b', null, String(sc.num)), ' ', sc.name), badge);
        const cleanup = P().mountPage(stage, tr, { num: sc.num }, { preview: true, size: { w, h: hgt, scale } });
        tileViews.set(sc.id, { tile: btn, badge, cleanup });
        return btn;
      };
      const screens = P().byNum(s);
      const done = new Set();
      for (const sc of screens) {
        if (done.has(sc.id)) continue;
        const g = sc.group && s.groups.find(x => x.id === sc.group);
        if (!g) { mv.appendChild(tile(sc)); done.add(sc.id); continue; }
        const members = screens.filter(x => x.group === g.id);
        members.forEach(x => done.add(x.id));
        mv.appendChild(h('div', { class: 'mv-group', 'aria-pressed': String(selScreen === g.id) },
          h('button', { class: 'mv-group-label', onclick: () => selectScreen(g.id), title: t('Ganze Gruppe auswählen') }, icon('copy'), t('Gruppe') + ' ' + g.name),
          h('div', { class: 'mv-group-tiles' }, ...members.map(tile))));
      }
      if (s.screens.length < E.MAX_SCREENS) {
        mv.appendChild(h('button', { class: 'tile-add', onclick: () => root.ETPageEditor.open(pageCtx, { pick: true }) }, icon('plus'), t('Screen hinzufügen')));
      }
    }
    /** screen ids behind the selection (a group → its members) */
    function selectedScreens() {
      const s = S();
      if (!selScreen) return [];
      if (selScreen[0] === 'g') return s.screens.filter(x => x.group === selScreen);
      const sc = s.screens.find(x => x.id === selScreen);
      return sc ? [sc] : [];
    }
    function selectScreen(id) {
      selScreen = id;
      store.set('et-sel-screen', id);
      // control the timer the selection shows
      const first = selectedScreens()[0];
      const tms = first ? P().timersOf(S(), first) : [];
      if (tms.length && S().timers.some(x => x.id === tms[0])) { sel = tms[0]; store.set('et-sel', sel); kindForced = null; }
      tileKey = '';
      sync();
    }
    function selectTimer(id) {
      sel = id;
      store.set('et-sel', id);
      kindForced = null;
      sync();
    }
    const select = selectTimer;

    // --------------------------------------------------- agenda list
    let rosKey = '';
    function buildAgenda() {
      const s = S(), a = s.agenda;
      const rv = E.runView(s, tr.now());
      const key = JSON.stringify([a.items, a.cursor, a.plannedStart, rv.rows.map(r => [r.start, r.end]), editingItem, t('Titel')]);
      if (key === rosKey) return;
      rosKey = key;
      ros.replaceChildren();
      if (!a.items.length) {
        ros.appendChild(h('li', { class: 'ros-empty' }, t('Noch keine Agenda. Füge den ersten Programmpunkt hinzu oder importiere eine Liste.')));
        return;
      }
      a.items.forEach((it, i) => {
        const row = rv.rows[i];
        const status = row.status;
        const when = row.start != null ? hhmm(row.start) : String(i + 1);
        if (editingItem === it.id) { ros.appendChild(editRow(it)); return; }
        let sub = null;
        if (status === 'done' && it.startedAt != null && it.endedAt != null) {
          const delta = (it.endedAt - it.startedAt) - it.durationMs;
          sub = h('small', { 'data-tone': delta > 30000 ? 'behind' : delta < -30000 ? 'ahead' : '' }, (delta >= 0 ? '+' : '−') + E.formatMs(Math.abs(delta)));
        } else if (status === 'live') sub = h('small', { 'data-live': it.id }, t('läuft'));
        else if (status === 'next') sub = h('small', null, t('als Nächstes'));
        ros.appendChild(h('li', { class: 'ros-row', 'data-status': status, 'data-item': it.id, title: t('Klicken zum Bearbeiten'),
          onclick: e => { if (e.target.closest('button')) return; editingItem = it.id; buildAgenda(); } },
          h('span', { class: 'ros-when' }, when),
          h('span', { class: 'ros-what' }, h('b', null, it.title || '—'), it.speaker ? h('span', null, it.speaker) : null,
            it.note ? h('span', { class: 'ros-note', title: it.note }, t('Hinweis') + ': ' + it.note) : null,
            it.cues && it.cues.length ? h('span', { class: 'ros-cues' }, it.cues.length + ' ' + t(it.cues.length === 1 ? 'Cue' : 'Cues')) : null),
          h('span', { class: 'ros-dur' }, E.formatMs(it.durationMs), sub),
          h('span', { class: 'ros-actions' },
            h('button', { class: 'btn btn-quiet', title: t('Laden'), 'aria-label': t('Laden') + ': ' + it.title, onclick: () => act({ type: 'agenda.go', index: i }) }, icon('go')),
            h('button', { class: 'btn btn-quiet', title: t('Hoch'), 'aria-label': t('Hoch'), disabled: i === 0, onclick: () => act({ type: 'agenda.move', itemId: it.id, to: i - 1 }) }, icon('up')),
            h('button', { class: 'btn btn-quiet', title: t('Runter'), 'aria-label': t('Runter'), disabled: i === a.items.length - 1, onclick: () => act({ type: 'agenda.move', itemId: it.id, to: i + 1 }) }, icon('down')),
            h('button', { class: 'btn btn-quiet', title: t('Bearbeiten'), 'aria-label': t('Bearbeiten'), onclick: () => { editingItem = it.id; buildAgenda(); } }, icon('edit')))));
      });
    }

    // typed but unsaved values survive list re-renders (e.g. while adding cues)
    let editDraft = null;
    const WHEN = [['start0', 'bei Start'], ['startB', 'vor Start'], ['startA', 'nach Start'], ['endB', 'vor Ende'], ['end0', 'bei Ende']];
    function cueEditRow(it, c) {
      const mode = c.ref === 'end' ? (c.offsetMs < 0 ? 'endB' : 'end0') : c.offsetMs < 0 ? 'startB' : c.offsetMs > 0 ? 'startA' : 'start0';
      const tx = h('input', { class: 'input', value: c.text, maxlength: 80, 'aria-label': t('Cue') });
      tx.addEventListener('change', () => act({ type: 'cue.update', itemId: it.id, cueId: c.id, patch: { text: tx.value } }));
      const sel = h('select', { class: 'input', 'aria-label': t('Wann') }, WHEN.map(([v, l]) => h('option', { value: v }, t(l))));
      sel.value = mode;
      const mi = h('input', { class: 'input num', value: minutesLabel(Math.abs(c.offsetMs)), inputmode: 'decimal', 'aria-label': t('Minuten') });
      mi.hidden = mode === 'start0' || mode === 'end0';
      const push = () => {
        const v = sel.value;
        const ms = E.parseDuration(mi.value) || 0;
        const sign = v.endsWith('B') ? -1 : v.endsWith('A') ? 1 : 0;
        act({ type: 'cue.update', itemId: it.id, cueId: c.id, patch: { ref: v.startsWith('end') ? 'end' : 'start', offsetMs: sign * (ms || (sign ? MIN : 0)) } });
      };
      sel.addEventListener('change', push);
      mi.addEventListener('change', push);
      return h('div', { class: 'cue-edit-row' }, tx, sel, mi,
        h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Entfernen'), onclick: () => act({ type: 'cue.remove', itemId: it.id, cueId: c.id }) }, icon('trash')));
    }

    function editRow(it) {
      if (!editDraft || editDraft.id !== it.id) editDraft = { id: it.id, title: it.title, speaker: it.speaker, dur: minutesLabel(it.durationMs), start: it.start || '', end: it.end || '', note: it.note || '' };
      const dr = editDraft;
      const ti = h('input', { class: 'input', value: dr.title, maxlength: 80, 'aria-label': t('Titel') });
      const sp = h('input', { class: 'input', value: dr.speaker, maxlength: 80, placeholder: t('Sprecher*in'), 'aria-label': t('Sprecher*in') });
      const du = h('input', { class: 'input num', value: dr.dur, inputmode: 'decimal', 'aria-label': t('Dauer') });
      const fr = h('input', { class: 'input num', type: 'time', value: dr.start, 'aria-label': t('Beginn') });
      const to = h('input', { class: 'input num', type: 'time', value: dr.end, 'aria-label': t('Ende') });
      const nt = h('input', { class: 'input', value: dr.note, maxlength: 300, placeholder: t('z. B. Sponsor erwähnen, Aussprache: Okafor'), 'aria-label': t('Hinweis für die Moderation') });
      [[ti, 'title'], [sp, 'speaker'], [du, 'dur'], [fr, 'start'], [to, 'end'], [nt, 'note']].forEach(([el, k]) => el.addEventListener('input', () => { dr[k] = el.value; }));
      const cueEd = h('div', { class: 'cue-edit' },
        h('span', { class: 'help' }, t('Cues')),
        ...(it.cues || []).map(c => cueEditRow(it, c)),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-quiet', onclick: () => act({ type: 'cue.add', itemId: it.id, text: t('Neuer Cue'), ref: 'start', offsetMs: 0 }) }, icon('plus'), t('Cue hinzufügen'))));
      const save = () => {
        const ms = E.parseDuration(du.value);
        act({ type: 'agenda.update', itemId: it.id, patch: { title: ti.value, speaker: sp.value, note: nt.value, start: fr.value, end: to.value, durationMs: ms == null ? it.durationMs : ms } });
        editingItem = null; editDraft = null; buildAgenda();
      };
      [ti, sp, du, fr, to, nt].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editingItem = null; editDraft = null; buildAgenda(); } }));
      setTimeout(() => ti.focus(), 0);
      return h('li', { class: 'ros-edit' }, ti, sp,
        h('div', { class: 'ros-edit-times' },
          h('label', { class: 'field' }, h('span', null, t('Beginn')), fr),
          h('label', { class: 'field' }, h('span', null, t('Ende')), to),
          h('label', { class: 'field' }, h('span', null, t('oder Dauer (Min.)')), du)),
        h('label', { class: 'field ros-edit-note' }, h('span', null, t('Hinweis für die Moderation')), nt),
        cueEd,
        h('div', { class: 'row' },
          armed(h('button', { class: 'btn btn-quiet' }, icon('trash'), t('Entfernen')), () => { editingItem = null; editDraft = null; act({ type: 'agenda.remove', itemId: it.id }); }),
          h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-quiet', onclick: () => { editingItem = null; editDraft = null; buildAgenda(); } }, t('Abbrechen')),
          h('button', { class: 'btn btn-go', onclick: save }, t('Speichern'))));
    }

    // --------------------------------------------------------- sync
    function syncPanel(force) {
      const s = S(), tm = timer();
      if (!tm) return;
      if (tm.id !== sel) { sel = tm.id; }
      if (force || !focused(nameInput)) nameInput.value = tm.name;
      const shownKind = kindForced || tm.kind;
      kindSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === shownKind)));
      removeBtn.hidden = s.timers.length <= 1;
      durSection.hidden = shownKind === 'clock' || E.isStatic(shownKind);
      targetSection.hidden = shownKind !== 'clock';
      nudges.hidden = shownKind === 'clock' || E.isStatic(shownKind);
      const carries = carriesAgenda();
      transport.hidden = E.isStatic(shownKind) || carries;
      goRow.hidden = E.isStatic(shownKind) || !carries;
      nextInfo.hidden = goRow.hidden;
      rosGo.hidden = carries || !s.agenda.items.length;
      prevBtn.hidden = !s.agenda.items.length;
      durSection.querySelector('[data-dur-title]').textContent = shownKind === 'countup' ? t('Limit (optional)') : t('Dauer');
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.ms) === tm.durationMs)));
      if (tm.kind === 'clock' && tm.targetLabel && !focused(targetInput)) targetInput.value = tm.targetLabel;

      overtimeToggle.checked = tm.overtime;
      if (!focused(warnInput)) warnInput.value = tm.warnMs / MIN;
      if (!focused(critInput)) critInput.value = tm.critMs / MIN;
      const pkey = s.presets.map(p => p.id + p.name).join('|');
      if (presetSelect.dataset.key !== pkey) {
        presetSelect.dataset.key = pkey;
        presetSelect.replaceChildren(...s.presets.map(p => h('option', { value: p.id }, p.name)));
      }
      presetSelect.value = tm.presetId;
      const preset = s.presets.find(p => p.id === tm.presetId);
      // closed options still tell what is set
      const summary = [preset ? preset.name : '', t('Vorwarnung') + ' ' + minutesLabel(tm.warnMs), t('Kritisch') + ' ' + minutesLabel(tm.critMs), tm.overtime ? t('Überzeit an') : t('Überzeit aus')].filter(Boolean).join(' · ');
      if (optSummary.textContent !== summary) optSummary.textContent = summary;

      // timer chips + where the selected timer runs
      const ck = JSON.stringify([s.timers.map(x => [x.id, x.name]), sel, root.ETUI.lang]);
      if (timerChips.dataset.key !== ck) {
        timerChips.dataset.key = ck;
        timerChips.replaceChildren(h('span', { class: 'help' }, t('Timer') + ':'),
          ...s.timers.map(x => h('button', { class: 'chip timer-chip', 'data-timer': x.id, 'aria-pressed': String(x.id === sel), onclick: () => selectTimer(x.id) },
            h('b', null, x.name), h('span', { class: 'num' }))),
          s.timers.length < E.MAX_TIMERS ? h('button', { class: 'chip', onclick: () => {
            const before = new Set(S().timers.map(x => x.id));
            act({ type: 'timer.add' });
            const added = S().timers.find(x => !before.has(x.id));
            if (added) selectTimer(added.id);
          } }, icon('plus'), t('Timer')) : null);
      }
      const on = P().screensWithTimer(s, tm.id);
      const where = on.length ? t('läuft auf') + ': ' + on.map(P().screenLabel).join(', ') : t('läuft auf keinem Screen – im Screen-Editor als Modul hinzufügen');
      if (timerWhere.textContent !== where) timerWhere.textContent = where;
      timerWhere.dataset.none = on.length ? '0' : '1';
    }

    /** the selected timer is the one the agenda runs on */
    function carriesAgenda() { const s = S(); return Boolean(s && s.agenda.items.length && s.agenda.timerId === sel); }

    function syncAgendaControls() {
      const s = S(), a = s.agenda;
      if (!focused(plannedInput)) plannedInput.value = a.plannedStart;
      const tkey = s.timers.map(x => x.id + x.name).join('|');
      if (rosTimerSelect.dataset.key !== tkey) {
        rosTimerSelect.dataset.key = tkey;
        rosTimerSelect.replaceChildren(...s.timers.map(x => h('option', { value: x.id }, x.name)));
      }
      rosTimerSelect.value = a.timerId;
      const on = P().screensWithTimer(s, a.timerId);
      const rw = rosPanel.querySelector('.ros-where');
      const rwt = on.length ? t('läuft auf') + ': ' + on.map(P().screenLabel).join(', ') : t('Der verknüpfte Timer ist auf keinem Screen.');
      if (rw.textContent !== rwt) rw.textContent = rwt;
      autoToggle.checked = a.autoStart;
      const av = E.agendaView(s, tr.now());
      prevBtn.disabled = a.cursor <= 0;
      goBtn.disabled = !a.items.length || av.done;
      const target = a.cursor < 0 ? a.items[0] : a.items[a.cursor + 1];
      const goText = av.done ? t('Agenda beendet') : a.cursor < 0 ? t('Agenda starten') : target ? t('Nächster Punkt') : t('Agenda beenden');
      goBtn.replaceChildren(icon('next'),
        h('span', { style: { display: 'grid', textAlign: 'left' } }, goText, target && !av.done ? h('small', null, target.title) : null),
        av.done ? null : kbd('G'));
      nextGo.disabled = goBtn.disabled;
      nextGo.replaceChildren(icon('next'), goText, av.done ? null : kbd('G'));
      const set = [a.plannedStart ? t('Planbeginn') + ' ' + uhr(a.plannedStart) : '', (s.timers.find(x => x.id === a.timerId) || {}).name || '', a.autoStart ? t('startet automatisch') : ''].filter(Boolean).join(' · ');
      const ss = rosPanel.querySelector('.ros-set-summary');
      if (ss.textContent !== set) ss.textContent = set;
      syncNextInfo(s, av, target);
    }
    /** "Danach": what GO starts – title, length, forecast start, cues and note for the stage */
    function syncNextInfo(s, av, target) {
      if (nextInfo.hidden) return;
      const a = s.agenda;
      let at = null;
      if (target && !av.done) { const i = a.items.indexOf(target); at = timeline(s, tr.now()).ist[i].s; }
      const key = JSON.stringify([target && [target.id, target.title, target.speaker, target.durationMs, (target.cues || []).length, target.note], at && Math.round(at / MIN), av.done, a.cursor < 0, root.ETUI.lang]);
      if (nextInfo.dataset.key === key) return;
      nextInfo.dataset.key = key;
      if (av.done) { nextInfo.replaceChildren(); return; }
      if (!target) {
        nextInfo.replaceChildren(h('span', { class: 'next-label' }, t('Danach')), h('b', null, t('Ende der Agenda')), h('span', { class: 'next-meta' }, t('GO beendet den letzten Programmpunkt.')));
        return;
      }
      const meta = [target.speaker, t('Dauer') + ' ' + E.formatMs(target.durationMs), at != null ? t('Beginn ca.') + ' ' + uhr(hhmm(at)) : '',
        target.cues && target.cues.length ? target.cues.length + ' ' + t(target.cues.length === 1 ? 'Cue' : 'Cues') : ''].filter(Boolean).join(' · ');
      nextInfo.replaceChildren(...[h('span', { class: 'next-label' }, a.cursor < 0 ? t('Als Erstes') : t('Danach')), h('b', null, target.title || '—'), h('span', { class: 'next-meta' }, meta),
        target.note ? h('span', { class: 'next-note' }, t('Hinweis') + ': ' + target.note) : null].filter(Boolean));
    }

    function sync() {
      const s = S();
      if (!s) return;
      const online = tr.status === 'online';
      conn.dataset.status = tr.status;
      const m = tr.meta || {};
      const ct = tr.mode === 'standalone' ? t('Nur dieses Gerät')
        : !online ? (tr.status === 'connecting' ? t('Verbinde …') : t('Verbindung getrennt – verbinde neu …'))
        : t('Verbunden') + (m.displays ? ` · ${m.displays} ${m.displays === 1 ? t('Screen') : t('Screens')}` : '');
      if (conn.lastChild.textContent !== ct) conn.lastChild.textContent = ct;
      if (!focused(titleInput)) titleInput.value = s.event.title;
      blackoutBtn.setAttribute('aria-pressed', String(s.blackout));

      const locked = tr.mode === 'server' && online && !tr.canControl();
      gate.hidden = !locked || viewOnly;
      if (locked && viewOnly) { banner.hidden = false; banner.dataset.tone = ''; banner.textContent = t('Nur ansehen: Zum Steuern PIN eingeben.'); banner.onclick = () => { viewOnly = false; sync(); }; }
      else if (tr.mode === 'standalone' && m.storageOk === false) { banner.hidden = false; banner.dataset.tone = 'stop'; banner.textContent = t('Speichern im Browser nicht möglich (privates Fenster?). Nach dem Schließen ist alles weg.'); }
      else banner.hidden = true;
      desk.inert = locked;
      alerts.inert = locked;
      mv.inert = false;

      syncAlerts(s);
      syncDsm(s);
      syncTalk(s);
      buildTiles();
      syncPanel();
      buildAgenda();
      syncAgendaControls();
      if (drawer.open) renderDrawer();
    }

    // ----------------------------------------------------- live loop
    function tick() {
      const s = S();
      if (s) {
        const now = tr.now();
        const clk = D.clockText(now, true);
        if (hdrClock.textContent !== clk) hdrClock.textContent = clk;
        tickCues(s, now);
        tickTimeline(s, now);
        tickSound(s);
        for (const sc of s.screens) {
          const tv = tileViews.get(sc.id);
          if (!tv) continue;
          // tally of the first timer on the screen, LIVE while an overlay is on it
          const tid = P().timersOf(s, sc)[0];
          const tm = tid && s.timers.find(x => x.id === tid);
          const v = tm ? E.timerView(tm, now) : null;
          const tally = !v || tm.kind === 'time' ? '' : v.state === 'running' || (tm.kind === 'clock' && v.state !== 'idle') ? (v.phase === 'normal' ? 'go' : v.phase === 'warn' ? 'warn' : 'stop') : v.state === 'finished' ? 'stop' : '';
          if (tv.tile.dataset.tally !== tally) tv.tile.dataset.tally = tally;
          const ov = P().overlayOf(s, sc.id);
          const badge = ov && ov.visible && ov.text ? 'LIVE' : v && v.state === 'paused' ? t('Pausiert') : '';
          tv.badge.hidden = !badge;
          if (tv.badge.textContent !== badge) tv.badge.textContent = badge;
        }
        // live times on the timer chips
        timerChips.querySelectorAll('[data-timer]').forEach(chip => {
          const tm = s.timers.find(x => x.id === chip.dataset.timer);
          if (!tm) return;
          const v = E.timerView(tm, now);
          const txt = tm.kind === 'time' ? D.clockText(now, false) : E.formatMs(v.ms, { up: tm.kind === 'countup' });
          const span = chip.lastChild;
          if (span.textContent !== txt) span.textContent = txt;
          chip.dataset.phase = v.state === 'running' ? v.phase : '';
        });
        const tm = timer();
        if (tm) {
          const v = E.timerView(tm, now);
          const isTime = tm.kind === 'time';
          let txt = isTime ? D.clockText(now, true) : E.formatMs(v.ms, { up: tm.kind === 'countup' });
          let phase = v.phase, prog = v.progress, state = v.state;
          let st = isTime ? t('Zeigt die Uhrzeit') : stateLabel(v) + (v.over && v.state !== 'finished' ? ' · ' + t('Überzeit') : '');
          let sub = isTime ? '' : tm.kind === 'clock' ? (tm.targetLabel ? t('bis') + ' ' + tm.targetLabel : '') : (tm.durationMs ? t('von') + ' ' + E.formatMs(tm.durationMs) : '');
          if (readTime.textContent !== txt) readTime.textContent = txt;
          readout.dataset.phase = phase;
          readout.dataset.state = state;
          if (readState.firstChild.textContent !== st) readState.firstChild.textContent = st;
          if (readSub.textContent !== sub) readSub.textContent = sub;
          const end = isTime ? '' : D.endText(tm, now, now, t, true);
          if (readEnd.textContent !== end) readEnd.textContent = end;
          readBar.style.width = (prog * 100).toFixed(2) + '%';
          const running = tm.running;
          const label = running ? 'pause' : 'play';
          if (playBtn.dataset.label !== label + v.state) {
            playBtn.dataset.label = label + v.state;
            playBtn.className = 'btn btn-big ' + (running ? 'btn-hold' : 'btn-go');
            playBtn.replaceChildren(icon(running ? 'pause' : 'play'), running ? t('Pause') : (v.state === 'paused' ? t('Fortsetzen') : t('Start')), kbd(t('Leertaste')));
            playBtn.disabled = tm.kind === 'clock' || v.state === 'finished';
            iconPlay.className = 'btn btn-big btn-square ' + (running ? 'btn-hold' : '');
            const pl = running ? t('Pause') : (v.state === 'paused' ? t('Fortsetzen') : t('Start'));
            iconPlay.title = pl + ' (' + t('Leertaste') + ')';
            iconPlay.setAttribute('aria-label', pl);
            iconPlay.replaceChildren(icon(running ? 'pause' : 'play'));
            iconPlay.disabled = playBtn.disabled;
          }
        }
        // run of show stats
        const av = E.agendaView(s, now);
        const items = s.agenda.items;
        const d = av.drift;
        // drift in words: "4:50 vor Plan" reads faster than "−04:50"
        const tone = !av.started ? '' : d > 30000 ? 'behind' : d < -30000 ? 'ahead' : '';
        const dt = !av.started ? '—' : Math.abs(d) < 1000 ? '0:00' : E.formatMs(Math.abs(d));
        const dn = !av.started ? '' : Math.abs(d) < 30000 ? t('im Plan') : d > 0 ? t('hinter Plan') : t('vor Plan');
        setStat(statDrift, t('Abweichung vom Plan'), dt, tone, dn);
        const wallEnd = Date.now() + (av.projectedEnd - now);
        const planEnd = E.planView(s, now).endAt;
        setStat(statEnd, t('Show-Ende'), items.length ? uhr(hhmm(wallEnd)) : '—', '', planEnd != null && items.length ? t('Plan') + ' ' + uhr(hhmm(planEnd)) : '');
        setStat(statTotal, t('Gesamtdauer'), items.length ? E.formatMs(av.totalPlanned) : '—', '', '');
        const live = ros.querySelector('[data-live]');
        if (live && av.current && av.current.startedAt != null) {
          const over = av.currentElapsed - av.current.durationMs;
          const txt = over > 0 ? '+' + E.formatMs(over) : t('läuft');
          if (live.textContent !== txt) live.textContent = txt;
          live.dataset.tone = over > 0 ? 'behind' : '';
        }
      }
    }
    function setStat(el, label, value, tone, note) {
      const [l, b, n] = el.children;
      if (l.textContent !== label) l.textContent = label;
      if (b.textContent !== value) b.textContent = value;
      if (n.textContent !== (note || '')) n.textContent = note || '';
      el.dataset.tone = tone || '';
    }

    // ------------------------------------------------------- drawer
    const TABS = [['connect', 'Verbindung'], ['pages', 'Screens'], ['design', 'Design'], ['messages', 'Schnellnachrichten'], ['security', 'Sicherheit'], ['companion', 'Companion'], ['more', 'System']];
    let drawerKey = '';
    function openDrawer(tab) {
      if (tab) drawerTab = tab;
      drawerKey = '';
      renderDrawer();
      if (!drawer.open) drawer.showModal();
    }
    function renderDrawer() {
      const s = S();
      const key = JSON.stringify([drawerTab, designId, sel, root.ETUI.lang, tr.meta, s.presets, s.quickMessages, s.stageQuick, s.talkQuick, s.timers.map(x => [x.id, x.name, x.presetId]), s.screens, s.groups, s.agenda.timerId, selScreen]);
      if (key === drawerKey) return;
      if (drawer.contains(document.activeElement) && document.activeElement.matches('input, textarea, select') && drawerTab !== 'connect') return;
      drawerKey = key;
      tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
        role: 'tab', 'aria-selected': String(id === drawerTab), onclick: () => { drawerTab = id; drawerKey = ''; renderDrawer(); },
      }, t(label))));
      const body = { connect: tabConnect, pages: () => root.ETPageEditor.tab(pageCtx), design: tabDesign, messages: tabMessages, security: tabSecurity, companion: tabCompanion, more: tabMore }[drawerTab]();
      drawerBody.replaceChildren(...[].concat(body));
    }

    /** full address of a page (built-in or custom), for links and QR codes */
    /** full address of a screen or fixed page, for links and QR codes */
    function pageUrl(pg) {
      if (tr.mode === 'standalone') return baseUrl() + '#' + (pg.fixed ? { mod: 'moderation', plan: 'plan', uhr: 'uhr' }[pg.id] : 'display?t=' + pg.num);
      return baseUrl() + root.ETPages.pagePath(pg);
    }
    const pageCtx = {
      tr, S, act, openUrl, pageUrl, linkLine: url => linkLine(url), qrCard: (l, u) => qrCard(l, u),
      baseUrl: () => baseUrl(), standalone: tr.mode === 'standalone', timerId: () => sel,
      beforeOpen: () => { if (drawer.open) drawer.close(); },
      onClose: () => openDrawer('pages'),
    };

    function qrCard(label, url) {
      const card = h('div', { class: 'qr-card' });
      card.innerHTML = Q.svg(url, { label });
      card.appendChild(h('b', null, label));
      return card;
    }
    function linkLine(url) {
      return h('div', { class: 'link-row' }, h('code', null, url),
        h('button', { class: 'btn', onclick: () => copy(url) }, icon('copy')),
        h('button', { class: 'btn', onclick: () => openUrl(url) }, icon('open')));
    }

    function shortAddressSection() {
      const m = tr.meta || {};
      const base = shortBase();
      const wrap = h('div', { class: 'short' });
      if (base) {
        const host = base.replace('http://', '');
        wrap.append(
          h('div', { class: 'short-hero' },
            h('small', null, t('Einfach im Browser eintippen')),
            h('b', { class: 'num' }, host + '/1'),
            h('span', null, t('Screens /1 … /16 · Agenda /plan · Uhr /uhr · Regie /control'))),
          linkLine(base + '/control'));
      } else {
        wrap.append(h('p', { class: 'help' }, t('Netzwerkname nicht verfügbar – bitte IP-Adresse oder QR-Code nutzen.')));
      }
      const nameIn = h('input', { class: 'input', value: m.name || 'event-timer', maxlength: 40, autocapitalize: 'off', spellcheck: 'false', 'aria-label': t('Netzwerkname') });
      const nameErr = h('span', { class: 'help' });
      const saveName = () => {
        const v = nameIn.value.trim().toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v)) { nameErr.textContent = t('Nur a–z, 0–9 und Bindestrich.'); nameIn.focus(); return; }
        nameErr.textContent = '';
        tr.setName(v);
        toast(t('Gespeichert'));
      };
      nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
      const p80 = h('input', { type: 'checkbox' });
      p80.checked = Boolean(m.port80);
      p80.addEventListener('change', () => tr.setPort80(p80.checked));
      wrap.append(...[
        h('div', { class: 'row' },
          h('label', { class: 'field', style: { flex: '1 1 200px' } }, h('span', null, t('Netzwerkname')), nameIn),
          h('button', { class: 'btn', style: { alignSelf: 'end' }, onclick: saveName }, t('Speichern'))),
        nameErr,
        h('label', { class: 'switch' }, p80, t('Ohne Portnummer (Port 80)')),
        m.port80Error ? h('p', { class: 'banner', 'data-tone': 'stop', style: { margin: 0 } }, m.port80Error) : null,
        h('p', { class: 'help' }, t('Klappt auf iPhone, iPad, Mac, Windows und Linux. Manche Android-Geräte kennen .local-Namen nicht – dann QR-Code oder IP nutzen. Laufen zwei Event Timer im selben Netz, jedem einen eigenen Namen geben.'))].filter(Boolean));
      return wrap;
    }

    function tabConnect() {
      const s = S();
      const out = [];
      if (tr.mode === 'standalone') {
        out.push(h('p', null, t('Standalone-Modus: Alles läuft in diesem Browser. Screens im selben Browser (neues Fenster, z. B. auf dem zweiten Bildschirm) laufen automatisch mit.')));
        out.push(h('div', { class: 'row' },
          h('button', { class: 'btn btn-go', onclick: () => openUrl(viewUrl('display', { t: curNum() })) }, icon('open'), t('Screen in neuem Fenster')),
          h('button', { class: 'btn', onclick: () => { drawer.close(); location.hash = 'display?t=' + curNum() + '&here=1'; } }, icon('full'), t('Screen hier öffnen'))));
        out.push(h('p', { class: 'help' }, t('Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.')));
      } else {
        out.push(shortAddressSection());
        out.push(h('p', { class: 'help' }, t('Mit dem Handy scannen, um zu steuern oder anzuzeigen.')));
        const cur = selectedScreens()[0] || P().byNum(s)[0];
        out.push(h('div', { class: 'qr-grid' },
          qrCard(t('Regie'), viewUrl('control')),
          cur ? qrCard(P().screenLabel(cur), pageUrl(cur)) : null,
          qrCard(t('Moderation'), baseUrl() + '/moderation')));
        out.push(linkLine(viewUrl('control')));
        P().byNum(s).forEach(x => out.push(h('div', { class: 'link-label' }, P().screenLabel(x)), linkLine(pageUrl(x))));
        out.push(h('div', { class: 'link-label' }, t('Feste Screens')));
        out.push(linkLine(baseUrl() + '/moderation'));
        out.push(linkLine(baseUrl() + '/plan'));
        out.push(linkLine(baseUrl() + '/uhr'));
        out.push(linkLine(baseUrl() + '/cues'));
        const m = tr.meta || {};
        if (m.hostname) out.push(h('p', { class: 'help' }, t('Per Rechnername') + ': ', h('b', null, `http://${m.hostname}:${m.port}/control`)));
        out.push(h('p', { class: 'help' }, t('Klappt der Link nicht? Beim ersten Start fragt Windows nach der Firewall – „Private Netzwerke“ erlauben.')));
      }
      // display link builder: any screen that should show something other than the plain full-screen timer
      const VIEWS = [
        ['full', 'Vollbild-Timer', 'Standard-DSM, wie /1.'],
        ['plan', 'Agenda-Monitor', 'Laufender Programmpunkt mit Restzeit, daneben die ganze Agenda (wie /plan).'],
        ['time', 'Nur Uhrzeit', 'Nur die Uhrzeit groß, sonst nichts (wie /uhr).'],
        ['clock', 'Uhrzeit groß', 'Uhrzeit groß, der Timer klein darunter.'],
        ['lower', 'Bauchbinde (Keying)', 'Kleiner Timer unten rechts – für vMix/OBS als Browser-Input über dem Bild.'],
        ['agenda', 'Agenda (Backstage)', 'Timer plus Agenda mit Abweichung, für Backstage oder Greenroom.'],
      ];
      const layoutSel = h('select', { class: 'input' }, VIEWS.map(([v, l]) => h('option', { value: v }, t(l))));
      const timerSel = h('select', { class: 'input' }, s.timers.map(x => h('option', { value: x.id.slice(1) }, x.name)));
      timerSel.value = sel.slice(1);
      const transp = h('input', { type: 'checkbox' });
      const viewHelp = h('p', { class: 'help' });
      const out2 = h('div');
      const pvBox = h('div', { class: 'preview-box' });
      const pv = D.create(pvBox, {});
      const drawPv = () => {
        const st = S();
        if (!st) return;
        const tm = st.timers.find(x => x.id === 't' + timerSel.value) || st.timers[0];
        pv.update({ state: Object.assign({}, st, { blackout: false }), timer: tm, now: tr.now(), wallNow: tr.now(), layout: layoutSel.value, transparent: transp.checked, seconds: true, i18n: t });
      };
      const pvTimer = setInterval(() => { if (!drawer.open || drawerTab !== 'connect' || !pvBox.isConnected) clearInterval(pvTimer); else drawPv(); }, 250);
      const upd = () => {
        const params = { t: timerSel.value };
        if (layoutSel.value !== 'full') params.layout = layoutSel.value;
        if (transp.checked) params.bg = 'transparent';
        out2.replaceChildren(linkLine(viewUrl('display', params)));
        viewHelp.textContent = t(VIEWS.find(x => x[0] === layoutSel.value)[2]);
        drawPv();
      };
      [layoutSel, timerSel, transp].forEach(x => x.addEventListener('change', upd));
      setTimeout(upd, 0);
      out.push(h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Ansichts-Link erstellen')),
        h('p', { class: 'help', style: { marginBottom: '10px' } }, t('Für Monitore, die etwas anderes zeigen sollen als den normalen Vollbild-Timer.')),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', null, 'Timer'), timerSel),
          h('label', { class: 'field' }, h('span', null, t('Ansicht')), layoutSel)),
        viewHelp,
        h('label', { class: 'switch', style: { margin: '6px 0 10px' } }, transp, t('Transparenter Hintergrund (vMix/OBS)')),
        pvBox,
        h('div', { style: { marginTop: '10px' } }, out2)));
      return out;
    }

    function tabDesign() {
      const s = S();
      const tm = timer();
      if (!designId || !s.presets.some(p => p.id === designId)) designId = tm.presetId;
      const p = s.presets.find(x => x.id === designId);
      const draft = JSON.parse(JSON.stringify(p));
      draft.flashStyle = E.flashStyleOf(draft);
      const pick = h('select', { class: 'input' },
        h('optgroup', { label: t('Eingebaut') }, s.presets.filter(x => x.builtin).map(x => h('option', { value: x.id }, x.name))),
        s.presets.some(x => !x.builtin) ? h('optgroup', { label: t('Eigenes') }, s.presets.filter(x => !x.builtin).map(x => h('option', { value: x.id }, x.name))) : null);
      pick.value = designId;
      pick.addEventListener('change', () => { designId = pick.value; drawerKey = ''; renderDrawer(); });

      const previewBox = h('div', { class: 'preview-box' });
      const preview = D.create(previewBox, { tile: true });
      const demoState = () => {
        const st = JSON.parse(JSON.stringify(s));
        st.presets = st.presets.map(x => (x.id === draft.id ? draft : x));
        st.blackout = false;
        return st;
      };
      const drawPreview = () => {
        const st = demoState();
        const demo = Object.assign({}, st.timers.find(x => x.id === sel), { presetId: draft.id });
        preview.update({ state: st, timer: demo, now: tr.now(), i18n: t });
      };
      const live = setInterval(() => { if (!drawer.open || drawerTab !== 'design') clearInterval(live); else drawPreview(); }, 250);

      const colorField = (key, label) => {
        const i = h('input', { class: 'input', type: 'color', value: draft[key] });
        i.addEventListener('input', () => { draft[key] = i.value; drawPreview(); });
        return h('label', { class: 'field' }, h('span', null, t(label)), i);
      };
      const boolField = (key, label) => {
        const i = h('input', { type: 'checkbox' });
        i.checked = draft[key];
        i.addEventListener('change', () => { draft[key] = i.checked; drawPreview(); });
        return h('label', { class: 'switch' }, i, t(label));
      };
      const textField = (key, label) => {
        const i = h('input', { class: 'input', value: draft[key], maxlength: 60 });
        i.addEventListener('input', () => { draft[key] = i.value; drawPreview(); });
        return h('label', { class: 'field' }, h('span', null, t(label)), i);
      };
      const selField = (key, label, opts) => {
        const i = h('select', { class: 'input' }, opts.map(([v, l]) => h('option', { value: v }, t(l))));
        i.value = String(draft[key]);
        i.addEventListener('change', () => { draft[key] = key === 'weight' ? Number(i.value) : i.value; drawPreview(); });
        return h('label', { class: 'field' }, h('span', null, t(label)), i);
      };
      const nameIn = h('input', { class: 'input', value: draft.name, maxlength: 40 });
      nameIn.addEventListener('input', () => { draft.name = nameIn.value; });

      const actions = h('div', { class: 'row' });
      if (!p.builtin) {
        actions.append(
          h('button', { class: 'btn btn-go', onclick: () => { act({ type: 'preset.save', preset: draft }); toast(t('Speichern')); } }, t('Speichern')),
          armed(h('button', { class: 'btn btn-quiet' }, icon('trash'), t('Design löschen')), () => { act({ type: 'preset.remove', presetId: p.id }); designId = null; drawerKey = ''; renderDrawer(); }));
      }
      actions.append(h('button', { class: p.builtin ? 'btn btn-go' : 'btn', onclick: () => {
        const before = new Set(S().presets.map(x => x.id));
        const copyDraft = Object.assign({}, draft, { id: undefined, baseId: p.id, name: draft.name === p.name && p.builtin ? p.name + ' 2' : draft.name });
        act({ type: 'preset.save', preset: copyDraft, assignTo: sel });
        const added = S().presets.find(x => !before.has(x.id));
        if (added) designId = added.id;
        drawerKey = ''; renderDrawer();
      } }, t('Als neues Design speichern')));
      if (tm.presetId !== p.id) actions.append(h('button', { class: 'btn', onclick: () => act({ type: 'timer.update', id: sel, patch: { presetId: p.id } }) }, t('Für diesen Timer verwenden')));

      setTimeout(drawPreview, 0);
      return [
        h('label', { class: 'field' }, h('span', null, t('Design wählen')), pick),
        h('div', null, h('p', { class: 'help', style: { marginBottom: '6px' } }, t('Live-Vorschau')), previewBox),
        p.builtin ? h('p', { class: 'help' }, t('Eingebaute Designs bleiben unverändert – Änderungen werden als neues Design gespeichert.')) : null,
        h('label', { class: 'field' }, h('span', null, t('Name')), nameIn),
        h('div', { class: 'grid2' },
          colorField('bg', 'Hintergrund'), colorField('fg', 'Ziffern'), colorField('accent', 'Fortschritt'),
          colorField('warn', 'Warnung'), colorField('crit', 'Kritisch'), colorField('overBg', 'Überzeit Hintergrund'),
          colorField('overFg', 'Überzeit Ziffern'), colorField('msgBg', 'Einblendung Fläche'), colorField('msgFg', 'Einblendung Text')),
        h('div', { class: 'grid2' },
          selField('font', 'Schrift', [['din', 'DIN / Bahnschrift'], ['grotesk', 'Grotesk'], ['mono', 'Monospace'], ['serif', 'Serif'], ['rounded', 'Rounded']]),
          selField('weight', 'Stärke', [[400, '400'], [500, '500'], [600, '600'], [700, '700'], [800, '800'], [900, '900']]),
          selField('bgStyle', 'Fläche', [['solid', 'Einfarbig'], ['glow', 'Leuchten'], ['transparent', 'Transparent']]),
          selField('flashStyle', 'Blinken bei Überzeit', [['off', 'Aus'], ['soft', 'Sanft'], ['hard', 'Stark']])),
        h('div', { class: 'grid2' },
          boolField('showProgress', 'Fortschrittsbalken'), boolField('showClock', 'Uhrzeit'), boolField('showTitle', 'Titel und Sprecher*in'),
          boolField('showNext', 'Nächsten Programmpunkt anzeigen'), boolField('showNotice', 'Hinweise'), boolField('showEnd', 'Endzeit anzeigen')),
        h('div', { class: 'grid2' }, textField('warnText', 'Text bei Warnung'), textField('expiredText', 'Text bei Zeitende'), textField('overText', 'Text bei Überzeit')),
        actions,
      ];
    }

    function tabMessages() {
      const s = S();
      const block = (label, help, list, type) => {
        const ta = h('textarea', { class: 'input', rows: 6 }, (list || []).join('\n'));
        return h('div', { class: 'section' },
          h('label', { class: 'field' }, h('span', null, t(label)), ta),
          h('p', { class: 'help', style: { margin: '6px 0 8px' } }, t(help)),
          h('div', { class: 'row' }, h('button', { class: 'btn btn-go', onclick: () => { act({ type, list: ta.value.split(/\r?\n/) }); toast(t('Gespeichert')); } }, t('Speichern'))));
      };
      return [
        block('Schnellnachrichten an den DSM', 'Regie → DSM. Eine pro Zeile, höchstens 12.', s.quickMessages, 'quick.set'),
        block('Talkback-Presets', 'Regie → Moderation (/moderation). Eine pro Zeile, höchstens 12.', s.talkQuick, 'talkback.quickSet'),
        block('Schnellmeldungen (/moderation)', 'Bühne → Regie: Knöpfe auf dem Handy der Moderation. Eine pro Zeile, höchstens 12.', s.stageQuick, 'stage.quickSet'),
      ];
    }

    function tabSecurity() {
      if (tr.mode === 'standalone') return [h('p', null, t('PIN im Standalone-Modus nicht nötig.'))];
      const m = tr.meta || {};
      const pin = h('input', { class: 'input num', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: 32 });
      return [
        h('p', null, m.pinRequired ? t('Regie ist mit PIN geschützt.') : t('Keine PIN gesetzt – jedes Gerät im Netzwerk kann steuern.')),
        h('p', { class: 'help' }, t('Mit PIN dürfen nur Geräte steuern, die sie kennen. Screens brauchen nie eine PIN; am Rechner selbst ist keine nötig.')),
        h('label', { class: 'field' }, h('span', null, t('Regie-PIN')), pin),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-go', onclick: () => { if (pin.value.trim()) { tr.setPin(pin.value.trim()); pin.value = ''; toast(t('PIN setzen')); } } }, t('PIN setzen')),
          m.pinRequired ? armed(h('button', { class: 'btn' }, t('PIN entfernen')), () => tr.setPin('')) : null),
      ];
    }

    function tabCompanion() {
      if (tr.mode === 'standalone') return [h('p', null, t('Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.'))];
      const base = baseUrl() + '/api/companion';
      const n = sel.slice(1);
      const pinNote = tr.meta && tr.meta.pinRequired ? '?pin=…' : '';
      const lines = [
        `${base}/timer${n}/toggle${pinNote}`,
        `${base}/timer${n}/start`, `${base}/timer${n}/pause`, `${base}/timer${n}/reset`,
        `${base}/timer${n}/add/60`, `${base}/timer${n}/subtract/60`,
        `${base}/timer${n}/preset/10`, `${base}/timer${n}/preset/10?start=1`,
        `${base}/timer${n}/message?text=Bitte%20zum%20Ende&flash=1`, `${base}/timer${n}/clear-message`, `${base}/timer${n}/flash`,
        `${base}/agenda/next`, `${base}/agenda/prev`, `${base}/agenda/go/1`,
        `${base}/blackout/toggle`,
        `${base}/status`,
      ];
      return [
        h('p', null, t('Bitfocus Companion: Modul „Generic HTTP“, Aktion GET auf diese Adressen.')),
        h('div', { class: 'code' }, lines.join('\n')),
        h('button', { class: 'btn', onclick: () => copy(lines.join('\n')) }, icon('copy'), t('Kopieren')),
        h('p', { class: 'help' }, '/status → JSON: timers[].display, timers[].phase, agenda.current, agenda.drift'),
      ];
    }

    function tabMore() {
      const langSel = h('select', { class: 'input' }, h('option', { value: 'de' }, 'Deutsch'), h('option', { value: 'en' }, 'English'));
      langSel.value = root.ETUI.lang;
      langSel.addEventListener('change', () => { root.ETUI.setLang(langSel.value); location.reload(); });
      const m = tr.meta || {};
      const sw = (key, on, label, after) => {
        const i = h('input', { type: 'checkbox' });
        i.checked = on;
        i.addEventListener('change', () => { store.set(key, i.checked ? '1' : '0'); if (after) after(i.checked); });
        return h('label', { class: 'switch' }, i, t(label));
      };
      const vol = h('select', { class: 'input' }, [['normal', 'Normal'], ['laut', 'Laut'], ['max', 'Sehr laut']].map(([v, l]) => h('option', { value: v }, t(l))));
      vol.value = store.get('et-req-vol') || 'laut';
      vol.addEventListener('change', () => { store.set('et-req-vol', vol.value); testSound('alert'); });
      const soundBox = h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Signalton')),
        h('div', { style: { display: 'grid', gap: '10px' } },
          sw('et-req-sound', soundOn(), 'Signalton bei Meldungen von der Bühne', on => { if (on) { testSound('alert'); } }),
          h('div', { class: 'row' },
            h('label', { class: 'field', style: { flex: '1 1 160px' } }, h('span', null, t('Lautstärke')), vol),
            h('button', { class: 'btn', style: { alignSelf: 'end' }, onclick: () => { testSound('alert'); } }, t('Ton testen'))),
          sw('et-req-remind', remindOn(), 'Erinnerung alle 15 s, bis bestätigt'),
          sw('et-ack-sound', ackSoundOn(), 'Kurzer Ton, wenn die Moderation „Verstanden“ tippt', on => { if (on) { testSound('ack'); } }),
          h('p', { class: 'help' }, t('Die Lautstärke ist durch die Systemlautstärke des Rechners begrenzt. Browser spielen erst nach einem Klick auf die Seite Ton ab.'))));
      const keys = [['Leertaste', 'Start/Pause'], ['R', 'Zurücksetzen'], ['↑ / ↓', '±1:00'], ['← / →', '±0:10'], ['⇧ ↵', 'Setzen & Start'], ['G', 'Nächster Programmpunkt'], ['C', 'Nächsten Cue auslösen (GO)'], ['B', 'Blackout alle'], ['T', 'Zeitleiste auf/zu'], ['1 … 8', 'Timer wählen']];
      const out = [
        h('label', { class: 'field' }, h('span', null, t('Sprache')), langSel),
        soundBox,
        h('div', null, h('h3', { class: 'section-title' }, t('Tastenkürzel')),
          h('div', { class: 'grid2' }, keys.map(([k, v]) => h('div', null, h('b', { class: 'num' }, t(k)), ' ', h('span', { class: 'muted' }, t(v)))))),
        h('p', { class: 'help' }, m.dataPath ? t('Speicherort') + ': ' + m.dataPath : tr.mode === 'standalone' ? t('Speichert in diesem Browser.') : ''),
        m.logPath ? h('p', { class: 'help' }, t('Log-Datei') + ': ' + m.logPath) : null,
      ];
      if (tr.mode === 'server' && tr.isLocal()) {
        // only on the computer that runs Event Timer – a phone must never switch the show off
        out.push(h('div', { class: 'section' },
          h('h3', { class: 'section-title' }, t('Beenden')),
          h('p', { class: 'help', style: { marginBottom: '8px' } }, t('Speichert die Show und beendet Event Timer auf diesem Rechner. Alle Screens verlieren die Verbindung.')),
          armed(h('button', { class: 'btn btn-stop' }, t('Event Timer beenden')), shutdown)));
      }
      out.push(h('p', { class: 'help about' }, 'Event Timer ' + (m.version || root.ET_VERSION || '') + ' · © 2026 Felix Spindler · ',
        h('a', { href: 'mailto:f-spindler@pm.me' }, 'f-spindler@pm.me'), ' · ' + t('Lizenz') + ': GPL-3.0-or-later'));
      if (tr.mode === 'standalone') {
        out.push(h('div', { class: 'section' },
          h('p', { class: 'help', style: { marginBottom: '8px' } }, t('Löscht alle Timer, Screens, die Agenda und eigene Designs in diesem Browser.')),
          armed(h('button', { class: 'btn btn-stop' }, t('Show zurücksetzen')), () => { tr.replaceState(E.defaultState()); selectScreen('p1'); drawer.close(); })));
      }
      return out;
    }

    // ------------------------------------------------------ shutdown
    async function shutdown() {
      drawer.close();
      const done = h('div', { class: 'gate', role: 'alert' },
        h('div', { class: 'gate-card' },
          h('h2', null, t('Event Timer wurde beendet')),
          h('p', null, t('Die Show ist gespeichert. Zum Weitermachen das Programm erneut öffnen.'))));
      try {
        const r = await fetch('/api/shutdown', { method: 'POST' });
        if (!r.ok) throw new Error(r.status);
        document.body.appendChild(done);
        alive = false;
      } catch { toast(t('Beenden nicht möglich')); }
    }

    // ---------------------------------------------------- keyboard
    const onKey = e => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (drawer.open || !gate.hidden) return;
      if (tr.mode === 'server' && !tr.canControl()) return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); act({ type: 'timer.toggle', id: sel }); }
      else if (k === 'r' || k === 'R') act({ type: 'timer.reset', id: sel });
      else if (k === 'ArrowUp') { e.preventDefault(); act({ type: 'timer.adjust', id: sel, ms: MIN }); }
      else if (k === 'ArrowDown') { e.preventDefault(); act({ type: 'timer.adjust', id: sel, ms: -MIN }); }
      else if (k === 'ArrowRight') act({ type: 'timer.adjust', id: sel, ms: 10000 });
      else if (k === 'ArrowLeft') act({ type: 'timer.adjust', id: sel, ms: -10000 });
      else if (k === 'g' || k === 'G') act({ type: 'agenda.next' });
      else if (k === 'b' || k === 'B') act({ type: 'blackout.toggle' });
      else if (k === 't' || k === 'T') setTlOpen(!tlOpen);
      else if (k === 'c' || k === 'C') { const c = goCues[0] || cueShown.find(x => x.status === 'go' || x.status === 'standby' || x.status === 'ready'); if (c) goCue(c); }
      else if (/^[1-8]$/.test(k)) { const sc = S().screens.find(x => x.num === Number(k)); if (sc) selectScreen(sc.id); }
    };
    document.addEventListener('keydown', onKey);

    const unsubscribe = tr.subscribe(sync);
    sync();
    let alive = true;
    const loop = () => { if (!alive) return; tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return () => { alive = false; unsubscribe(); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', unlockAudio); document.removeEventListener('keydown', unlockAudio); if (drawer.open) drawer.close(); };
  }

  root.ETControl = { mount };
})(globalThis);
