/*
 * Pages for people outside the control room:
 *  /moderation – the presenter's phone/tablet: time left, programme, talkback, buttons that talk to the Regie
 *  /cues       – a second operator desk (light, video) watching the cue list
 */
(function (root) {
  'use strict';
  const E = root.ETEngine, D = root.ETDisplay;
  const { h, icon, toast, t } = root.ETUI;
  const store = root.ETTransport.store;
  const hm = ms => D.clockText(ms, false);

  /** What the presenter needs to know right now: slot, time left, progress. */
  function nowInfo(s, now, timerId) {
    const a = s.agenda;
    if (a.mode === 'clock' && a.items.length) {
      const sv = E.scheduleView(s, now);
      if (sv.current) return { title: sv.current.item.title, ms: sv.remainingMs, sub: sv.held ? t('Hold aktiv') : hm(sv.current.start) + '–' + hm(sv.current.end), progress: sv.progress, next: sv.next ? hm(sv.next.start) + ' ' + sv.next.item.title : '', note: sv.current.item.note || '' };
      if (sv.next) return { title: t('Pause'), ms: sv.gapMs, sub: t('Weiter um') + ' ' + hm(sv.next.start), progress: 0, next: sv.next.item.title };
      return { title: sv.ready ? t('Programm beendet') : s.event.title || 'Event Timer', ms: null, sub: '', progress: 0, next: '' };
    }
    const tm = s.timers.find(x => x.id === timerId) || s.timers.find(x => x.id === a.timerId) || s.timers[0];
    const v = E.timerView(tm, now);
    const seg = tm.segmentId ? a.items.find(x => x.id === tm.segmentId) : null;
    const nextSeg = seg ? a.items[a.items.indexOf(seg) + 1] : null;
    return {
      title: seg ? seg.title : tm.name, ms: E.isStatic(tm.kind) ? null : v.ms, up: tm.kind === 'countup', phase: v.phase,
      sub: { running: t('Läuft'), paused: t('Pausiert'), idle: t('Bereit'), finished: t('Abgelaufen') }[v.state] || '',
      progress: v.progress, next: nextSeg ? nextSeg.title : '', note: seg ? seg.note || '' : '',
    };
  }

  // ------------------------------------------------------------ /moderation
  function mountModeration(app, tr, params) {
    document.title = t('Moderation') + ' – Event Timer';
    let me = store.get('et-from') || t('Moderation');
    const timerId = params.get('t') ? 't' + params.get('t') : null;

    const conn = h('i', { class: 'mod-dot' });
    const who = h('button', { class: 'chip', title: t('Name ändern') });
    const event = h('span', { class: 'mod-event' });
    const title = h('div', { class: 'mod-title' });
    const drift = h('span', { class: 'mod-drift', hidden: true });
    const time = h('div', { class: 'mod-time num' });
    const sub = h('div', { class: 'mod-sub' });
    const bar = h('i');
    const next = h('div', { class: 'mod-next' });
    const note = h('div', { class: 'mod-note', hidden: true });
    const msg = h('div', { class: 'mod-msg', hidden: true });
    // talkback from the Regie: big, impossible to miss, one tap to confirm
    const talkText = h('div', { class: 'mod-talk-text' });
    const talkMeta = h('small');
    const talkBtn = h('button', { class: 'btn btn-go mod-talk-ok', onclick: () => tr.talkAck() }, icon('check'), t('Verstanden'));
    const talk = h('section', { class: 'mod-talk', hidden: true, role: 'alert' },
      h('div', { class: 'mod-talk-head' }, icon('talk'), h('b', null, t('Talkback')), talkMeta), talkText, talkBtn);
    const grid = h('div', { class: 'mod-grid' });
    const input = h('input', { class: 'input', placeholder: t('Freitext an die Regie'), maxlength: 120, enterkeyhint: 'send' });
    const mine = h('ol', { class: 'mod-mine' });
    const prog = h('ol', { class: 'mod-prog-list' });
    const progSection = h('section', { class: 'mod-prog', hidden: true }, h('h2', { class: 'mod-h' }, t('Programm')), prog);

    let lastSend = 0;
    const send = text => {
      if (!text || !text.trim()) return;
      // the server accepts one message per 1.5 s per device – say so instead of losing it
      if (Date.now() - lastSend < 1600) { toast(t('Bitte kurz warten')); return; }
      lastSend = Date.now();
      tr.request(text.trim(), me);
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch { /* ignore */ } }
      toast(t('Gesendet'));
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { send(input.value); input.value = ''; } });
    who.addEventListener('click', () => {
      const field = h('input', { class: 'input', value: me, maxlength: 30, 'aria-label': t('Name ändern') });
      const done = () => { me = field.value.trim() || t('Moderation'); store.set('et-from', me); field.replaceWith(who); render(); };
      field.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
      field.addEventListener('blur', done);
      who.replaceWith(field);
      field.focus();
      field.select();
    });

    // left = what is happening now, right = buttons, programme and what I sent.
    // Phones and portrait tablets get one column; see app.css.
    app.replaceChildren(h('div', { class: 'mod' },
      h('div', { class: 'mod-col mod-col-info' },
        h('header', { class: 'mod-head' }, conn, event, who),
        talk,
        h('section', { class: 'mod-now', 'aria-live': 'polite' },
          h('div', { class: 'mod-now-head' }, title, drift), time, sub, h('div', { class: 'mod-bar' }, bar), next, note),
        msg),
      h('div', { class: 'mod-col mod-col-act' },
        h('h2', { class: 'mod-h' }, t('Meldung an die Regie')),
        grid,
        h('div', { class: 'row mod-free' }, h('div', { style: { flex: '1 1 200px' } }, input),
          h('button', { class: 'btn btn-go', onclick: () => { send(input.value); input.value = ''; } }, t('Senden'))),
        progSection,
        h('h2', { class: 'mod-h mod-sent-h' }, t('Gesendet')),
        mine)));

    let gridKey = '';
    const seenTalk = new Set();
    let talkInit = false;
    function render() {
      const s = tr.state;
      if (!s) return;
      conn.dataset.status = tr.status;
      who.textContent = me;
      event.textContent = s.event.title || 'Event Timer';
      const key = (s.stageQuick || []).join('\n');
      if (key !== gridKey) {
        gridKey = key;
        grid.replaceChildren(...(s.stageQuick || []).map(q => h('button', { class: 'mod-btn', onclick: () => send(q) }, q)));
      }
      const tm = s.timers.find(x => x.id === timerId) || s.timers[0];
      const m = tm && tm.message;
      msg.hidden = !(m && m.visible && m.text);
      if (!msg.hidden) msg.textContent = m.text;
      // talkback: everything not yet confirmed, newest first
      const openTalk = (s.talkback || []).filter(k => k.ackAt == null);
      const tkey = openTalk.map(k => k.id).join();
      if (talk.dataset.key !== tkey) {
        const fresh = openTalk.some(k => !seenTalk.has(k.id));
        openTalk.forEach(k => seenTalk.add(k.id));
        talk.dataset.key = tkey;
        talk.hidden = !openTalk.length;
        if (openTalk.length) {
          const last = openTalk[openTalk.length - 1];
          talkText.replaceChildren(...openTalk.slice(-3).reverse().map(k => h('p', null, k.text)));
          talkMeta.textContent = hm(last.at) + (openTalk.length > 1 ? ' · ' + openTalk.length + ' ' + t('offen') : '');
          if (fresh && talkInit && navigator.vibrate) { try { navigator.vibrate([80, 60, 80]); } catch { /* ignore */ } }
        }
      }
      talkInit = true;
      const list = s.requests.filter(r => r.from === me).slice(-6).reverse();
      mine.replaceChildren(...(list.length ? list.map(r => h('li', { 'data-ack': r.ack ? 1 : 0 },
        h('span', null, r.text), h('small', null, hm(r.at) + ' · ' + (r.ack ? t('bestätigt') + ' ✓' : t('gesendet'))))) : [h('li', { class: 'muted' }, t('Noch nichts gesendet.'))]));
    }
    const off = tr.subscribe(render);
    render();

    /** Programme list: same times the Regie sees, done items dimmed, live item with a bar. */
    let progKey = '';
    let progBar = null;
    function renderProgram(s, now) {
      const a = s.agenda;
      progSection.hidden = !a.items.length;
      if (!a.items.length) return;
      const clock = a.mode === 'clock';
      const sv = E.scheduleView(s, now);
      const rows = a.items.map((it, i) => {
        const r = sv.rows[i];
        const status = clock
          ? (r.status === 'unknown' ? 'todo' : r.status === 'todo' && sv.next === r ? 'next' : r.status)
          : (i < a.cursor ? 'done' : i === a.cursor ? 'live' : i === a.cursor + 1 ? 'next' : 'todo');
        return { it, status, start: r.start, end: r.end };
      });
      const key = JSON.stringify(rows.map(x => [x.it.id, x.it.title, x.it.speaker, x.it.note, x.it.durationMs, x.start, x.end, x.status])) + root.ETUI.lang;
      if (key !== progKey) {
        progKey = key;
        progBar = null;
        prog.replaceChildren(...rows.map(x => {
          const li = h('li', { 'data-status': x.status },
            h('span', { class: 'mod-prog-time num' }, x.start != null ? hm(x.start) : '–'),
            h('span', { class: 'mod-prog-what' }, h('b', null, x.it.title || '—'),
              x.it.speaker ? h('span', null, x.it.speaker) : null,
              x.it.note ? h('em', null, t('Hinweis') + ': ' + x.it.note) : null),
            h('span', { class: 'mod-prog-dur num' }, x.end != null && clock ? t('bis') + ' ' + hm(x.end) : E.formatMs(x.it.durationMs)));
          if (x.status === 'live') { progBar = h('i', { class: 'mod-prog-bar' }); li.prepend(progBar); }
          return li;
        }));
        // keep the live item in view
        const live = prog.querySelector('[data-status="live"]');
        if (live) setTimeout(() => { prog.scrollTop = Math.max(0, live.offsetTop - prog.offsetTop - 40); }, 0);
      }
      if (progBar) {
        let p = 0;
        if (clock) p = sv.current ? sv.progress : 0;
        else {
          const av = E.agendaView(s, now);
          p = av.current && av.current.startedAt != null && av.current.durationMs ? Math.min(1, av.currentElapsed / av.current.durationMs) : 0;
        }
        progBar.style.width = (p * 100).toFixed(1) + '%';
      }
      // deviation in words – manual run of show only (by the clock the plan itself moves)
      let dt = '';
      if (!clock) {
        const av = E.agendaView(s, now);
        if (av.started && !av.done && Math.abs(av.drift) >= 30000) dt = E.formatMs(Math.abs(av.drift)) + ' ' + (av.drift > 0 ? t('hinter Plan') : t('vor Plan'));
        drift.dataset.tone = av.drift > 0 ? 'behind' : 'ahead';
      }
      if (drift.textContent !== dt) drift.textContent = dt;
      drift.hidden = !dt;
    }

    // keep the phone/tablet awake while the page is open
    let wakeLock = null;
    const keepAwake = async () => {
      if (wakeLock || document.hidden || !('wakeLock' in navigator)) return;
      try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* needs a tap first */ }
    };
    const onVis = () => { if (!document.hidden) keepAwake(); };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('pointerdown', keepAwake);
    keepAwake();

    let alive = true;
    const loop = () => {
      if (!alive) return;
      const s = tr.state;
      if (s) {
        const now = tr.now();
        const info = nowInfo(s, now, timerId);
        const txt = info.ms == null ? D.clockText(now, false) : E.formatMs(info.ms, { up: info.up });
        if (time.textContent !== txt) time.textContent = txt;
        if (title.textContent !== info.title) title.textContent = info.title;
        if (sub.textContent !== info.sub) sub.textContent = info.sub;
        const nx = info.next ? t('Danach') + ': ' + info.next : '';
        if (next.textContent !== nx) next.textContent = nx;
        const nt = info.note ? t('Hinweis') + ': ' + info.note : '';
        if (note.textContent !== nt) note.textContent = nt;
        note.hidden = !nt;
        bar.style.width = ((info.progress || 0) * 100).toFixed(1) + '%';
        time.dataset.phase = info.phase || (info.ms != null && info.ms < 60000 ? 'crit' : info.ms != null && info.ms < 300000 ? 'warn' : 'normal');
        renderProgram(s, now);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      alive = false; off();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerdown', keepAwake);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }

  // ------------------------------------------------------------------ /cues
  function mountCues(app, tr) {
    document.title = t('Cues') + ' – Event Timer';
    const head = h('div', { class: 'cues-head' }, h('b', null, t('Cues')), h('span'));
    const list = h('ol', { class: 'cues-big' });
    app.replaceChildren(h('div', { class: 'cues-page' }, head, list));
    let sig = '';
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const s = tr.state;
      if (s) {
        const now = tr.now();
        head.lastChild.textContent = (s.event.title ? s.event.title + '   ' : '') + D.clockText(now, true);
        const shown = E.cueView(s, now).filter(c => c.status !== 'done' && c.status !== 'missed').slice(0, 8);
        const k = shown.map(c => c.cue.id + c.status + c.cue.text).join('|');
        if (k !== sig) {
          sig = k;
          list.replaceChildren(...(shown.length ? shown.map(c => h('li', { 'data-status': c.status, 'data-cue': c.cue.id },
            h('span', { class: 'cue-pill num' }), h('b', null, c.cue.text), h('span', null, c.item.title))) : [h('li', { class: 'muted' }, t('Keine offenen Cues'))]));
        }
        shown.forEach(c => {
          const pill = list.querySelector(`[data-cue="${c.cue.id}"] .cue-pill`);
          const txt = c.status === 'go' ? 'GO' : c.status === 'ready' ? t('Auf Abruf') : c.inMs != null ? E.formatMs(c.inMs) : t('wartet');
          if (pill && pill.textContent !== txt) pill.textContent = txt;
        });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { alive = false; };
  }

  root.ETStage = { mountModeration, mountCues };
})(globalThis);
