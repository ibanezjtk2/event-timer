/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Display renderer. The same code draws the full-screen stage display and
 * the small live tiles in the control room, so what you see is what the
 * speaker sees. Sizing uses container query units → scales to any box.
 */
(function (root) {
  'use strict';
  const E = root.ETEngine;

  const FONT_STACKS = {
    din: '"Bahnschrift", "DIN Alternate", "DIN Next", "D-DIN", "Barlow", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
    grotesk: '"Helvetica Neue", "Inter", "Segoe UI", Roboto, Arial, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace',
    serif: '"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif',
  };

  const pad = n => String(n).padStart(2, '0');
  const clockText = (ms, secs) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (secs ? ':' + pad(d.getSeconds()) : ''); };

  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function setAttr(node, k, v) {
    const s = String(v);
    if (node.getAttribute(k) !== s) node.setAttribute(k, s);
  }

  function applyPreset(node, p, transparent) {
    const key = JSON.stringify(p) + transparent;
    if (node._presetKey === key) return;
    node._presetKey = key;
    const st = node.style;
    st.setProperty('--d-bg', transparent ? 'transparent' : p.bg);
    st.setProperty('--d-fg', p.fg);
    st.setProperty('--d-accent', p.accent);
    st.setProperty('--d-warn', p.warn);
    st.setProperty('--d-crit', p.crit);
    st.setProperty('--d-overbg', transparent ? 'transparent' : p.overBg);
    st.setProperty('--d-overfg', p.overFg);
    st.setProperty('--d-msgfg', p.msgFg);
    st.setProperty('--d-msgbg', p.msgBg);
    st.setProperty('--d-font', FONT_STACKS[p.font] || FONT_STACKS.din);
    st.setProperty('--d-weight', p.weight);
    setAttr(node, 'data-bgstyle', transparent ? 'transparent' : p.bgStyle);
  }

  /**
   * create(container, { layout }) → { update(ctx), root }
   * ctx: { state, timer, now, layout, transparent, show:{clock,title,progress,next,notice} }
   */
  function create(container, opts) {
    const o = opts || {};
    const r = el('div', 'dsp', container);
    if (o.tile) r.classList.add('dsp-tile');
    const top = el('div', 'dsp-top', r);
    const title = el('div', 'dsp-title', top);
    const clock = el('div', 'dsp-clock', top);
    const main = el('div', 'dsp-main', r);
    const time = el('div', 'dsp-time', main);
    const sub = el('div', 'dsp-sub', main);
    const notice = el('div', 'dsp-notice', r);
    const msg = el('div', 'dsp-msg', r);
    const msgText = el('div', 'dsp-msg-text', msg);
    const bottom = el('div', 'dsp-bottom', r);
    const speaker = el('div', 'dsp-speaker', bottom);
    const next = el('div', 'dsp-next', bottom);
    const prog = el('div', 'dsp-progress', r);
    const bar = el('i', null, prog);
    const blk = el('div', 'dsp-blackout', r);
    const list = el('ol', 'dsp-list', r);
    let listKey = '';

    function update(ctx) {
      const s = ctx.state;
      const t = ctx.timer;
      if (!s || !t) { setAttr(r, 'data-empty', 1); return; }
      r.removeAttribute('data-empty');
      const label = ctx.i18n || (x => x);
      const p = s.presets.find(x => x.id === t.presetId) || s.presets[0];
      const layout = ctx.layout || 'full';
      applyPreset(r, p, ctx.transparent);
      const v = E.timerView(t, ctx.now);
      const wall = ctx.wallNow || Date.now();
      // wall-clock mode: timer kind "time" or the /clock layout
      const isTime = t.kind === 'time' || layout === 'time';
      // clock-driven schedule: timer kind "schedule" or the /plan layout
      const isSched = !isTime && (t.kind === 'schedule' || layout === 'plan');

      let txt = isTime ? clockText(wall, ctx.seconds !== false) : E.formatMs(v.ms, { up: t.kind === 'countup' });
      let phase = isTime ? 'normal' : v.phase;
      let state = isTime ? 'running' : v.state;
      let progress = v.progress;
      const seg = t.segmentId ? s.agenda.items.find(x => x.id === t.segmentId) : null;
      let titleText = seg ? seg.title : (s.event.title || '');
      let speakerText = seg ? seg.speaker : '';
      let subText = t.kind === 'clock' && t.targetLabel ? label('bis') + ' ' + t.targetLabel : '';
      let nextText = '';
      if (seg) {
        const n = s.agenda.items[s.agenda.items.indexOf(seg) + 1];
        if (n) nextText = label('Danach') + ': ' + n.title + (n.speaker ? ' – ' + n.speaker : '');
      }

      let sv = null;
      if (isSched) {
        sv = E.scheduleView(s, wall);
        const hm = ms => clockText(ms, false);
        progress = 0;
        nextText = '';
        if (sv.current) {
          const c = sv.current;
          txt = E.formatMs(sv.remainingMs);
          phase = sv.remainingMs <= t.critMs ? 'crit' : sv.remainingMs <= t.warnMs ? 'warn' : 'normal';
          state = sv.held ? 'paused' : 'running';
          progress = sv.progress;
          titleText = c.item.title;
          speakerText = c.item.speaker;
          subText = sv.held ? label('Hold aktiv') : hm(c.start) + ' – ' + hm(c.end);
          if (sv.next) nextText = label('Danach') + ' ' + hm(sv.next.start) + ': ' + sv.next.item.title;
        } else if (sv.next) {
          txt = E.formatMs(sv.gapMs);
          phase = 'normal';
          state = 'paused';
          titleText = sv.rows.some(x => x.status === 'done') ? label('Pause') : (s.event.title || label('Gleich geht es los'));
          speakerText = '';
          subText = (sv.held ? label('Hold aktiv') + ' · ' : '') + label('Weiter um') + ' ' + hm(sv.next.start) + ': ' + sv.next.item.title;
        } else {
          txt = clockText(wall, false);
          phase = 'normal';
          state = 'idle';
          titleText = sv.finished ? label('Programm beendet') : label('Ablaufplan ohne Uhrzeiten');
          speakerText = '';
          subText = '';
        }
      }
      const showOver = phase === 'over';
      setAttr(r, 'data-kind', isTime ? 'time' : t.kind);
      setAttr(r, 'data-sched', isSched ? 1 : 0);
      setAttr(r, 'data-flashover', p.flashOver === false ? 0 : 1);
      // the /plan view uses the backstage layout, filled from the schedule
      setAttr(r, 'data-layout', layout === 'plan' ? 'agenda' : layout);
      setAttr(r, 'data-phase', phase);
      setAttr(r, 'data-state', state);
      setAttr(r, 'data-len', Math.min(9, txt.length));
      setAttr(r, 'data-blackout', s.blackout && !o.tile ? 1 : 0);
      setAttr(r, 'data-weight', p.weight);
      setText(time, txt);
      setText(sub, subText);

      const showTitle = layout !== 'time' && (isSched || (ctx.show ? ctx.show.title : p.showTitle));
      setText(title, showTitle ? titleText : '');
      setText(speaker, showTitle ? speakerText : '');
      const showClock = ctx.show ? ctx.show.clock : p.showClock;
      setText(clock, (showClock || layout === 'plan') && !isTime ? clockText(wall, false) : '');

      const showNext = layout !== 'time' && (isSched || (ctx.show ? ctx.show.next : p.showNext));
      setText(next, showNext ? nextText : '');

      const showNotice = ctx.show ? ctx.show.notice : p.showNotice;
      let noticeText = '';
      if (showNotice && !isTime && !isSched) {
        if (v.state === 'finished') noticeText = p.expiredText;
        else if (showOver) noticeText = p.overText;
        else if (phase === 'warn' || phase === 'crit') noticeText = state === 'running' ? p.warnText : '';
      }
      setText(notice, noticeText);
      setAttr(notice, 'data-on', noticeText ? 1 : 0);

      const m = t.message;
      const msgOn = m.visible && m.text && layout !== 'time' ? 1 : 0;
      setAttr(r, 'data-msg', msgOn);
      setAttr(msg, 'data-flash', msgOn && m.flash ? 1 : 0);
      setText(msgText, msgOn ? m.text : '');
      setAttr(msg, 'data-long', m.text.length > 60 ? 2 : m.text.length > 24 ? 1 : 0);

      const showProgress = isSched ? Boolean(sv && sv.current) : (ctx.show ? ctx.show.progress : p.showProgress) && !isTime && t.kind !== 'clock' && t.durationMs > 0;
      setAttr(prog, 'data-on', showProgress ? 1 : 0);
      const w = (progress * 100).toFixed(2) + '%';
      if (bar.style.width !== w) bar.style.width = w;

      if (layout === 'clock') setText(clock, clockText(wall, true));
      if (layout === 'agenda') renderList(s, ctx);
      if (layout === 'plan') renderPlan(sv, ctx);
    }

    let liveBar = null;
    function renderPlan(sv, ctx) {
      const label = ctx.i18n || (x => x);
      const key = JSON.stringify(sv.rows.map(x => [x.item.id, x.item.title, x.item.speaker, x.start, x.end, x.status]));
      if (key !== listKey) {
        listKey = key;
        list.innerHTML = '';
        liveBar = null;
        sv.rows.forEach(row => {
          const li = el('li', 'dsp-row', list);
          li.dataset.status = row.status === 'unknown' ? 'todo' : row.status;
          el('span', 'dsp-row-time', li).textContent = row.start != null ? clockText(row.start, false) : '–';
          const tx = el('span', 'dsp-row-text', li);
          el('b', null, tx).textContent = row.item.title || '—';
          if (row.item.speaker) el('span', null, tx).textContent = row.item.speaker;
          el('span', 'dsp-row-dur', li).textContent = row.end != null ? label('bis') + ' ' + clockText(row.end, false) : '';
          if (row.status === 'live') liveBar = el('i', 'dsp-row-bar', li);
        });
        // keep the live slot in view on long programmes
        const live = list.querySelector('[data-status="live"]');
        if (live) list.scrollTop = Math.max(0, live.offsetTop - list.clientHeight / 3);
      }
      if (liveBar && sv.current) {
        const w = (sv.progress * 100).toFixed(2) + '%';
        if (liveBar.style.width !== w) liveBar.style.width = w;
      }
    }

    function renderList(s, ctx) {
      const a = s.agenda;
      const key = JSON.stringify([a.items.map(x => [x.id, x.title, x.speaker, x.durationMs, x.start, x.end, x.startedAt, x.endedAt]), a.cursor, a.plannedStart]);
      if (key !== listKey) {
        listKey = key;
        list.innerHTML = '';
        const rows = E.scheduleView(s, ctx.wallNow || Date.now()).rows;
        a.items.forEach((it, i) => {
          const plan = rows[i] && rows[i].start;
          const li = el('li', 'dsp-row', list);
          li.dataset.status = i < a.cursor ? 'done' : i === a.cursor ? 'live' : 'todo';
          const tm = el('span', 'dsp-row-time', li);
          tm.textContent = plan != null ? clockText(plan, false) : String(i + 1);
          const tx = el('span', 'dsp-row-text', li);
          const b = el('b', null, tx); b.textContent = it.title || '—';
          if (it.speaker) { const sp = el('span', null, tx); sp.textContent = it.speaker; }
          const du = el('span', 'dsp-row-dur', li);
          du.textContent = E.formatMs(it.durationMs);
        });
      }
      const av = E.agendaView(s, ctx.now);
      const drift = av.drift;
      const label = ctx.i18n || (x => x);
      const dtxt = Math.abs(drift) < 30000 ? label('Im Plan') : E.formatMs(Math.abs(drift)) + ' ' + (drift > 0 ? label('hinter Plan') : label('vor Plan'));
      setText(sub, a.items.length ? dtxt + ' · ' + label('Ende') + ' ' + clockText(av.projectedEnd - ctx.now + (ctx.wallNow || Date.now()), false) : '');
    }

    return { update, root: r };
  }

  root.ETDisplay = { create, FONT_STACKS, clockText };
})(globalThis);
