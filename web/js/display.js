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
      const p = s.presets.find(x => x.id === t.presetId) || s.presets[0];
      const layout = ctx.layout || 'full';
      applyPreset(r, p, ctx.transparent);
      const v = E.timerView(t, ctx.now);
      const txt = E.formatMs(v.ms, { up: t.kind === 'countup' });
      const showOver = v.phase === 'over';

      setAttr(r, 'data-layout', layout);
      setAttr(r, 'data-phase', v.phase);
      setAttr(r, 'data-state', v.state);
      setAttr(r, 'data-len', Math.min(9, txt.length));
      setAttr(r, 'data-blackout', s.blackout && !o.tile ? 1 : 0);
      setAttr(r, 'data-weight', p.weight);
      setText(time, txt);

      // sub line: what this countdown counts towards
      let subText = '';
      if (t.kind === 'clock' && t.targetLabel) subText = (ctx.i18n ? ctx.i18n('bis') : 'bis') + ' ' + t.targetLabel;
      setText(sub, subText);

      // segment / title
      const seg = t.segmentId ? s.agenda.items.find(x => x.id === t.segmentId) : null;
      const showTitle = ctx.show ? ctx.show.title : p.showTitle;
      setText(title, showTitle ? (seg ? seg.title : (s.event.title || '')) : '');
      setText(speaker, showTitle && seg ? seg.speaker : '');
      const showClock = ctx.show ? ctx.show.clock : p.showClock;
      setText(clock, showClock ? clockText(ctx.wallNow || Date.now(), false) : '');

      const showNext = ctx.show ? ctx.show.next : p.showNext;
      let nextText = '';
      if (showNext && seg) {
        const idx = s.agenda.items.indexOf(seg);
        const n = s.agenda.items[idx + 1];
        if (n) nextText = (ctx.i18n ? ctx.i18n('Danach') : 'Danach') + ': ' + n.title + (n.speaker ? ' – ' + n.speaker : '');
      }
      setText(next, nextText);

      const showNotice = ctx.show ? ctx.show.notice : p.showNotice;
      let noticeText = '';
      if (showNotice) {
        if (v.state === 'finished') noticeText = p.expiredText;
        else if (showOver) noticeText = p.overText;
        else if (v.phase === 'warn' || v.phase === 'crit') noticeText = v.state === 'running' ? p.warnText : '';
      }
      setText(notice, noticeText);
      setAttr(notice, 'data-on', noticeText ? 1 : 0);

      const m = t.message;
      const msgOn = m.visible && m.text ? 1 : 0;
      setAttr(r, 'data-msg', msgOn);
      setAttr(msg, 'data-flash', msgOn && m.flash ? 1 : 0);
      setText(msgText, msgOn ? m.text : '');
      setAttr(msg, 'data-long', m.text.length > 60 ? 2 : m.text.length > 24 ? 1 : 0);

      const showProgress = ctx.show ? ctx.show.progress : p.showProgress;
      setAttr(prog, 'data-on', showProgress && t.kind !== 'clock' && t.durationMs > 0 ? 1 : 0);
      const w = (v.progress * 100).toFixed(2) + '%';
      if (bar.style.width !== w) bar.style.width = w;

      if (layout === 'clock') {
        setText(clock, clockText(ctx.wallNow || Date.now(), true));
      }
      if (layout === 'agenda') renderList(s, ctx);
    }

    function renderList(s, ctx) {
      const a = s.agenda;
      const key = JSON.stringify([a.items.map(x => [x.id, x.title, x.speaker, x.durationMs, x.startedAt, x.endedAt]), a.cursor, a.plannedStart]);
      if (key !== listKey) {
        listKey = key;
        list.innerHTML = '';
        let plan = null;
        if (a.plannedStart) { const [h, mi] = a.plannedStart.split(':').map(Number); const d = new Date(ctx.wallNow || Date.now()); d.setHours(h, mi, 0, 0); plan = d.getTime(); }
        a.items.forEach((it, i) => {
          const li = el('li', 'dsp-row', list);
          li.dataset.status = i < a.cursor ? 'done' : i === a.cursor ? 'live' : 'todo';
          const tm = el('span', 'dsp-row-time', li);
          tm.textContent = plan != null ? clockText(plan, false) : String(i + 1);
          const tx = el('span', 'dsp-row-text', li);
          const b = el('b', null, tx); b.textContent = it.title || '—';
          if (it.speaker) { const sp = el('span', null, tx); sp.textContent = it.speaker; }
          const du = el('span', 'dsp-row-dur', li);
          du.textContent = E.formatMs(it.durationMs);
          if (plan != null) plan += it.durationMs;
        });
      }
      const av = E.agendaView(s, ctx.now);
      const drift = av.drift;
      const label = ctx.i18n || (x => x);
      const dtxt = Math.abs(drift) < 30000 ? label('Im Plan') : (drift > 0 ? label('hinter Plan') : label('vor Plan')) + ' ' + E.formatMs(Math.abs(drift));
      setText(sub, a.items.length ? dtxt + ' · ' + label('Ende ca.') + ' ' + clockText(av.projectedEnd - ctx.now + (ctx.wallNow || Date.now()), false) : '');
    }

    return { update, root: r };
  }

  root.ETDisplay = { create, FONT_STACKS, clockText };
})(globalThis);
