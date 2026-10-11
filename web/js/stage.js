/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * /cues – a second operator desk (light, video) watching the cue list.
 * (The presenter's page /moderation is built from modules, see pages.js.)
 */
(function (root) {
  'use strict';
  const E = root.ETEngine, D = root.ETDisplay;
  const { h, t } = root.ETUI;

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
          const txt = c.status === 'go' ? t('jetzt') : c.status === 'ready' ? t('Auf Abruf') : c.inMs != null ? E.formatMs(c.inMs) : t('wartet');
          if (pill && pill.textContent !== txt) pill.textContent = txt;
        });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { alive = false; };
  }

  root.ETStage = { mountCues };
})(globalThis);
