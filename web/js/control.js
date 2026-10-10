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
    /** Small keyboard hint inside a button (hidden on touch devices). */
    const kbd = k => h('kbd', null, k);
    const conn = h('div', { class: 'conn', 'data-status': 'connecting' }, h('i'), h('span'));
    const titleInput = h('input', { class: 'event-title', placeholder: t('Name der Veranstaltung'), maxlength: 80, 'aria-label': t('Name der Veranstaltung') });
    titleInput.addEventListener('change', () => act({ type: 'event.update', title: titleInput.value }));
    const hdrClock = h('div', { class: 'hdr-clock num', 'aria-label': t('Uhrzeit') }, '--:--:--');
    const blackoutBtn = h('button', { class: 'btn btn-stop', 'aria-pressed': 'false', onclick: () => act({ type: 'blackout.toggle' }) }, t('All Blackout'), kbd('B'));
    const menuBtn = h('button', { class: 'btn btn-icon', 'aria-label': t('Menü'), title: t('Menü'), onclick: () => openDrawer() }, icon('menu'));
    const topbar = h('header', { class: 'topbar' },
      h('div', { class: 'brand', html: root.ETUI.brandSvg + '<span>Event Timer</span>' }),
      titleInput,
      hdrClock,
      h('div', { class: 'topbar-right' }, conn, blackoutBtn, menuBtn));

    const banner = h('div', { class: 'banner', hidden: true });
    // pinned alert zone: messages from the stage and cues waiting for GO never scroll away
    const alerts = h('div', { class: 'alerts', 'aria-live': 'assertive' });
    const topWrap = h('div', { class: 'top' }, topbar, banner, alerts);
    const mv = h('div', { class: 'mv', role: 'toolbar', 'aria-label': 'Timer' });

    // timer panel
    const nameInput = h('input', { class: 'name-input', maxlength: 40, 'aria-label': t('Name') });
    nameInput.addEventListener('change', () => act({ type: 'timer.update', id: sel, patch: { name: nameInput.value } }));
    const kindSeg = h('div', { class: 'seg', role: 'group' });
    const kinds = [['countdown', 'Countdown'], ['countup', 'Count-up'], ['clock', 'Zielzeit'], ['time', 'Uhrzeit'], ['schedule', 'Ablaufplan']];
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
    const readState = h('div', { class: 'readout-state' }, h('b'), h('span'));
    const readBar = h('i');
    const readout = h('div', { class: 'readout' }, readTime, readState, h('div', { class: 'readout-bar' }, readBar));

    const playBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => act({ type: 'timer.toggle', id: sel }) });
    const resetBtn = h('button', { class: 'btn btn-big', onclick: () => act({ type: 'timer.reset', id: sel }) }, icon('reset'), t('Reset'), kbd('R'));
    const transport = h('div', { class: 'transport' }, playBtn, resetBtn);
    const nudges = h('div', { class: 'nudges' },
      [[-MIN, '−1:00', '↓'], [-10000, '−0:10', '←'], [10000, '+0:10', '→'], [MIN, '+1:00', '↑']].map(([ms, label, key]) =>
        h('button', { class: 'btn', onclick: () => act({ type: 'timer.adjust', id: sel, ms }) }, label, kbd(key))));

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
        h('button', { class: 'btn', title: '↵', onclick: () => setDur(false) }, t('Set')),
        h('button', { class: 'btn', title: '⇧ ↵', onclick: () => setDur(true) }, icon('play'), t('Set & Go'))));

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

    // DSM overlay (message on the downstage monitor)
    const msgInput = h('input', { class: 'input', placeholder: t('Text für DSM'), maxlength: 280, 'aria-label': t('Text für DSM') });
    const sendMsg = () => { if (msgInput.value.trim()) { act({ type: 'timer.message', id: sel, text: msgInput.value }); msgInput.value = ''; } };
    msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
    const quickRow = h('div', { class: 'row', style: { marginTop: '10px' } });
    const flashBtn = h('button', { class: 'btn', 'aria-pressed': 'false', onclick: () => act({ type: 'timer.message', id: sel, flash: !timer().message.flash }) }, t('Blinken'));
    const showBtn = h('button', { class: 'btn', onclick: () => act({ type: 'timer.message', id: sel, visible: !timer().message.visible }) });
    const clearBtn = h('button', { class: 'btn btn-quiet', onclick: () => act({ type: 'timer.messageClear', id: sel }) }, icon('trash'), t('Löschen'));
    const msgBadge = h('span', { class: 'badge' });
    const msgText = h('div', { class: 'msg-card-text' });
    const msgCard = h('div', { class: 'msg-card', 'data-state': 'empty' },
      h('div', { class: 'msg-card-head' }, msgBadge, h('span', { class: 'spacer' }), flashBtn, showBtn, clearBtn),
      msgText);
    const msgSection = h('div', { class: 'section' },
      h('h3', { class: 'section-title' }, t('DSM-Einblendung')),
      msgCard,
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { style: { flex: '1 1 200px' } }, msgInput), h('button', { class: 'btn btn-go', onclick: sendMsg }, t('Senden'))),
      quickRow);

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

    const linkRow = h('div', { class: 'links' });
    const linkSection = h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('DSM-Link')), linkRow);

    const timerPanel = h('section', { class: 'panel', 'aria-label': 'Timer' },
      h('div', { class: 'panel-head' }, nameInput, kindSeg, removeBtn),
      readout, transport, nudges, durSection, targetSection, msgSection, optSection, linkSection);

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
          h('span', { class: 'help' }, t('Ersetzt den bisherigen Ablauf.')))));

    const modeSeg = h('div', { class: 'seg seg-wide', role: 'group', 'aria-label': t('Ablaufplan') },
      [['manual', 'Manuell weiterschalten'], ['clock', 'Automatisch nach Uhrzeit']].map(([m, l]) => h('button', { 'data-mode': m, 'aria-pressed': 'false', onclick: () => act({ type: 'agenda.settings', mode: m }) }, t(l))));
    const modeHelp = h('p', { class: 'help mode-help' });
    let ripple = store.get('et-ripple') !== '0';
    const rippleToggle = h('input', { type: 'checkbox' });
    rippleToggle.checked = ripple;
    rippleToggle.addEventListener('change', () => { ripple = rippleToggle.checked; store.set('et-ripple', ripple ? '1' : '0'); });
    const sched = () => E.scheduleView(S(), tr.now());
    const extendCurrent = ms => { const v = sched(); if (v.current) act({ type: 'agenda.adjust', itemId: v.current.item.id, ms, ripple }); };
    const holdBtn = h('button', { class: 'btn btn-big', onclick: () => {
      const a = S().agenda;
      if (a.holdAt == null) { act({ type: 'agenda.hold' }); return; }
      // resume: the item that was running when we stopped gets the held time, everything after moves along
      const v = sched();
      if (v.current) act({ type: 'agenda.resume', itemId: v.current.item.id });
      else if (v.next && v.next.index > 0) act({ type: 'agenda.resume', itemId: v.rows[v.next.index - 1].item.id, mode: 'after' });
      else act({ type: 'agenda.resume' });
    } });
    const nowBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => { const v = sched(); if (v.current) act({ type: 'agenda.adjust', itemId: v.current.item.id, ms: -Math.max(1000, v.remainingMs), ripple }); } }, icon('next'), t('Punkt jetzt beenden'));
    const schedCtl = h('div', { class: 'sched-ctl' },
      h('div', { class: 'sched-main' }, holdBtn, nowBtn),
      h('div', { class: 'row' },
        h('span', { class: 'help sched-label' }, t('Laufender Punkt')),
        h('button', { class: 'btn num', onclick: () => extendCurrent(-5 * MIN) }, '−5'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(-MIN) }, '−1'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(MIN) }, '+1'),
        h('button', { class: 'btn num', onclick: () => extendCurrent(5 * MIN) }, '+5'),
        h('label', { class: 'switch' }, rippleToggle, t('Nachfolgende Punkte mitverschieben'))),
      h('div', { class: 'row' },
        h('span', { class: 'help sched-label' }, t('Gesamtplan')),
        h('button', { class: 'btn num', onclick: () => act({ type: 'agenda.shift', ms: -5 * MIN }) }, '−5'),
        h('button', { class: 'btn num', onclick: () => act({ type: 'agenda.shift', ms: 5 * MIN }) }, '+5'),
        h('span', { class: 'help', 'data-adjust': '' }),
        h('span', { style: { flex: 1 } }),
        armed(h('button', { class: 'btn btn-quiet' }, t('Originalplan wiederherstellen')), () => act({ type: 'agenda.clearAdjust' }))));

    const prevBtn = h('button', { class: 'btn btn-big', 'aria-label': t('Zurück'), onclick: () => act({ type: 'agenda.prev' }) }, icon('prev'));
    const goBtn = h('button', { class: 'btn btn-go btn-big', onclick: () => act({ type: 'agenda.next' }) });
    const rosPanel = h('section', { class: 'panel', 'aria-label': t('Ablaufplan') },
      h('div', { class: 'panel-head' }, h('h2', null, t('Ablaufplan'))),
      modeSeg, modeHelp,
      h('div', { class: 'row', style: { marginBottom: '12px' } },
        h('label', { class: 'field', style: { width: '130px' } }, h('span', null, t('Planbeginn')), plannedInput),
        h('label', { class: 'field', style: { width: '180px' }, 'data-manual': '' }, h('span', null, t('Verknüpfter Timer')), rosTimerSelect)),
      h('div', { class: 'ros-summary' }, statDrift, statEnd, statTotal),
      ros,
      h('div', { class: 'ros-go', 'data-manual': '' }, prevBtn, goBtn),
      h('div', { 'data-clock': '' }, schedCtl),
      h('div', { class: 'section' },
        h('h3', { class: 'section-title' }, t('Programmpunkt hinzufügen')),
        h('div', { class: 'ros-add' },
          h('label', { class: 'field ros-add-title' }, h('span', null, t('Titel')), addTitle),
          h('label', { class: 'field ros-add-speaker' }, h('span', null, t('Sprecher*in')), addSpeaker),
          h('label', { class: 'field' }, h('span', null, t('Beginn')), addFrom),
          h('label', { class: 'field' }, h('span', null, t('Ende')), addTo),
          h('label', { class: 'field ros-add-dur' }, h('span', null, t('oder Dauer (Min.)')), addDur),
          h('button', { class: 'btn ros-add-btn', onclick: addItem }, icon('plus'), t('Hinzufügen')))),
      h('div', { class: 'section row' },
        h('label', { class: 'switch', 'data-manual': '' }, autoToggle, t('Timer automatisch starten')),
        h('div', { class: 'spacer', style: { flex: 1 } }),
        importDetails,
        h('button', { class: 'btn btn-quiet', onclick: () => copy(exportText()) }, t('Als Text exportieren')),
        armed(h('button', { class: 'btn btn-quiet' }, t('Ablauf zurücksetzen')), () => act({ type: 'agenda.reset' }))));

    // ------------------------------------------------------- cue bar
    const cueList = h('ol', { class: 'cue-list' });
    const cueCount = h('span', { class: 'help' });
    const cuePanel = h('section', { class: 'panel cue-panel', 'aria-label': t('Cues'), hidden: true },
      h('div', { class: 'panel-head' }, h('h2', null, t('Cues')), cueCount, h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet', onclick: () => openUrl(tr.mode === 'standalone' ? viewUrl('cues') : baseUrl() + '/cues') }, icon('open'), t('Cue-Display'))),
      cueList);
    const goCue = c => act({ type: 'cue.done', itemId: c.item.id, cueId: c.cue.id });
    const cuePillText = c => (c.status === 'go' ? 'GO' : c.status === 'ready' ? t('Auf Abruf') : c.inMs != null ? E.formatMs(c.inMs) : t('wartet'));
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
      cuePanel.hidden = !all.length;
      if (all.length) {
        const active = all.filter(c => c.status === 'go' || c.status === 'standby' || c.status === 'ready');
        const later = all.filter(c => c.status === 'later').slice(0, Math.max(0, 5 - active.length));
        cueShown = active.concat(later);
        const sig = cueShown.map(c => c.cue.id + c.status + c.cue.text + c.cue.offsetMs + c.cue.ref).join('|') + root.ETUI.lang;
        if (sig !== cueSig) {
          cueSig = sig;
          const rows = cueShown.map((c, i) => h('li', { class: 'cue-row', 'data-status': c.status, 'data-cue': c.cue.id },
            h('span', { class: 'cue-pill num' }),
            h('span', { class: 'cue-what' }, h('b', null, c.cue.text), h('span', null, c.item.title), h('small', null, cueWhen(c.cue))),
            h('button', { class: 'btn ' + (c.status === 'go' ? 'btn-go' : ''), onclick: () => goCue(c) }, 'GO', i === 0 ? kbd('C') : null)));
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
      } else {
        cueShown = [];
      }
      syncAlerts(s);
    }

    // ------------------------------------------------- talkback (Regie → Moderation)
    const talkInput = h('input', { class: 'input', placeholder: t('Freitext an die Moderation'), maxlength: 120, 'aria-label': t('Freitext an die Moderation') });
    const sendTalk = text => { if (text && text.trim()) act({ type: 'talkback.send', text: text.trim() }); };
    talkInput.addEventListener('keydown', e => { if (e.key === 'Enter') { sendTalk(talkInput.value); talkInput.value = ''; } });
    const talkQuickRow = h('div', { class: 'row' });
    const talkLog = h('ol', { class: 'talk-log' });
    const talkClear = armed(h('button', { class: 'btn btn-quiet' }, t('Verlauf löschen')), () => act({ type: 'talkback.clear' }));
    const talkPanel = h('section', { class: 'panel talk-panel', 'aria-label': t('Talkback') },
      h('div', { class: 'panel-head' }, icon('talk'), h('h2', null, t('Talkback')), h('span', { class: 'help' }, t('an die Moderation')), h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet', onclick: () => openUrl(tr.mode === 'standalone' ? viewUrl('moderation') : baseUrl() + '/moderation') }, icon('open'), '/moderation')),
      talkQuickRow,
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { style: { flex: '1 1 200px' } }, talkInput),
        h('button', { class: 'btn btn-go', onclick: () => { sendTalk(talkInput.value); talkInput.value = ''; } }, t('Senden'))),
      talkLog,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, talkClear));
    function syncTalk(s) {
      const qk = (s.talkQuick || []).join('\n');
      if (talkQuickRow.dataset.key !== qk) {
        talkQuickRow.dataset.key = qk;
        talkQuickRow.replaceChildren(...(s.talkQuick || []).map(q => h('button', { class: 'chip', onclick: () => sendTalk(q) }, q)));
      }
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
    let actx = null;
    const soundOn = () => store.get('et-req-sound') !== '0';
    const unlockAudio = () => {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
      } catch { /* no audio */ }
    };
    document.addEventListener('pointerdown', unlockAudio);
    function beep() {
      if (!actx) return;
      try {
        const t0 = actx.currentTime;
        [[0, 880], [0.2, 660]].forEach(([d, f]) => {
          const o = actx.createOscillator(), g = actx.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t0 + d);
          g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
          o.connect(g).connect(actx.destination);
          o.start(t0 + d);
          o.stop(t0 + d + 0.2);
        });
      } catch { /* no audio */ }
    }
    /** Alert zone: open messages from the stage + cues that are due. */
    function syncAlerts(s) {
      const open = s.requests.filter(r => !r.ack);
      const key = open.map(r => r.id).join() + '#' + goCues.map(c => c.cue.id).join() + root.ETUI.lang;
      if (alerts.dataset.key !== key) {
        alerts.dataset.key = key;
        const items = open.slice(-4).reverse().map(r => h('div', { class: 'alert alert-req', role: 'alert' }, icon('bell'),
          h('div', { class: 'alert-text' }, h('b', null, r.text), h('span', null, t('Meldung') + ' · ' + r.from + ' · ' + hhmm(r.at))),
          h('button', { class: 'btn', onclick: () => act({ type: 'request.ack', requestId: r.id }) }, icon('check'), t('Bestätigen'))));
        if (open.length > 1) items.push(h('button', { class: 'btn btn-quiet alert-all', onclick: () => act({ type: 'request.ackAll' }) }, t('Alle bestätigen')));
        goCues.slice(0, 3).forEach((c, i) => items.push(h('div', { class: 'alert alert-cue', role: 'alert' }, h('span', { class: 'cue-pill num' }, 'GO'),
          h('div', { class: 'alert-text' }, h('b', null, c.cue.text), h('span', null, t('Cue') + ' · ' + c.item.title)),
          h('button', { class: 'btn btn-go', onclick: () => goCue(c) }, 'GO', i === 0 ? kbd('C') : null))));
        alerts.replaceChildren(...items);
      }
      const fresh = open.filter(r => !seenReq.has(r.id));
      open.forEach(r => seenReq.add(r.id));
      if (reqInit && fresh.length && soundOn()) beep();
      reqInit = true;
      const n = open.length + goCues.length;
      const title = (n ? `(${n}) ` : '') + 'Event Timer – ' + t('Regie');
      if (document.title !== title) document.title = title;
    }

    // columns: 1 (phone/tablet) · 2 (laptop) · 3 (≥ 1600 px)
    const cols = [h('div', { class: 'col' }), h('div', { class: 'col' }), h('div', { class: 'col' })];
    const desk = h('main', { class: 'desk' }, ...cols);
    const mq3 = window.matchMedia('(min-width: 1600px)');
    const mq2 = window.matchMedia('(min-width: 1100px)');
    function layoutDesk() {
      const n = mq3.matches ? 3 : mq2.matches ? 2 : 1;
      desk.dataset.cols = n;
      if (n === 3) { cols[0].append(timerPanel); cols[1].append(rosPanel); cols[2].append(cuePanel, talkPanel); }
      else if (n === 2) { cols[0].append(timerPanel, talkPanel); cols[1].append(cuePanel, rosPanel); }
      else cols[0].append(timerPanel, cuePanel, rosPanel, talkPanel);
      cols.forEach((c, i) => { c.hidden = i >= n; });
    }
    mq3.addEventListener('change', layoutDesk);
    mq2.addEventListener('change', layoutDesk);
    layoutDesk();

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

    app.replaceChildren(topWrap, mv, desk, gate, drawer);

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
        ros.appendChild(h('li', { class: 'ros-empty' }, t('Noch kein Ablauf. Füge den ersten Programmpunkt hinzu oder importiere eine Liste.')));
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
          h('span', { class: 'ros-what' }, h('b', null, it.title || '—'), it.speaker ? h('span', null, it.speaker) : null,
            it.cues && it.cues.length ? h('span', { class: 'ros-cues' }, it.cues.length + ' ' + t(it.cues.length === 1 ? 'Cue' : 'Cues')) : null),
          h('span', { class: 'ros-dur' }, E.formatMs(it.durationMs), sub),
          h('span', { class: 'ros-actions' },
            clock ? null : h('button', { class: 'btn btn-quiet', title: t('Laden'), 'aria-label': t('Laden') + ': ' + it.title, onclick: () => act({ type: 'agenda.go', index: i }) }, icon('go')),
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
      if (!editDraft || editDraft.id !== it.id) editDraft = { id: it.id, title: it.title, speaker: it.speaker, dur: minutesLabel(it.durationMs), start: it.start || '', end: it.end || '' };
      const dr = editDraft;
      const ti = h('input', { class: 'input', value: dr.title, maxlength: 80, 'aria-label': t('Titel') });
      const sp = h('input', { class: 'input', value: dr.speaker, maxlength: 80, placeholder: t('Sprecher*in'), 'aria-label': t('Sprecher*in') });
      const du = h('input', { class: 'input num', value: dr.dur, inputmode: 'decimal', 'aria-label': t('Dauer') });
      const fr = h('input', { class: 'input num', type: 'time', value: dr.start, 'aria-label': t('Beginn') });
      const to = h('input', { class: 'input num', type: 'time', value: dr.end, 'aria-label': t('Ende') });
      [[ti, 'title'], [sp, 'speaker'], [du, 'dur'], [fr, 'start'], [to, 'end']].forEach(([el, k]) => el.addEventListener('input', () => { dr[k] = el.value; }));
      const cueEd = h('div', { class: 'cue-edit' },
        h('span', { class: 'help' }, t('Cues')),
        ...(it.cues || []).map(c => cueEditRow(it, c)),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-quiet', onclick: () => act({ type: 'cue.add', itemId: it.id, text: t('Neuer Cue'), ref: 'start', offsetMs: 0 }) }, icon('plus'), t('Cue hinzufügen'))));
      const save = () => {
        const ms = E.parseDuration(du.value);
        act({ type: 'agenda.update', itemId: it.id, patch: { title: ti.value, speaker: sp.value, start: fr.value, end: to.value, durationMs: ms == null ? it.durationMs : ms } });
        editingItem = null; editDraft = null; buildAgenda();
      };
      [ti, sp, du, fr, to].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editingItem = null; editDraft = null; buildAgenda(); } }));
      setTimeout(() => ti.focus(), 0);
      return h('li', { class: 'ros-edit' }, ti, sp,
        h('div', { class: 'ros-edit-times' },
          h('label', { class: 'field' }, h('span', null, t('Beginn')), fr),
          h('label', { class: 'field' }, h('span', null, t('Ende')), to),
          h('label', { class: 'field' }, h('span', null, t('oder Dauer (Min.)')), du)),
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
      transport.hidden = E.isStatic(shownKind);
      durSection.querySelector('[data-dur-title]').textContent = shownKind === 'countup' ? t('Limit (optional)') : t('Dauer');
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.ms) === tm.durationMs)));
      if (tm.kind === 'clock' && tm.targetLabel && !focused(targetInput)) targetInput.value = tm.targetLabel;

      const m = tm.message;
      const mstate = !m.text ? 'empty' : m.visible ? 'live' : 'hidden';
      msgCard.dataset.state = mstate;
      msgCard.dataset.flash = m.flash && mstate === 'live' ? '1' : '0';
      msgBadge.textContent = { empty: t('Keine Einblendung aktiv'), live: t('LIVE auf DSM'), hidden: t('Ausgeblendet') }[mstate];
      msgText.textContent = m.text;
      msgText.hidden = !m.text;
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
      const preset = s.presets.find(p => p.id === tm.presetId);
      // closed options still tell what is set
      const summary = [preset ? preset.name : '', t('Vorwarnung') + ' ' + minutesLabel(tm.warnMs), t('Kritisch') + ' ' + minutesLabel(tm.critMs), tm.overtime ? t('Überzeit an') : t('Überzeit aus')].filter(Boolean).join(' · ');
      if (optSummary.textContent !== summary) optSummary.textContent = summary;

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
      const help = clock
        ? t('Programmpunkte beginnen und enden nach ihren Uhrzeiten. Eingreifen mit Hold, ± Minuten oder „Punkt jetzt beenden“.')
        : t('Du schaltest jeden Programmpunkt selbst weiter (Taste G). Der verknüpfte Timer zählt die geplante Dauer herunter.');
      if (modeHelp.textContent !== help) modeHelp.textContent = help;
      rosPanel.querySelectorAll('[data-manual]').forEach(x => { x.hidden = clock; });
      rosPanel.querySelectorAll('[data-clock]').forEach(x => { x.hidden = !clock; });
      const held = a.holdAt != null;
      holdBtn.className = 'btn btn-big ' + (held ? 'btn-hold' : '');
      holdBtn.replaceChildren(icon(held ? 'play' : 'pause'), held ? t('Fortsetzen') : t('Hold'));
      const adj = schedCtl.querySelector('[data-adjust]');
      adj.textContent = a.shiftMs ? t('verschoben um') + ' ' + (a.shiftMs > 0 ? '+' : '−') + E.formatMs(Math.abs(a.shiftMs)) : '';
      const target = a.cursor < 0 ? a.items[0] : a.items[a.cursor + 1];
      goBtn.replaceChildren(icon('next'),
        h('span', { style: { display: 'grid', textAlign: 'left' } },
          av.done ? t('Ablauf beendet') : a.cursor < 0 ? t('Ablauf starten') : target ? t('Nächster Punkt') : t('Ablauf beendet'),
          target && !av.done ? h('small', null, target.title) : null),
        av.done ? null : kbd('G'));
    }

    function sync() {
      const s = S();
      if (!s) return;
      const online = tr.status === 'online';
      conn.dataset.status = tr.status;
      const m = tr.meta || {};
      const ct = tr.mode === 'standalone' ? t('Nur dieses Gerät')
        : !online ? (tr.status === 'connecting' ? t('Verbinde …') : t('Verbindung getrennt – verbinde neu …'))
        : t('Verbunden') + (m.displays ? ` · ${m.displays} ${m.displays === 1 ? t('Display') : t('Displays')}` : '');
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
        for (const tm of s.timers) {
          const tv = tileViews.get(tm.id);
          if (!tv) continue;
          tv.view.update({ state: s, timer: tm, now, i18n: t });
          const v = E.timerView(tm, now);
          const sv = tm.kind === 'schedule' ? E.scheduleView(s, now) : null;
          const tally = tm.kind === 'time' ? '' : sv ? (sv.current && !sv.held ? (sv.remainingMs <= tm.critMs ? 'stop' : sv.remainingMs <= tm.warnMs ? 'warn' : 'go') : '') : v.state === 'running' || (tm.kind === 'clock' && v.state !== 'idle') ? (v.phase === 'normal' ? 'go' : v.phase === 'warn' ? 'warn' : 'stop') : v.state === 'finished' ? 'stop' : '';
          if (tv.tile.dataset.tally !== tally) tv.tile.dataset.tally = tally;
          const badge = v.state === 'paused' ? t('Pausiert') : (tm.message.visible ? 'LIVE' : '');
          tv.badge.hidden = !badge;
          if (tv.badge.textContent !== badge) tv.badge.textContent = badge;
        }
        const tm = timer();
        if (tm) {
          const v = E.timerView(tm, now);
          const isTime = tm.kind === 'time';
          let txt = isTime ? D.clockText(now, true) : E.formatMs(v.ms, { up: tm.kind === 'countup' });
          let phase = v.phase, prog = v.progress, state = v.state;
          let st = isTime ? t('Zeigt die Uhrzeit') : stateLabel(v) + (v.over && v.state !== 'finished' ? ' · ' + t('Überzeit') : '');
          let sub = isTime ? '' : tm.kind === 'clock' ? (tm.targetLabel ? t('bis') + ' ' + tm.targetLabel : '') : (tm.durationMs ? t('von') + ' ' + E.formatMs(tm.durationMs) : '');
          if (tm.kind === 'schedule') {
            // follows the clock-driven run of show
            const sv = E.scheduleView(s, now);
            prog = 0; phase = 'normal'; state = 'running';
            if (sv.current) {
              txt = E.formatMs(sv.remainingMs);
              phase = sv.remainingMs <= tm.critMs ? 'crit' : sv.remainingMs <= tm.warnMs ? 'warn' : 'normal';
              prog = sv.progress;
              st = sv.current.item.title || t('Ablaufplan');
              sub = sv.held ? t('Hold aktiv') : hhmm(sv.current.start) + '–' + hhmm(sv.current.end);
            } else if (sv.next) {
              txt = E.formatMs(sv.gapMs);
              st = t('Pause');
              sub = t('Weiter um') + ' ' + hhmm(sv.next.start);
            } else {
              txt = D.clockText(now, false);
              st = sv.ready ? t('Programm beendet') : t('Ablaufplan ohne Uhrzeiten');
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
            playBtn.replaceChildren(icon(running ? 'pause' : 'play'), running ? t('Pause') : (v.state === 'paused' ? t('Fortsetzen') : t('Start')), kbd(t('Leertaste')));
            playBtn.disabled = tm.kind === 'clock' || v.state === 'finished';
          }
        }
        // run of show stats
        if (s.agenda.mode === 'clock') { tickSchedule(s, now); return; }
        const av = E.agendaView(s, now);
        const items = s.agenda.items;
        const d = av.drift;
        // drift in words: "4:50 vor Plan" reads faster than "−04:50"
        const tone = !av.started ? '' : d > 30000 ? 'behind' : d < -30000 ? 'ahead' : '';
        const dt = !av.started ? '—' : Math.abs(d) < 1000 ? '0:00' : E.formatMs(Math.abs(d));
        const dn = !av.started ? '' : Math.abs(d) < 30000 ? t('im Plan') : d > 0 ? t('hinter Plan') : t('vor Plan');
        setStat(statDrift, t('Abweichung vom Plan'), dt, tone, dn);
        const wallEnd = Date.now() + (av.projectedEnd - now);
        setStat(statEnd, t('Voraussichtliches Ende'), items.length ? hhmm(wallEnd) : '—', '', '');
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

    /** Run of show driven by the clock: stats, live row bar, hold state. */
    function tickSchedule(s, now) {
      const v = E.scheduleView(s, now);
      if (v.current) setStat(statDrift, v.held ? t('Hold aktiv') : t('Restzeit'), E.formatMs(v.remainingMs), v.held ? 'behind' : '', '');
      else if (v.next) setStat(statDrift, t('Pause – weiter in'), E.formatMs(v.gapMs), '', '');
      else setStat(statDrift, t('Restzeit'), '—', '', '');
      setStat(statEnd, t('Danach'), v.next ? hhmm(v.next.start) : '—', '', v.next ? v.next.item.title : '');
      setStat(statTotal, t('Ende'), v.endAt ? hhmm(v.endAt) : '—', '', '');
      const bar = ros.querySelector('.ros-bar');
      if (bar && v.current) bar.style.width = (v.progress * 100).toFixed(2) + '%';
      const live = ros.querySelector('[data-live]');
      if (live && v.current) {
        const txt = v.held ? t('Hold aktiv') : t('noch') + ' ' + E.formatMs(v.remainingMs);
        if (live.textContent !== txt) live.textContent = txt;
      }
      // statuses change with the clock → rebuild the list when an item starts or ends
      const sig = v.rows.map(r => r.status).join();
      if (ros.dataset.sig !== sig) { ros.dataset.sig = sig; buildAgenda(); }
    }
    // ------------------------------------------------------- drawer
    const TABS = [['connect', 'Verbindung'], ['design', 'Design'], ['messages', 'Schnellnachrichten'], ['security', 'Sicherheit'], ['companion', 'Companion'], ['more', 'System']];
    let drawerKey = '';
    function openDrawer(tab) {
      if (tab) drawerTab = tab;
      drawerKey = '';
      renderDrawer();
      if (!drawer.open) drawer.showModal();
    }
    function renderDrawer() {
      const s = S();
      const key = JSON.stringify([drawerTab, designId, sel, root.ETUI.lang, tr.meta, s.presets, s.quickMessages, s.stageQuick, s.talkQuick, s.timers.map(x => [x.id, x.name, x.presetId])]);
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
            h('span', null, t('DSM /1 bis /8 · Ablauf /plan · Uhr /uhr · Regie /control'))),
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
        out.push(h('p', null, t('Standalone-Modus: Alles läuft in diesem Browser. Displays im selben Browser (neues Fenster, z. B. auf dem zweiten Bildschirm) laufen automatisch mit.')));
        out.push(h('div', { class: 'row' },
          h('button', { class: 'btn btn-go', onclick: () => openUrl(viewUrl('display', { t: sel.slice(1) })) }, icon('open'), t('DSM in neuem Fenster')),
          h('button', { class: 'btn', onclick: () => { drawer.close(); location.hash = 'display?t=' + sel.slice(1) + '&here=1'; } }, icon('full'), t('DSM hier öffnen'))));
        out.push(h('p', { class: 'help' }, t('Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.')));
      } else {
        out.push(shortAddressSection());
        out.push(h('p', { class: 'help' }, t('Mit dem Handy scannen, um zu steuern oder anzuzeigen.')));
        out.push(h('div', { class: 'qr-grid' },
          qrCard(t('Regie'), viewUrl('control')),
          qrCard(timer().name, displayUrl(sel)),
          qrCard(t('Moderation'), baseUrl() + '/moderation')));
        out.push(linkLine(viewUrl('control')));
        s.timers.forEach(x => out.push(linkLine(displayUrl(x.id))));
        out.push(linkLine(viewUrl('agenda')));
        out.push(linkLine(baseUrl() + '/uhr'));
        out.push(linkLine(baseUrl() + '/plan'));
        out.push(linkLine(baseUrl() + '/moderation'));
        out.push(linkLine(baseUrl() + '/cues'));
        const m = tr.meta || {};
        if (m.hostname) out.push(h('p', { class: 'help' }, t('Per Rechnername') + ': ', h('b', null, `http://${m.hostname}:${m.port}/control`)));
        out.push(h('p', { class: 'help' }, t('Klappt der Link nicht? Beim ersten Start fragt Windows nach der Firewall – „Private Netzwerke“ erlauben.')));
      }
      // display link builder
      const layoutSel = h('select', { class: 'input' },
        [['full', 'Vollbild-Timer'], ['plan', 'Ablaufplan (Moderation)'], ['time', 'Nur Uhrzeit'], ['clock', 'Uhrzeit groß'], ['lower', 'Bauchbinde (Keying)'], ['agenda', 'Ablauf (Backstage)']].map(([v, l]) => h('option', { value: v }, t(l))));
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
        h('h3', { class: 'section-title' }, t('DSM-Link erstellen')),
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
          colorField('warn', 'Warnung'), colorField('crit', 'Kritisch'), colorField('overBg', 'Überzeit Hintergrund'),
          colorField('overFg', 'Überzeit Ziffern'), colorField('msgBg', 'Einblendung Fläche'), colorField('msgFg', 'Einblendung Text')),
        h('div', { class: 'grid2' },
          selField('font', 'Schrift', [['din', 'DIN / Bahnschrift'], ['grotesk', 'Grotesk'], ['mono', 'Monospace'], ['serif', 'Serif'], ['rounded', 'Rounded']]),
          selField('weight', 'Stärke', [[400, '400'], [500, '500'], [600, '600'], [700, '700'], [800, '800'], [900, '900']]),
          selField('bgStyle', 'Fläche', [['solid', 'Einfarbig'], ['glow', 'Leuchten'], ['transparent', 'Transparent']])),
        h('div', { class: 'grid2' },
          boolField('showProgress', 'Fortschrittsbalken'), boolField('showClock', 'Uhrzeit'), boolField('showTitle', 'Titel und Sprecher*in'),
          boolField('showNext', 'Nächsten Programmpunkt anzeigen'), boolField('showNotice', 'Hinweise'), boolField('flashOver', 'Blinken bei Überzeit')),
        h('div', { class: 'grid2' }, textField('warnText', 'Text bei Warnung'), textField('expiredText', 'Text bei Ablauf'), textField('overText', 'Text bei Überzeit')),
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
        h('p', { class: 'help' }, t('Mit PIN dürfen nur Geräte steuern, die sie kennen. Displays brauchen nie eine PIN; am Rechner selbst ist keine nötig.')),
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
      const snd = h('input', { type: 'checkbox' });
      snd.checked = soundOn();
      snd.addEventListener('change', () => { store.set('et-req-sound', snd.checked ? '1' : '0'); if (snd.checked) { unlockAudio(); beep(); } });
      const keys = [['Leertaste', 'Start/Pause'], ['R', 'Reset'], ['↑ / ↓', '±1:00'], ['← / →', '±0:10'], ['⇧ ↵', 'Set & Go'], ['G', 'Nächster Programmpunkt'], ['C', 'Nächsten Cue auslösen (GO)'], ['B', 'All Blackout'], ['1 … 8', 'Timer wählen']];
      const out = [
        h('label', { class: 'field' }, h('span', null, t('Sprache')), langSel),
        h('label', { class: 'switch' }, snd, t('Signalton bei Meldungen')),
        h('div', null, h('h3', { class: 'section-title' }, t('Tastenkürzel')),
          h('div', { class: 'grid2' }, keys.map(([k, v]) => h('div', null, h('b', { class: 'num' }, t(k)), ' ', h('span', { class: 'muted' }, t(v)))))),
        h('p', { class: 'help' }, t('Version') + ' ' + (m.version || root.ET_VERSION || '1.5.0') + (m.dataPath ? ' · ' + t('Speicherort') + ': ' + m.dataPath : tr.mode === 'standalone' ? ' · ' + t('Speichert in diesem Browser.') : '')),
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
      else if (k === 'c' || k === 'C') { const c = goCues[0] || cueShown.find(x => x.status === 'go' || x.status === 'standby' || x.status === 'ready'); if (c) goCue(c); }
      else if (/^[1-8]$/.test(k)) { const tm = S().timers[Number(k) - 1]; if (tm) select(tm.id); }
    };
    document.addEventListener('keydown', onKey);

    const unsubscribe = tr.subscribe(sync);
    sync();
    let alive = true;
    const loop = () => { if (!alive) return; tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return () => { alive = false; unsubscribe(); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', unlockAudio); if (drawer.open) drawer.close(); };
  }

  root.ETControl = { mount };
})(globalThis);
