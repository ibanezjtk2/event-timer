/* Control room view. */
(function (root) {
  'use strict';
  const E = root.ETEngine, D = root.ETDisplay, Q = root.ETQR;
  const { h, icon, toast, armed, copy, t } = root.ETUI;

  const MIN = 60000;
  const QUICK_MINUTES = [1, 3, 5, 10, 15, 20, 30, 45, 60];
  const pad = n => String(n).padStart(2, '0');
  const hhmm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const minutesLabel = ms => {
    const m = ms / MIN;
    return Number.isInteger(m) ? String(m) : E.formatMs(ms);
  };
  const store = root.ETTransport.store;

  function mount(app, tr) {
    let sel = store.get('et-sel') || 't1';
    let editingItem = null;
    let drawerTab = 'connect';
    let designId = null;
    let viewOnly = false;
    const S = () => tr.state;
    const timer = () => (S() ? S().timers.find(x => x.id === sel) || S().timers[0] : null);
    const act = a => tr.act(a);
    const focused = el => document.activeElement === el;

    // -------------------------------------------------------- skeleton
    const conn = h('div', { class: 'conn', 'data-status': 'connecting' }, h('i'), h('span'));
    const titleInput = h('input', { class: 'event-title', placeholder: t('Veranstaltung benennen'), maxlength: 80, 'aria-label': t('Veranstaltung benennen') });
    titleInput.addEventListener('change', () => act({ type: 'event.update', title: titleInput.value }));
    const blackoutBtn = h('button', { class: 'btn btn-stop', 'aria-pressed': 'false', title: 'B', onclick: () => act({ type: 'blackout.toggle' }) }, t('Blackout'));
    const settingsBtn = h('button', { class: 'btn btn-icon', 'aria-label': t('Einstellungen'), title: t('Einstellungen'), onclick: () => openDrawer() }, icon('gear'));
    const topbar = h('header', { class: 'topbar' },
      h('div', { class: 'brand', html: root.ETUI.brandSvg + '<span>Event Timer</span>' }),
      titleInput,
      h('div', { class: 'topbar-right' }, conn, blackoutBtn, settingsBtn));

    const banner = h('div', { class: 'banner', hidden: true });
    const mv = h('div', { class: 'mv', role: 'toolbar', 'aria-label': 'Timer' });

    // timer panel
    const nameInput = h('input', { class: 'name-input', maxlength: 40, 'aria-label': t('Name') });
    nameInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { name: nameInput.value } }));
    const kindSeg = h('div', { class: 'seg', role: 'group' });
    const kinds = [['countdown', 'Countdown'], ['countup', 'Hochzählen'], ['clock', 'Bis Uhrzeit'], ['time', 'Uhrzeit'], ['schedule', 'Zeitplan']];
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
    const removeBtn = armed(h('button', { class: 'btn btn-quiet btn-icon', title: t('Timer entfernen'), 'aria-label': t('Timer entfernen') }, icon('trash')),
      () => { act({ type: 'timer.remove', id: sel }); });

    const readTime = h('div', { class: 'readout-time' }, '00:00');
    const readState = h('div', { class: 'readout-state' }, h('b'), h('span'));
    const readBar = h('i');
    const readout = h('div', { class: 'readout' }, readTime, readState, h('div', { class: 'readout-bar' }, readBar));

    const playBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => act({ type: 'timer.toggle', id: sel }) });
    const resetBtn = h('button', { class: 'btn btn-big', onclick: () => act({ type: 'timer.reset', id: sel }) }, icon('reset'), t('Zurücksetzen'));
    const transport = h('div', { class: 'transport' }, playBtn, resetBtn);
    const nudges = h('div', { class: 'nudges' },
      [[-MIN, '−1:00'], [-10000, '−0:10'], [10000, '+0:10'], [MIN, '+1:00']].map(([ms, label]) =>
        h('button', { class: 'btn', onclick: () => act({ type: 'timer.adjust', id: sel, ms }) }, label)));

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
        h('button', { class: 'btn', onclick: () => setDur(false) }, t('Setzen')),
        h('button', { class: 'btn', onclick: () => setDur(true) }, icon('play'), t('Setzen und starten'))));

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

    // message
    const msgInput = h('input', { class: 'input', placeholder: t('Nachricht eingeben'), maxlength: 280, 'aria-label': t('Nachricht an die Bühne') });
    const sendMsg = () => { if (msgInput.value.trim()) { act({ type: 'timer.message', id: sel, text: msgInput.value }); msgInput.value = ''; } };
    msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
    const quickRow = h('div', { class: 'row', style: { marginTop: '10px' } });
    const flashBtn = h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => act({ type: 'timer.message', id: sel, flash: !timer().message.flash }) }, t('Blinken'));
    const showBtn = h('button', { class: 'chip', onclick: () => act({ type: 'timer.message', id: sel, visible: !timer().message.visible }) });
    const clearBtn = h('button', { class: 'chip', onclick: () => act({ type: 'timer.messageClear', id: sel }) }, t('Löschen'));
    const msgPreview = h('div', { class: 'msg-preview' }, h('span'), flashBtn, showBtn, clearBtn);
    const msgSection = h('div', { class: 'section' },
      h('h3', { class: 'section-title' }, t('Nachricht an die Bühne')),
      h('div', { class: 'row' }, h('div', { style: { flex: '1 1 200px' } }, msgInput), h('button', { class: 'btn', onclick: sendMsg }, t('Senden'))),
      quickRow, msgPreview);

    // options
    const overtimeToggle = h('input', { type: 'checkbox' });
    overtimeToggle.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { overtime: overtimeToggle.checked } }));
    const warnInput = h('input', { class: 'input num', type: 'number', min: 0, max: 60, step: 0.5 });
    const critInput = h('input', { class: 'input num', type: 'number', min: 0, max: 60, step: 0.5 });
    warnInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { warnMs: Number(warnInput.value) * MIN } }));
    critInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { critMs: Number(critInput.value) * MIN } }));
    const presetSelect = h('select', { class: 'input' });
    presetSelect.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { presetId: presetSelect.value } }));
    const optSection = h('div', { class: 'section' },
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', null, t('Vorwarnung ab') + ' (' + t('Min.') + ')'), warnInput),
        h('label', { class: 'field' }, h('span', null, t('Kritisch ab') + ' (' + t('Min.') + ')'), critInput),
        h('label', { class: 'field' }, h('span', null, t('Design')), presetSelect)),
      h('label', { class: 'switch', style: { marginTop: '12px' } }, overtimeToggle, t('Überziehen erlauben')));

    const linkRow = h('div', { class: 'links' });
    const linkSection = h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Display-Link')), linkRow);

    const timerPanel = h('section', { class: 'panel', 'aria-label': 'Timer' },
      h('div', { class: 'panel-head' }, nameInput, kindSeg, removeBtn),
      readout, transport, nudges, durSection, targetSection, msgSection, optSection, linkSection);

    // agenda panel
    const ros = h('ol', { class: 'ros' });
    const statDrift = h('div', { class: 'stat' }, h('small', null, t('Abweichung')), h('b', null, '—'));
    const statEnd = h('div', { class: 'stat' }, h('small', null, t('Ende ca.')), h('b', null, '—'));
    const statTotal = h('div', { class: 'stat' }, h('small', null, t('Geplant')), h('b', null, '—'));
    const plannedInput = h('input', { class: 'input num', type: 'time', 'aria-label': t('Planbeginn') });
    plannedInput.addEventListener('change', () => act({ type: 'agenda.settings', plannedStart: plannedInput.value }));
    const rosTimerSelect = h('select', { class: 'input', 'aria-label': t('Ablauf verbinden mit') });
    rosTimerSelect.addEventListener('change', () => act({ type: 'agenda.settings', timerId: rosTimerSelect.value }));
    const autoToggle = h('input', { type: 'checkbox' });
    autoToggle.addEventListener('change', () => act({ type: 'agenda.settings', autoStart: autoToggle.checked }));

    const addTitle = h('input', { class: 'input', placeholder: t('Titel'), maxlength: 80 });
    const addSpeaker = h('input', { class: 'input', placeholder: t('Sprecher*in'), maxlength: 80 });
    const addDur = h('input', { class: 'input num', placeholder: '10', inputmode: 'decimal', 'aria-label': t('Dauer') });
    const addFrom = h('input', { class: 'input num', type: 'time', 'aria-label': t('Von') });
    const addTo = h('input', { class: 'input num', type: 'time', 'aria-label': t('Bis') });
    const addItem = () => {
      if (!addTitle.value.trim()) { addTitle.focus(); return; }
      act({ type: 'agenda.add', item: { title: addTitle.value, speaker: addSpeaker.value, start: addFrom.value, end: addTo.value, durationMs: E.parseDuration(addDur.value || '10') ?? 10 * MIN } });
      // the next slot usually starts where this one ends
      addFrom.value = addTo.value ? addTo.value : '';
      addTitle.value = ''; addSpeaker.value = ''; addDur.value = ''; addTo.value = '';
      addTitle.focus();
    };
    [addTitle, addSpeaker, addDur, addFrom, addTo].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); }));
    const importBox = h('textarea', { class: 'input', rows: 5, placeholder: '13:00-15:00; Workshop A; Anna Schmidt\n15:00-15:30; Kaffeepause\nKeynote; Ben Okafor; 25' });
    const importDetails = h('details', null,
      h('summary', { class: 'btn btn-quiet', style: { display: 'inline-flex' } }, t('Importieren')),
      h('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } },
        h('p', { class: 'help' }, t('Eine Zeile pro Slot: [Von-Bis;] Titel; Sprecher*in; [Minuten]. Auch direkt aus Excel kopierbar.')),
        importBox,
        h('div', { class: 'row' },
          armed(h('button', { class: 'btn' }, t('Importieren')), () => {
            const items = parseImport(importBox.value);
            if (!items.length) return;
            act({ type: 'agenda.replace', items });
            importBox.value = '';
            importDetails.open = false;
          }),
          h('span', { class: 'help' }, t('Ersetzt den bisherigen Ablauf.')))));

    const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': t('Ablauf läuft') },
      [['manual', 'Per Knopf'], ['clock', 'Nach Uhrzeit']].map(([m, l]) => h('button', { 'data-mode': m, 'aria-pressed': 'false', onclick: () => act({ type: 'agenda.settings', mode: m }) }, t(l))));
    let ripple = store.get('et-ripple') !== '0';
    const rippleToggle = h('input', { type: 'checkbox' });
    rippleToggle.checked = ripple;
    rippleToggle.addEventListener('change', () => { ripple = rippleToggle.checked; store.set('et-ripple', ripple ? '1' : '0'); });
    const sched = () => E.scheduleView(S(), tr.now());
    const extendCurrent = ms => { const v = sched(); if (v.current) act({ type: 'agenda.adjust', itemId: v.current.item.id, ms, ripple }); };
    const holdBtn = h('button', { class: 'btn btn-big', onclick: () => {
      const a = S().agenda;
      if (a.holdAt == null) { act({ type: 'agenda.hold' }); return; }
      // resume: the slot that was running when we stopped gets the held time, everything after moves along
      const v = sched();
      if (v.current) act({ type: 'agenda.resume', itemId: v.current.item.id });
      else if (v.next && v.next.index > 0) act({ type: 'agenda.resume', itemId: v.rows[v.next.index - 1].item.id, mode: 'after' });
      else act({ type: 'agenda.resume' });
    } });
    const nowBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => { const v = sched(); if (v.current) act({ type: 'agenda.adjust', itemId: v.current.item.id, ms: -Math.max(1000, v.remainingMs), ripple }); } }, icon('next'), t('Jetzt weiter'));
    const schedCtl = h('div', { class: 'sched-ctl' },
      h('div', { class: 'sched-main' }, holdBtn, nowBtn),
      h('div', { class: 'row' },
        h('span', { class: 'help' }, t('Laufender Punkt')),
        h('button', { class: 'btn num', onclick: () => extendCurrent(-5 * MIN) }, '−5'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(-MIN) }, '−1'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(MIN) }, '+1'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(5 * MIN) }, '+5'),
        h('label', { class: 'switch' }, rippleToggle, t('Folgende verschieben'))),
      h('div', { class: 'row' },
        h('span', { class: 'help' }, t('Ganzer Plan')),
        h('button', { class: 'btn num', onclick: () => act({ type: 'agenda.shift', ms: -5 * MIN }) }, '−5'),
        h('button', { class: 'btn num', onclick: () => act({ type: 'agenda.shift', ms: 5 * MIN }) }, '+5'),
        h('span', { class: 'help', 'data-adjust': '' }),
        h('span', { style: { flex: 1 } }),
        armed(h('button', { class: 'btn btn-quiet' }, t('Anpassungen zurücksetzen')), () => act({ type: 'agenda.clearAdjust' }))));

    const prevBtn = h('button', { class: 'btn btn-big', 'aria-label': t('Zurück'), onclick: () => act({ type: 'agenda.prev' }) }, icon('prev'));
    const goBtn = h('button', { class: 'btn btn-go btn-big', title: 'G', onclick: () => act({ type: 'agenda.next' }) });
    const rosPanel = h('section', { class: 'panel', 'aria-label': t('Ablaufplan') },
      h('div', { class: 'panel-head' }, h('h2', null, t('Ablaufplan')), h('div', { class: 'spacer' }), modeSeg),
      h('div', { class: 'row', style: { marginBottom: '12px' } },
        h('label', { class: 'field', style: { width: '130px' } }, h('span', null, t('Planbeginn')), plannedInput),
        h('label', { class: 'field', style: { width: '160px' }, 'data-manual': '' }, h('span', null, t('Steuert')), rosTimerSelect)),
      h('div', { class: 'ros-summary' }, statDrift, statEnd, statTotal),
      ros,
      h('div', { class: 'ros-go', 'data-manual': '' }, prevBtn, goBtn),
      h('div', { 'data-clock': '' }, schedCtl),
      h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Slot hinzufügen')),
        h('div', { class: 'ros-add' },
          h('label', { class: 'field ros-add-title' }, h('span', null, t('Titel')), addTitle),
          h('label', { class: 'field ros-add-speaker' }, h('span', null, t('Sprecher*in')), addSpeaker),
          h('label', { class: 'field' }, h('span', null, t('Von')), addFrom),
          h('label', { class: 'field' }, h('span', null, t('Bis')), addTo),
          h('label', { class: 'field ros-add-dur' }, h('span', null, t('oder Dauer (Min.)')), addDur),
          h('button', { class: 'btn ros-add-btn', onclick: addItem }, icon('plus'), t('Hinzufügen')))),
      h('div', { class: 'section row' },
        h('label', { class: 'switch', 'data-manual': '' }, autoToggle, t('Automatisch starten')),
        h('div', { class: 'spacer', style: { flex: 1 } }),
        importDetails,
        h('button', { class: 'btn btn-quiet', onclick: () => copy(exportText()) }, t('Als Text kopieren')),
        armed(h('button', { class: 'btn btn-quiet' }, t('Ablauf zurücksetzen')), () => act({ type: 'agenda.reset' }))));

    const desk = h('main', { class: 'desk' }, h('div', null, timerPanel), h('div', null, rosPanel));

    // gate (PIN)
    const pinInput = h('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('PIN eingeben') });
    const pinError = h('div', { class: 'gate-error', role: 'alert' });
    const gate = h('div', { class: 'gate', hidden: true },
      h('form', { onsubmit: e => { e.preventDefault(); pinError.textContent = ''; tr.auth(pinInput.value); } },
        h('h2', null, t('Steuerung gesperrt')),
        h('label', { class: 'field' }, h('span', null, t('PIN eingeben')), pinInput),
        pinError,
        h('button', { class: 'btn btn-go', type: 'submit' }, t('Entsperren')),
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { viewOnly = true; sync(); } }, t('Nur ansehen'))));
    tr.onAuth(ok => { if (!ok) { pinError.textContent = t('Falsche PIN'); pinInput.select(); } else { viewOnly = false; pinInput.value = ''; } });

    // drawer
    const drawerBody = h('div', { class: 'drawer-body' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const drawer = h('dialog', { class: 'drawer', 'aria-label': t('Einstellungen') },
      h('div', { class: 'drawer-head' }, h('h2', null, t('Einstellungen')),
        h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': 'Schließen', onclick: () => drawer.close() }, icon('close'))),
      tabs, drawerBody);
    drawer.addEventListener('click', e => { if (e.target === drawer) drawer.close(); });

    app.replaceChildren(topbar, banner, mv, desk, gate, drawer);

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
      if (!w) toast(t('Neues Fenster wurde blockiert – nutze „Bühnenansicht hier“.'));
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
    let tileKey = '';
    const tileViews = new Map();
    function buildTiles() {
      const s = S();
      const key = s.timers.map(x => x.id + ':' + x.name).join('|') + '#' + sel;
      if (key === tileKey) return;
      tileKey = key;
      mv.replaceChildren();
      tileViews.clear();
      s.timers.forEach((tm, i) => {
        const tile = h('button', { class: 'tile', 'aria-pressed': String(tm.id === sel), 'aria-label': `${tm.name} (${i + 1})`, onclick: () => select(tm.id) });
        const view = D.create(tile, { tile: true });
        const badge = h('span', { class: 'tile-badge', hidden: true });
        tile.append(h('span', { class: 'tile-label' }, h('b', null, String(i + 1)), ' ', tm.name), badge);
        mv.appendChild(tile);
        tileViews.set(tm.id, { tile, view, badge });
      });
      if (s.timers.length < E.MAX_TIMERS) {
        mv.appendChild(h('button', { class: 'tile-add', onclick: () => {
          const before = new Set(S().timers.map(x => x.id));
          act({ type: 'timer.add' });
          const added = S().timers.find(x => !before.has(x.id));
          if (added) select(added.id);
        } }, icon('plus'), t('Timer hinzufügen')));
      }
    }

    function select(id) {
      sel = id;
      store.set('et-sel', id);
      kindForced = null;
      tileKey = '';
      sync();
    }

    // --------------------------------------------------- agenda list
    let rosKey = '';
    function buildAgenda() {
      const s = S(), a = s.agenda;
      const clock = a.mode === 'clock';
      const sv = E.scheduleView(s, tr.now());
      const key = JSON.stringify([a.items, a.cursor, a.plannedStart, a.mode, a.shiftMs, a.holdAt != null, sv.rows.map(r => [r.start, r.end, r.status]), editingItem, t('Titel')]);
      if (key === rosKey) return;
      rosKey = key;
      ros.replaceChildren();
      if (!a.items.length) {
        ros.appendChild(h('li', { class: 'ros-empty' }, t('Noch kein Ablauf. Füge den ersten Slot hinzu oder importiere eine Liste.')));
        return;
      }
      a.items.forEach((it, i) => {
        const row = sv.rows[i];
        const status = clock
          ? (row.status === 'todo' && sv.next === row ? 'next' : row.status === 'unknown' ? 'todo' : row.status)
          : (i < a.cursor ? 'done' : i === a.cursor ? 'live' : i === a.cursor + 1 ? 'next' : 'todo');
        const when = row.start != null ? hhmm(row.start) : String(i + 1);
        if (editingItem === it.id) { ros.appendChild(editRow(it)); return; }
        let sub = null;
        if (status === 'done' && it.startedAt != null && it.endedAt != null) {
          const delta = (it.endedAt - it.startedAt) - it.durationMs;
          sub = h('small', { 'data-tone': delta > 30000 ? 'behind' : delta < -30000 ? 'ahead' : '' }, (delta >= 0 ? '+' : '−') + E.formatMs(Math.abs(delta)));
        } else if (status === 'live') sub = h('small', { 'data-live': it.id }, t('läuft'));
        else if (status === 'next') sub = h('small', null, t('als Nächstes'));
        if (clock && it.extraMs && status !== 'done') sub = h('small', { 'data-tone': it.extraMs > 0 ? 'behind' : 'ahead' }, (it.extraMs > 0 ? '+' : '−') + E.formatMs(Math.abs(it.extraMs)));
        ros.appendChild(h('li', { class: 'ros-row', 'data-status': status, 'data-item': it.id },
          clock && status === 'live' ? h('i', { class: 'ros-bar' }) : null,
          h('span', { class: 'ros-when' }, when, clock && row.end != null ? h('small', null, hhmm(row.end)) : null),
          h('span', { class: 'ros-what' }, h('b', null, it.title || '—'), it.speaker ? h('span', null, it.speaker) : null),
          h('span', { class: 'ros-dur' }, E.formatMs(it.durationMs), sub),
          h('span', { class: 'ros-actions' },
            clock ? null : h('button', { class: 'btn btn-quiet', title: t('Laden'), 'aria-label': t('Laden') + ': ' + it.title, onclick: () => act({ type: 'agenda.go', index: i }) }, icon('go')),
            h('button', { class: 'btn btn-quiet', title: t('Hoch'), 'aria-label': t('Hoch'), disabled: i === 0, onclick: () => act({ type: 'agenda.move', itemId: it.id, to: i - 1 }) }, icon('up')),
            h('button', { class: 'btn btn-quiet', title: t('Runter'), 'aria-label': t('Runter'), disabled: i === a.items.length - 1, onclick: () => act({ type: 'agenda.move', itemId: it.id, to: i + 1 }) }, icon('down')),
            h('button', { class: 'btn btn-quiet', title: t('Bearbeiten'), 'aria-label': t('Bearbeiten'), onclick: () => { editingItem = it.id; buildAgenda(); } }, icon('edit')))));
      });
    }

    function editRow(it) {
      const ti = h('input', { class: 'input', value: it.title, maxlength: 80, 'aria-label': t('Titel') });
      const sp = h('input', { class: 'input', value: it.speaker, maxlength: 80, placeholder: t('Sprecher*in'), 'aria-label': t('Sprecher*in') });
      const du = h('input', { class: 'input num', value: minutesLabel(it.durationMs), inputmode: 'decimal', 'aria-label': t('Dauer') });
      const fr = h('input', { class: 'input num', type: 'time', value: it.start || '', 'aria-label': t('Von') });
      const to = h('input', { class: 'input num', type: 'time', value: it.end || '', 'aria-label': t('Bis') });
      const save = () => {
        const ms = E.parseDuration(du.value);
        act({ type: 'agenda.update', itemId: it.id, patch: { title: ti.value, speaker: sp.value, start: fr.value, end: to.value, durationMs: ms == null ? it.durationMs : ms } });
        editingItem = null; buildAgenda();
      };
      [ti, sp, du, fr, to].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editingItem = null; buildAgenda(); } }));
      setTimeout(() => ti.focus(), 0);
      return h('li', { class: 'ros-edit' }, ti, sp,
        h('div', { class: 'ros-edit-times' },
          h('label', { class: 'field' }, h('span', null, t('Von')), fr),
          h('label', { class: 'field' }, h('span', null, t('Bis')), to),
          h('label', { class: 'field' }, h('span', null, t('oder Dauer (Min.)')), du)),
        h('div', { class: 'row' },
          armed(h('button', { class: 'btn btn-quiet' }, icon('trash'), t('Entfernen')), () => { editingItem = null; act({ type: 'agenda.remove', itemId: it.id }); }),
          h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-quiet', onclick: () => { editingItem = null; buildAgenda(); } }, t('Abbrechen')),
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
      transport.hidden = E.isStatic(shownKind);
      durSection.querySelector('[data-dur-title]').textContent = shownKind === 'countup' ? t('Optionales Limit') : t('Dauer');
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.ms) === tm.durationMs)));
      if (tm.kind === 'clock' && tm.targetLabel && !focused(targetInput)) targetInput.value = tm.targetLabel;

      const m = tm.message;
      msgPreview.firstChild.textContent = m.text || t('Keine Nachricht auf dem Display.');
      msgPreview.dataset.hidden = m.visible ? '0' : '1';
      [flashBtn, showBtn, clearBtn].forEach(b => { b.hidden = !m.text; });
      flashBtn.setAttribute('aria-pressed', String(m.flash));
      showBtn.textContent = m.visible ? t('Ausblenden') : t('Einblenden');
      const qkey = s.quickMessages.join('\n');
      if (quickRow.dataset.key !== qkey) {
        quickRow.dataset.key = qkey;
        quickRow.replaceChildren(...s.quickMessages.map(q => h('button', { class: 'chip', onclick: () => act({ type: 'timer.message', id: sel, text: q }) }, q)));
      }

      overtimeToggle.checked = tm.overtime;
      if (!focused(warnInput)) warnInput.value = tm.warnMs / MIN;
      if (!focused(critInput)) critInput.value = tm.critMs / MIN;
      const pkey = s.presets.map(p => p.id + p.name).join('|');
      if (presetSelect.dataset.key !== pkey) {
        presetSelect.dataset.key = pkey;
        presetSelect.replaceChildren(...s.presets.map(p => h('option', { value: p.id }, p.name)));
      }
      presetSelect.value = tm.presetId;

      const url = displayUrl(tm.id);
      if (linkRow.dataset.url !== url) {
        linkRow.dataset.url = url;
        linkRow.replaceChildren(h('div', { class: 'link-row' }, h('code', null, url),
          h('button', { class: 'btn', onclick: () => copy(url) }, icon('copy'), t('Kopieren')),
          h('button', { class: 'btn', onclick: () => openUrl(url) }, icon('open'), t('Öffnen'))));
      }
    }

    function syncAgendaControls() {
      const s = S(), a = s.agenda;
      if (!focused(plannedInput)) plannedInput.value = a.plannedStart;
      const tkey = s.timers.map(x => x.id + x.name).join('|');
      if (rosTimerSelect.dataset.key !== tkey) {
        rosTimerSelect.dataset.key = tkey;
        rosTimerSelect.replaceChildren(...s.timers.map(x => h('option', { value: x.id }, x.name)));
      }
      rosTimerSelect.value = a.timerId;
      autoToggle.checked = a.autoStart;
      const av = E.agendaView(s, tr.now());
      prevBtn.disabled = a.cursor <= 0;
      goBtn.disabled = !a.items.length || av.done;
      const clock = a.mode === 'clock';
      modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === a.mode)));
      rosPanel.querySelectorAll('[data-manual]').forEach(x => { x.hidden = clock; });
      rosPanel.querySelectorAll('[data-clock]').forEach(x => { x.hidden = !clock; });
      const held = a.holdAt != null;
      holdBtn.className = 'btn btn-big ' + (held ? 'btn-hold' : '');
      holdBtn.replaceChildren(icon(held ? 'play' : 'pause'), held ? t('Fortsetzen') : t('Anhalten'));
      const adj = schedCtl.querySelector('[data-adjust]');
      adj.textContent = a.shiftMs ? t('verschoben um') + ' ' + (a.shiftMs > 0 ? '+' : '−') + E.formatMs(Math.abs(a.shiftMs)) : '';
      const target = a.cursor < 0 ? a.items[0] : a.items[a.cursor + 1];
      goBtn.replaceChildren(icon('next'),
        h('span', { style: { display: 'grid', textAlign: 'left' } },
          av.done ? t('Ablauf beendet') : a.cursor < 0 ? t('Ablauf starten') : target ? t('Nächster Slot') : t('Ablauf beendet'),
          target && !av.done ? h('small', null, target.title) : null));
    }

    function sync() {
      const s = S();
      if (!s) return;
      const online = tr.status === 'online';
      conn.dataset.status = tr.status;
      const m = tr.meta || {};
      conn.lastChild.textContent = tr.mode === 'standalone' ? t('Nur dieses Gerät')
        : !online ? (tr.status === 'connecting' ? t('Verbinde …') : t('Getrennt – verbinde neu …'))
        : t('Verbunden') + (m.displays ? ` · ${m.displays} ${m.displays === 1 ? t('Display verbunden') : t('Displays verbunden')}` : '');
      if (!focused(titleInput)) titleInput.value = s.event.title;
      blackoutBtn.setAttribute('aria-pressed', String(s.blackout));

      const locked = tr.mode === 'server' && online && !tr.canControl();
      gate.hidden = !locked || viewOnly;
      if (locked && viewOnly) { banner.hidden = false; banner.dataset.tone = ''; banner.textContent = t('Nur-Ansicht: Zum Steuern PIN eingeben.'); banner.onclick = () => { viewOnly = false; sync(); }; }
      else if (tr.mode === 'standalone' && m.storageOk === false) { banner.hidden = false; banner.dataset.tone = 'stop'; banner.textContent = t('Speichern im Browser nicht möglich (privates Fenster?). Nach dem Schließen ist alles weg.'); }
      else banner.hidden = true;
      desk.inert = locked;
      mv.inert = false;

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
        for (const tm of s.timers) {
          const tv = tileViews.get(tm.id);
          if (!tv) continue;
          tv.view.update({ state: s, timer: tm, now, i18n: t });
          const v = E.timerView(tm, now);
          const sv = tm.kind === 'schedule' ? E.scheduleView(s, now) : null;
          const tally = tm.kind === 'time' ? '' : sv ? (sv.current && !sv.held ? (sv.remainingMs <= tm.critMs ? 'stop' : sv.remainingMs <= tm.warnMs ? 'warn' : 'go') : '') : v.state === 'running' || (tm.kind === 'clock' && v.state !== 'idle') ? (v.phase === 'normal' ? 'go' : v.phase === 'warn' ? 'warn' : 'stop') : v.state === 'finished' ? 'stop' : '';
          if (tv.tile.dataset.tally !== tally) tv.tile.dataset.tally = tally;
          const badge = v.state === 'paused' ? t('Pausiert') : (tm.message.visible ? '✉' : '');
          tv.badge.hidden = !badge;
          if (tv.badge.textContent !== badge) tv.badge.textContent = badge;
        }
        const tm = timer();
        if (tm) {
          const v = E.timerView(tm, now);
          const isTime = tm.kind === 'time';
          let txt = isTime ? D.clockText(now, true) : E.formatMs(v.ms, { up: tm.kind === 'countup' });
          let phase = v.phase, prog = v.progress, state = v.state;
          let st = isTime ? t('Zeigt die Uhrzeit') : stateLabel(v) + (v.over && v.state !== 'finished' ? ' · ' + t('Überzogen') : '');
          let sub = isTime ? '' : tm.kind === 'clock' ? (tm.targetLabel ? t('bis') + ' ' + tm.targetLabel : '') : (tm.durationMs ? t('von') + ' ' + E.formatMs(tm.durationMs) : '');
          if (tm.kind === 'schedule') {
            // follows the clock-driven run of show
            const sv = E.scheduleView(s, now);
            prog = 0; phase = 'normal'; state = 'running';
            if (sv.current) {
              txt = E.formatMs(sv.remainingMs);
              phase = sv.remainingMs <= tm.critMs ? 'crit' : sv.remainingMs <= tm.warnMs ? 'warn' : 'normal';
              prog = sv.progress;
              st = sv.current.item.title || t('Zeitplan');
              sub = sv.held ? t('Angehalten') : hhmm(sv.current.start) + '–' + hhmm(sv.current.end);
            } else if (sv.next) {
              txt = E.formatMs(sv.gapMs);
              st = t('Pause');
              sub = t('Weiter um') + ' ' + hhmm(sv.next.start);
            } else {
              txt = D.clockText(now, false);
              st = sv.ready ? t('Programm beendet') : t('Zeitplan ohne Uhrzeiten');
              sub = '';
            }
          }
          if (readTime.textContent !== txt) readTime.textContent = txt;
          readout.dataset.phase = phase;
          readout.dataset.state = state;
          if (readState.firstChild.textContent !== st) readState.firstChild.textContent = st;
          if (readState.lastChild.textContent !== sub) readState.lastChild.textContent = sub;
          readBar.style.width = (prog * 100).toFixed(2) + '%';
          const running = tm.running;
          const label = running ? 'pause' : 'play';
          if (playBtn.dataset.label !== label + v.state) {
            playBtn.dataset.label = label + v.state;
            playBtn.className = 'btn btn-big ' + (running ? 'btn-hold' : 'btn-go');
            playBtn.replaceChildren(icon(running ? 'pause' : 'play'), running ? t('Pause') : (v.state === 'paused' ? t('Weiter') : t('Start')));
            playBtn.disabled = tm.kind === 'clock' || v.state === 'finished';
          }
        }
        // run of show stats
        if (s.agenda.mode === 'clock') { tickSchedule(s, now); return; }
        statDrift.firstChild.textContent = t('Abweichung');
        statEnd.firstChild.textContent = t('Ende ca.');
        statTotal.firstChild.textContent = t('Geplant');
        const av = E.agendaView(s, now);
        const items = s.agenda.items;
        const d = av.drift;
        const tone = !av.started ? '' : d > 30000 ? 'behind' : d < -30000 ? 'ahead' : '';
        statDrift.dataset.tone = tone;
        const dt = !av.started ? '—' : Math.abs(d) < 1000 ? '±0' : (d > 0 ? '+' : '−') + E.formatMs(Math.abs(d));
        if (statDrift.lastChild.textContent !== dt) statDrift.lastChild.textContent = dt;
        const wallEnd = Date.now() + (av.projectedEnd - now);
        const et = items.length ? hhmm(wallEnd) : '—';
        if (statEnd.lastChild.textContent !== et) statEnd.lastChild.textContent = et;
        const tt = items.length ? E.formatMs(av.totalPlanned) : '—';
        if (statTotal.lastChild.textContent !== tt) statTotal.lastChild.textContent = tt;
        const live = ros.querySelector('[data-live]');
        if (live && av.current && av.current.startedAt != null) {
          const over = av.currentElapsed - av.current.durationMs;
          const txt = over > 0 ? '+' + E.formatMs(over) : t('läuft');
          if (live.textContent !== txt) live.textContent = txt;
          live.dataset.tone = over > 0 ? 'behind' : '';
        }
      }
    }

    /** Run of show driven by the clock: stats, live row bar, hold state. */
    function tickSchedule(s, now) {
      const v = E.scheduleView(s, now);
      const set = (el, label, value, tone) => {
        if (el.firstChild.textContent !== label) el.firstChild.textContent = label;
        if (el.lastChild.textContent !== value) el.lastChild.textContent = value;
        el.dataset.tone = tone || '';
      };
      if (v.current) set(statDrift, v.held ? t('Angehalten') : t('Noch'), E.formatMs(v.remainingMs), v.held ? 'behind' : '');
      else if (v.next) set(statDrift, t('Pause, weiter in'), E.formatMs(v.gapMs), '');
      else set(statDrift, t('Noch'), '—', '');
      set(statEnd, t('Danach'), v.next ? hhmm(v.next.start) : '—', '');
      set(statTotal, t('Ende'), v.endAt ? hhmm(v.endAt) : '—', '');
      const bar = ros.querySelector('.ros-bar');
      if (bar && v.current) bar.style.width = (v.progress * 100).toFixed(2) + '%';
      const live = ros.querySelector('[data-live]');
      if (live && v.current) {
        const txt = v.held ? t('Angehalten') : t('noch') + ' ' + E.formatMs(v.remainingMs);
        if (live.textContent !== txt) live.textContent = txt;
      }
      // statuses change with the clock → rebuild the list when a slot starts or ends
      const sig = v.rows.map(r => r.status).join();
      if (ros.dataset.sig !== sig) { ros.dataset.sig = sig; buildAgenda(); }
    }

    // ------------------------------------------------------- drawer
    const TABS = [['connect', 'Verbinden'], ['design', 'Design'], ['messages', 'Nachrichten'], ['security', 'Sicherheit'], ['companion', 'Companion'], ['more', 'Mehr']];
    let drawerKey = '';
    function openDrawer(tab) {
      if (tab) drawerTab = tab;
      drawerKey = '';
      renderDrawer();
      if (!drawer.open) drawer.showModal();
    }
    function renderDrawer() {
      const s = S();
      const key = JSON.stringify([drawerTab, designId, sel, root.ETUI.lang, tr.meta, s.presets, s.quickMessages, s.timers.map(x => [x.id, x.name, x.presetId])]);
      if (key === drawerKey) return;
      if (drawer.contains(document.activeElement) && document.activeElement.matches('input, textarea, select') && drawerTab !== 'connect') return;
      drawerKey = key;
      tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
        role: 'tab', 'aria-selected': String(id === drawerTab), onclick: () => { drawerTab = id; drawerKey = ''; renderDrawer(); },
      }, t(label))));
      const body = { connect: tabConnect, design: tabDesign, messages: tabMessages, security: tabSecurity, companion: tabCompanion, more: tabMore }[drawerTab]();
      drawerBody.replaceChildren(...[].concat(body));
    }

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
            h('span', null, t('Displays /1 bis /8, Zeitplan /plan, Uhr /uhr, Steuerung /control'))),
          linkLine(base + '/control'));
      } else {
        wrap.append(h('p', { class: 'help' }, t('Netzwerkname nicht verfügbar – bitte IP-Adresse oder QR-Code nutzen.')));
      }
      const nameIn = h('input', { class: 'input', value: m.name || 'event-timer', maxlength: 40, autocapitalize: 'off', spellcheck: 'false', 'aria-label': t('Name im Netzwerk') });
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
          h('label', { class: 'field', style: { flex: '1 1 200px' } }, h('span', null, t('Name im Netzwerk')), nameIn),
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
        out.push(h('p', null, t('Standalone-Modus: Alles läuft in diesem Browser. Displays im selben Browser (neues Fenster, z. B. auf dem zweiten Bildschirm) laufen automatisch mit.')));
        out.push(h('div', { class: 'row' },
          h('button', { class: 'btn btn-go', onclick: () => openUrl(viewUrl('display', { t: sel.slice(1) })) }, icon('open'), t('Display in neuem Fenster')),
          h('button', { class: 'btn', onclick: () => { drawer.close(); location.hash = 'display?t=' + sel.slice(1) + '&here=1'; } }, icon('full'), t('Bühnenansicht hier'))));
        out.push(h('p', { class: 'help' }, t('Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.')));
      } else {
        out.push(shortAddressSection());
        out.push(h('p', { class: 'help' }, t('Mit dem Handy scannen, um zu steuern oder anzuzeigen.')));
        out.push(h('div', { class: 'qr-grid' },
          qrCard(t('Steuerung'), viewUrl('control')),
          qrCard(timer().name, displayUrl(sel)),
          qrCard(t('Ablauf-Display'), viewUrl('agenda'))));
        out.push(linkLine(viewUrl('control')));
        s.timers.forEach(x => out.push(linkLine(displayUrl(x.id))));
        out.push(linkLine(viewUrl('agenda')));
        out.push(linkLine(baseUrl() + '/uhr'));
        out.push(linkLine(baseUrl() + '/plan'));
        const m = tr.meta || {};
        if (m.hostname) out.push(h('p', { class: 'help' }, t('Per Rechnername') + ': ', h('b', null, `http://${m.hostname}:${m.port}/control`)));
        out.push(h('p', { class: 'help' }, t('Klappt der Link nicht? Beim ersten Start fragt Windows nach der Firewall – „Private Netzwerke“ erlauben.')));
      }
      // display link builder
      const layoutSel = h('select', { class: 'input' },
        [['full', 'Vollbild-Timer'], ['plan', 'Zeitplan (Moderation)'], ['time', 'Nur Uhrzeit'], ['clock', 'Uhrzeit groß'], ['lower', 'Bauchbinde (Keying)'], ['agenda', 'Ablauf (Backstage)']].map(([v, l]) => h('option', { value: v }, t(l))));
      const timerSel = h('select', { class: 'input' }, s.timers.map(x => h('option', { value: x.id.slice(1) }, x.name)));
      timerSel.value = sel.slice(1);
      const transp = h('input', { type: 'checkbox' });
      const out2 = h('div');
      const upd = () => {
        const params = { t: timerSel.value };
        if (layoutSel.value !== 'full') params.layout = layoutSel.value;
        if (transp.checked) params.bg = 'transparent';
        out2.replaceChildren(linkLine(viewUrl('display', params)));
      };
      [layoutSel, timerSel, transp].forEach(x => x.addEventListener('change', upd));
      upd();
      out.push(h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Link für Displays bauen')),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', null, 'Timer'), timerSel),
          h('label', { class: 'field' }, h('span', null, t('Ansicht')), layoutSel)),
        h('label', { class: 'switch', style: { margin: '10px 0' } }, transp, t('Transparenter Hintergrund')),
        out2));
      return out;
    }

    function tabDesign() {
      const s = S();
      const tm = timer();
      if (!designId || !s.presets.some(p => p.id === designId)) designId = tm.presetId;
      const p = s.presets.find(x => x.id === designId);
      const draft = JSON.parse(JSON.stringify(p));
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
          colorField('warn', 'Warnung'), colorField('crit', 'Kritisch'), colorField('overBg', 'Überzogen Hintergrund'),
          colorField('overFg', 'Überzogen Ziffern'), colorField('msgBg', 'Nachricht Fläche'), colorField('msgFg', 'Nachricht Text')),
        h('div', { class: 'grid2' },
          selField('font', 'Schrift', [['din', 'DIN / Bahnschrift'], ['grotesk', 'Grotesk'], ['mono', 'Monospace'], ['serif', 'Serif'], ['rounded', 'Rounded']]),
          selField('weight', 'Stärke', [[400, '400'], [500, '500'], [600, '600'], [700, '700'], [800, '800'], [900, '900']]),
          selField('bgStyle', 'Fläche', [['solid', 'Einfarbig'], ['glow', 'Leuchten'], ['transparent', 'Transparent']])),
        h('div', { class: 'grid2' },
          boolField('showProgress', 'Fortschrittsbalken'), boolField('showClock', 'Uhrzeit'), boolField('showTitle', 'Titel und Sprecher*in'),
          boolField('showNext', 'Nächster Slot anzeigen'), boolField('showNotice', 'Hinweise'), boolField('flashOver', 'Blinken beim Überziehen')),
        h('div', { class: 'grid2' }, textField('warnText', 'Text bei Warnung'), textField('expiredText', 'Text bei Ablauf'), textField('overText', 'Text beim Überziehen')),
        actions,
      ];
    }

    function tabMessages() {
      const s = S();
      const ta = h('textarea', { class: 'input', rows: 8 }, s.quickMessages.join('\n'));
      return [
        h('label', { class: 'field' }, h('span', null, t('Schnellnachrichten')), ta),
        h('p', { class: 'help' }, t('Eine pro Zeile, höchstens 12.')),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-go', onclick: () => { act({ type: 'quick.set', list: ta.value.split(/\r?\n/) }); toast(t('Speichern')); } }, t('Speichern'))),
      ];
    }

    function tabSecurity() {
      if (tr.mode === 'standalone') return [h('p', null, t('PIN im Standalone-Modus nicht nötig.'))];
      const m = tr.meta || {};
      const pin = h('input', { class: 'input num', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: 32 });
      return [
        h('p', null, m.pinRequired ? t('Steuerung ist mit PIN geschützt.') : t('Keine PIN gesetzt – jedes Gerät im Netzwerk kann steuern.')),
        h('p', { class: 'help' }, t('Mit PIN dürfen nur Geräte steuern, die sie kennen. Displays brauchen nie eine PIN; am Rechner selbst ist keine nötig.')),
        h('label', { class: 'field' }, h('span', null, t('Steuerungs-PIN')), pin),
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
      const keys = [['Leertaste', 'Start/Pause'], ['R', 'Zurücksetzen'], ['↑ / ↓', '±1:00'], ['← / →', '±0:10'], ['G', 'Nächster Slot im Ablauf'], ['B', 'Blackout'], ['1 … 8', 'Timer wählen']];
      const out = [
        h('label', { class: 'field' }, h('span', null, t('Sprache')), langSel),
        h('div', null, h('h3', { class: 'section-title' }, t('Tastenkürzel')),
          h('div', { class: 'grid2' }, keys.map(([k, v]) => h('div', null, h('b', { class: 'num' }, t(k)), ' ', h('span', { class: 'muted' }, t(v)))))),
        h('p', { class: 'help' }, t('Version') + ' ' + (m.version || root.ET_VERSION || '1.0.0') + (m.dataPath ? ' · ' + t('Speicherort') + ': ' + m.dataPath : tr.mode === 'standalone' ? ' · ' + t('Speichert in diesem Browser.') : '')),
      ];
      if (tr.mode === 'standalone') {
        out.push(h('div', { class: 'section' },
          h('p', { class: 'help', style: { marginBottom: '8px' } }, t('Löscht alle Timer, den Ablauf und eigene Designs in diesem Browser.')),
          armed(h('button', { class: 'btn btn-stop' }, t('Show zurücksetzen')), () => { tr.replaceState(E.defaultState()); select('t1'); drawer.close(); })));
      }
      return out;
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
      else if (/^[1-8]$/.test(k)) { const tm = S().timers[Number(k) - 1]; if (tm) select(tm.id); }
    };
    document.addEventListener('keydown', onKey);

    const unsubscribe = tr.subscribe(sync);
    sync();
    let alive = true;
    const loop = () => { if (!alive) return; tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return () => { alive = false; unsubscribe(); document.removeEventListener('keydown', onKey); if (drawer.open) drawer.close(); };
  }

  root.ETControl = { mount };
})(globalThis);
