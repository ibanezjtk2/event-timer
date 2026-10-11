/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Regie → Menü → Seiten: list of pages and the page editor.
 * The editor works on a draft; nothing reaches the stage until "Übernehmen".
 */
(function (root) {
  'use strict';
  const E = root.ETEngine;
  const { h, icon, toast, armed, t } = root.ETUI;
  const P = () => root.ETPages;
  const clone = v => JSON.parse(JSON.stringify(v));

  const DEVICES = {
    dsm: [['tv', 'Bildschirm 16:9', 1280, 720]],
    mod: [['ipad-l', 'iPad quer', 1180, 820], ['ipad-p', 'iPad hoch', 820, 1180], ['phone', 'Handy', 390, 844]],
  };
  const VARIANTS = [['full', 'Standard'], ['clock', 'Uhrzeit groß, Timer klein'], ['lower', 'Bauchbinde (Keying)']];

  /**
   * ctx: { tr, S, act, openUrl, pageUrl(pg), linkLine(url), qrCard(label,url), closeDrawer() }
   */
  function tab(ctx) {
    const s = ctx.S();
    const out = [];
    out.push(h('p', { class: 'help' }, t('Seiten für Bühnenmonitore (DSM) und für die Moderation, zusammengestellt aus Modulen. DSM-Seiten zeigen nur an; Moderationsseiten können auch Nachrichten senden und bestätigen.')));
    const full = s.pages.length >= E.MAX_PAGES;
    out.push(h('div', { class: 'row' },
      h('button', { class: 'btn btn-go', disabled: full, onclick: () => open(ctx, { kind: 'dsm' }) }, icon('plus'), t('Neue DSM-Seite')),
      h('button', { class: 'btn btn-go', disabled: full, onclick: () => open(ctx, { kind: 'mod' }) }, icon('plus'), t('Neue Moderationsseite'))));
    if (full) out.push(h('p', { class: 'help' }, t('Höchstens 16 eigene Seiten.')));

    const row = (pg, custom) => {
      const std = custom ? P().standardOf(s, pg) : '';
      const url = ctx.pageUrl(pg);
      return h('div', { class: 'pe-row' },
        h('div', { class: 'pe-row-main' },
          h('b', null, pg.name),
          h('span', { class: 'pe-kind', 'data-kind': pg.kind }, t(P().KIND_NAMES[pg.kind])),
          h('small', null, (custom ? P().pagePath(pg) : P().pagePath(pg)) + (std ? ' · ' + t('Standard für') + ' ' + std : ''))),
        h('div', { class: 'pe-row-btns' },
          custom
            ? h('button', { class: 'btn', onclick: () => open(ctx, { id: pg.id }) }, icon('edit'), t('Bearbeiten'))
            : h('button', { class: 'btn', title: t('Als eigene Seite kopieren und anpassen'), onclick: () => open(ctx, { from: pg }) }, icon('copy'), t('Kopieren')),
          h('button', { class: 'btn btn-quiet', 'aria-label': t('Öffnen'), title: t('Öffnen'), onclick: () => ctx.openUrl(url) }, icon('open'))));
    };
    out.push(h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Eigene Seiten')),
      ...(s.pages.length ? s.pages.map(pg => row(pg, true)) : [h('p', { class: 'help' }, t('Noch keine eigenen Seiten. Lege eine neue an oder kopiere eine Vorlage.'))])));
    out.push(h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Eingebaute Seiten (Vorlagen)')),
      h('p', { class: 'help' }, t('Diese Seiten gibt es immer. Zum Anpassen kopieren; die Kopie kann dann z. B. /moderation oder /1 ersetzen.')),
      ...P().builtins(s).map(pg => row(pg, false))));
    return out;
  }

  // ------------------------------------------------------------- editor
  let current = null; // only one editor at a time

  function freshPage(s, kind) {
    if (kind === 'mod') {
      const b = P().builtins(s).find(x => x.id === 'mod');
      return { kind: 'mod', name: t('Moderation') + ' 2', layout: b.layout, slots: b.slots.map(sl => sl.map(m => ({ type: m.type, opts: clone(m.opts) }))) };
    }
    return { kind: 'dsm', name: 'DSM ' + (s.pages.filter(p => p.kind === 'dsm').length + 2), layout: 'full', slots: [[{ type: 'timer', opts: { timer: s.timers[0] ? s.timers[0].id : 't1', variant: 'full' } }]] };
  }

  /** o: { id } edit a custom page · { kind } new page · { from } copy of a page */
  function open(ctx, o) {
    if (current) current.close(true);
    if (ctx.beforeOpen) ctx.beforeOpen();
    const s0 = ctx.S();
    let savedId = o.id || null;
    let draft;
    if (savedId) draft = clone(s0.pages.find(p => p.id === savedId));
    else if (o.from) draft = { kind: o.from.kind, name: o.from.name.replace(/ · .*$/, '') + ' ' + t('(Kopie)'), layout: o.from.layout, slots: o.from.slots.map(sl => sl.map(m => ({ type: m.type, opts: clone(m.opts) }))) };
    else draft = freshPage(s0, o.kind);
    if (!draft) return;
    let slugTouched = Boolean(savedId);
    if (!savedId) draft.slug = P().slugify(draft.name);
    let route = savedId ? (Object.keys(s0.routes).find(k => s0.routes[k] === savedId) || '') : '';
    let baseline = savedId ? JSON.stringify([draft, route]) : null;
    let device = DEVICES[draft.kind][0][0];
    let openOpts = null; // module id whose options are open

    const status = h('span', { class: 'pe-status' });
    const applyBtn = h('button', { class: 'btn btn-go', onclick: apply }, icon('check'), t('Übernehmen'));
    const discardBtn = armed(h('button', { class: 'btn' }, t('Verwerfen')), () => {
      if (!savedId) { close(true); return; }
      draft = clone(ctx.S().pages.find(p => p.id === savedId));
      route = Object.keys(ctx.S().routes).find(k => ctx.S().routes[k] === savedId) || '';
      render();
    });
    const backBtn = h('button', { class: 'btn', onclick: () => close(false) }, icon('back'), t('Zurück'));
    const title = h('h2');
    const form = h('div', { class: 'pe-form' });
    const pvBox = h('div', { class: 'pe-pv' });
    const pvStage = h('div', { class: 'pe-pv-stage' });
    const pvDevices = h('div', { class: 'seg', role: 'group' });
    const pvFoot = h('div', { class: 'pe-pv-foot' });
    const el = h('div', { class: 'pe', role: 'dialog', 'aria-modal': 'true' },
      h('header', { class: 'pe-head' }, backBtn, title, status, h('span', { class: 'spacer' }), discardBtn, applyBtn),
      h('div', { class: 'pe-body' }, form,
        h('div', { class: 'pe-side' }, h('div', { class: 'pe-pv-head' }, h('b', null, t('Vorschau')), pvDevices), pvBox, pvFoot)));
    document.body.appendChild(el);
    document.body.classList.add('pe-open');
    pvBox.appendChild(pvStage);

    // preview: the draft run through the engine on a scratch copy of the show, drawn by the real page renderer
    let pvPage = null, pvCleanup = null;
    function preparePreview() {
      const s = ctx.S();
      const tmp = clone(s);
      const before = tmp.pages.map(p => p.id);
      E.apply(tmp, { type: 'page.save', page: Object.assign({}, draft, savedId ? { id: savedId } : {}) }, Date.now());
      pvPage = savedId ? tmp.pages.find(p => p.id === savedId) : tmp.pages.find(p => !before.includes(p.id)) || null;
    }
    function mountPreview() {
      if (pvCleanup) pvCleanup();
      const dev = DEVICES[draft.kind].find(d => d[0] === device) || DEVICES[draft.kind][0];
      const maxW = Math.max(240, pvBox.clientWidth || 520), maxH = draft.kind === 'dsm' ? 420 : 560;
      const scale = Math.min(maxW / dev[2], maxH / dev[3]);
      pvStage.style.width = Math.round(dev[2] * scale) + 'px';
      pvStage.style.height = Math.round(dev[3] * scale) + 'px';
      pvCleanup = P().mountPage(pvStage, ctx.tr, {}, { preview: true, page: () => pvPage, size: { w: dev[2], h: dev[3], scale } });
    }

    function dirty() { return !savedId || JSON.stringify([draft, route]) !== baseline; }
    function apply() {
      const s = ctx.S();
      const before = s.pages.map(p => p.id);
      ctx.act({ type: 'page.save', page: Object.assign({}, draft, savedId ? { id: savedId } : {}), route });
      const now = ctx.S();
      const pg = savedId ? now.pages.find(p => p.id === savedId) : now.pages.find(p => !before.includes(p.id));
      if (!pg) { toast(t('Konnte nicht gespeichert werden.')); return; }
      savedId = pg.id;
      draft = clone(pg);
      route = Object.keys(now.routes).find(k => now.routes[k] === savedId) || '';
      baseline = JSON.stringify([draft, route]);
      slugTouched = true;
      toast(t('Übernommen – die Seite ist live.'));
      render();
    }
    function close(force) {
      if (!force && dirty() && savedId) {
        if (!confirmClose) { confirmClose = true; backBtn.replaceChildren(icon('back'), t('Ungespeichert – nochmal tippen')); setTimeout(() => { confirmClose = false; backBtn.replaceChildren(icon('back'), t('Zurück')); }, 2500); return; }
      }
      if (!force && !savedId && draftTouched) {
        if (!confirmClose) { confirmClose = true; backBtn.replaceChildren(icon('back'), t('Nicht übernommen – nochmal tippen')); setTimeout(() => { confirmClose = false; backBtn.replaceChildren(icon('back'), t('Zurück')); }, 2500); return; }
      }
      if (pvCleanup) pvCleanup();
      el.remove();
      document.body.classList.remove('pe-open');
      window.removeEventListener('resize', onResize);
      current = null;
      if (ctx.onClose) ctx.onClose();
    }
    let confirmClose = false, draftTouched = false;
    const onResize = () => mountPreview();
    window.addEventListener('resize', onResize);

    const change = fn => { fn(); draftTouched = true; render(); };

    function moduleCard(m, si, mi) {
      const s = ctx.S();
      const meta = P().MODULES[m.type];
      const slots = draft.slots;
      const optsOpen = openOpts === m;
      const move = (dir) => change(() => { const sl = slots[si]; const j = mi + dir; if (j < 0 || j >= sl.length) return; [sl[mi], sl[j]] = [sl[j], sl[mi]]; });
      const other = slots.length === 2 ? 1 - si : -1;
      const opts = [];
      if (m.type === 'timer') {
        const sel = h('select', { class: 'input' }, s.timers.map(x => h('option', { value: x.id }, x.name + ' (' + x.id.slice(1) + ')')));
        sel.value = m.opts.timer || 't1';
        sel.addEventListener('change', () => change(() => { m.opts.timer = sel.value; }));
        opts.push(h('label', { class: 'field' }, h('span', null, t('Timer')), sel));
        if (draft.kind === 'dsm') {
          const v = h('select', { class: 'input' }, VARIANTS.map(([k, l]) => h('option', { value: k }, t(l))));
          v.value = m.opts.variant || 'full';
          v.addEventListener('change', () => change(() => { m.opts.variant = v.value; }));
          opts.push(h('label', { class: 'field' }, h('span', null, t('Darstellung')), v));
        }
      } else if (m.type === 'clock') {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = m.opts.seconds !== false;
        cb.addEventListener('change', () => change(() => { m.opts.seconds = cb.checked; }));
        opts.push(h('label', { class: 'switch' }, cb, t('Sekunden anzeigen')));
      } else if (m.type === 'message' && draft.kind === 'mod') {
        const targets = P().dsmTargets(s, false);
        const v = h('select', { class: 'input' }, h('option', { value: '' }, t('Automatisch (DSM des Ablauf-Timers)')), targets.map(x => h('option', { value: x.id }, x.name + ' · ' + x.sub)));
        v.value = m.opts.page || '';
        v.addEventListener('change', () => change(() => { m.opts.page = v.value; }));
        opts.push(h('label', { class: 'field' }, h('span', null, t('Welcher DSM')), v));
      }
      return h('div', { class: 'pe-mod', 'data-type': m.type },
        h('div', { class: 'pe-mod-head' },
          h('div', { class: 'pe-mod-name' }, h('b', null, t(meta.label)), h('small', null, t(draft.kind === 'mod' && meta.helpMod ? meta.helpMod : meta.help))),
          opts.length ? h('button', { class: 'btn btn-quiet btn-icon', 'aria-pressed': String(optsOpen), 'aria-label': t('Einstellungen'), title: t('Einstellungen'), onclick: () => { openOpts = optsOpen ? null : m; render(); } }, icon('gear')) : null,
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Hoch'), title: t('Hoch'), disabled: mi === 0, onclick: () => move(-1) }, icon('up')),
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Runter'), title: t('Runter'), disabled: mi === slots[si].length - 1, onclick: () => move(1) }, icon('down')),
          other >= 0 ? h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('In den anderen Bereich'), title: t('In den anderen Bereich'), onclick: () => change(() => { slots[si].splice(mi, 1); slots[other].push(m); }) }, icon(other > si ? 'go' : 'back')) : null,
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Entfernen'), title: t('Entfernen'), onclick: () => change(() => { slots[si].splice(mi, 1); }) }, icon('trash'))),
        optsOpen && opts.length ? h('div', { class: 'pe-mod-opts' }, ...opts) : null);
    }

    function addMenu(si) {
      const s = ctx.S();
      const types = Object.keys(P().MODULES).filter(k => E.MODULE_KINDS[k].includes(draft.kind));
      const menu = h('div', { class: 'pe-add-menu' }, ...types.map(k => h('button', { class: 'pe-add-item', onclick: () => change(() => {
        const opts = k === 'timer' ? { timer: (s.timers.find(x => x.id === s.agenda.timerId) || s.timers[0] || { id: 't1' }).id, variant: 'full' } : k === 'clock' ? { seconds: true } : k === 'message' ? { page: '' } : {};
        draft.slots[si].push({ type: k, opts });
        addOpen = -1;
      }) }, h('b', null, t(P().MODULES[k].label)), h('small', null, t(draft.kind === 'mod' && P().MODULES[k].helpMod ? P().MODULES[k].helpMod : P().MODULES[k].help)))));
      return menu;
    }
    let addOpen = -1;

    let rendering = false;
    function render() {
      // removing a focused field fires "change" while we rebuild – don't re-enter
      if (rendering) return;
      rendering = true;
      try { renderInner(); } finally { rendering = false; }
    }
    function renderInner() {
      const s = ctx.S();
      if (!s) return;
      if (savedId && !s.pages.some(p => p.id === savedId)) { close(true); return; }
      title.textContent = (savedId ? t('Seite bearbeiten') : t('Neue Seite')) + ': ' + (draft.name || '');
      const isDirty = dirty();
      status.textContent = !savedId ? t('Neu – noch nicht live') : isDirty ? t('Entwurf – noch nicht live') : t('Live');
      status.dataset.state = !savedId || isDirty ? 'draft' : 'live';
      applyBtn.disabled = Boolean(savedId) && !isDirty;
      discardBtn.hidden = !savedId || !isDirty;

      // ---- form
      const name = h('input', { class: 'input', value: draft.name, maxlength: 40 });
      name.addEventListener('input', () => {
        draft.name = name.value; draftTouched = true;
        if (!slugTouched) { draft.slug = P().slugify(name.value); slugIn.value = draft.slug; }
        title.textContent = (savedId ? t('Seite bearbeiten') : t('Neue Seite')) + ': ' + draft.name;
        refreshStatus();
      });
      name.addEventListener('change', () => render());
      const slugIn = h('input', { class: 'input num', value: draft.slug || '', maxlength: 40, spellcheck: false });
      slugIn.addEventListener('input', () => { slugTouched = true; draftTouched = true; draft.slug = P().slugify(slugIn.value); refreshStatus(); });
      slugIn.addEventListener('change', () => { slugIn.value = draft.slug; render(); });
      const routeSel = h('select', { class: 'input' }, h('option', { value: '' }, t('– keine –')),
        draft.kind === 'mod'
          ? h('option', { value: 'moderation' }, '/moderation')
          : E.ROUTE_KEYS.filter(k => k !== 'moderation').map(k => {
            const tm = s.timers.find(x => x.id === 't' + k);
            const taken = s.routes[k] && s.routes[k] !== savedId ? s.pages.find(p => p.id === s.routes[k]) : null;
            return h('option', { value: k }, '/' + k + (tm ? ' (' + tm.name + ')' : '') + (taken ? ' – ' + t('jetzt') + ': ' + taken.name : ''));
          }));
      routeSel.value = route;
      routeSel.addEventListener('change', () => change(() => { route = routeSel.value; }));
      const takenNow = route && s.routes[route] && s.routes[route] !== savedId ? s.pages.find(p => p.id === s.routes[route]) : null;

      const layoutSeg = h('div', { class: 'seg', role: 'group' }, E.PAGE_LAYOUTS[draft.kind].map(l => h('button', {
        'aria-pressed': String(draft.layout === l),
        onclick: () => change(() => {
          const n = E.SLOT_COUNT[l];
          const all = draft.slots;
          // switching to fewer areas keeps every module: the extra areas move into the last one
          if (n < all.length) { const rest = all.splice(n).flat(); all[n - 1].push(...rest); }
          while (all.length < n) all.push([]);
          draft.layout = l;
        }),
      }, t(P().LAYOUTS[l]))));

      const slotsEl = draft.slots.map((sl, si) => h('div', { class: 'pe-slot' },
        h('div', { class: 'pe-slot-head' }, h('b', null, t(P().SLOT_NAMES[draft.layout][si] || '')), h('small', null, sl.length + ' / 8')),
        ...sl.map((m, mi) => moduleCard(m, si, mi)),
        sl.length < 8 ? h('button', { class: 'btn pe-add', 'aria-expanded': String(addOpen === si), onclick: () => { addOpen = addOpen === si ? -1 : si; render(); } }, icon('plus'), t('Modul')) : null,
        addOpen === si ? addMenu(si) : null));

      const kindNote = draft.kind === 'dsm'
        ? t('DSM-Seite: nur Anzeige, für Bildschirme ohne Touch. Module zum Senden oder Bestätigen gibt es hier nicht.')
        : t('Moderationsseite: für Handy oder Tablet, mit allen Modulen.');

      form.replaceChildren(...[
        h('p', { class: 'help pe-kindnote' }, h('span', { class: 'pe-kind', 'data-kind': draft.kind }, t(P().KIND_NAMES[draft.kind])), ' ', kindNote),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', null, t('Name')), name),
          h('label', { class: 'field' }, h('span', null, t('Adresse')), h('div', { class: 'pe-slug' }, h('span', null, '/p/'), slugIn))),
        h('label', { class: 'field' }, h('span', null, t('Als Standard für')), routeSel),
        h('p', { class: 'help' }, draft.kind === 'mod'
          ? t('Geräte mit der Adresse /moderation zeigen dann diese Seite – ohne neuen QR-Code.')
          : t('Geräte mit der Adresse /1 … /8 zeigen dann diese Seite – ohne neuen QR-Code.')),
        takenNow ? h('p', { class: 'help pe-warn' }, t('Ersetzt dort') + ' „' + takenNow.name + '“.') : null,
        h('div', { class: 'field' }, h('span', null, t('Layout')), layoutSeg),
        h('div', { class: 'pe-slots', 'data-n': draft.slots.length }, ...slotsEl),
        savedId ? h('div', { class: 'section' }, armed(h('button', { class: 'btn btn-quiet' }, icon('trash'), t('Seite löschen')), () => {
          ctx.act({ type: 'page.remove', pageId: savedId });
          toast(t('Seite gelöscht.'));
          close(true);
        })) : null].filter(Boolean));

      // ---- preview + address
      pvDevices.replaceChildren(...DEVICES[draft.kind].map(([k, l]) => h('button', { 'aria-pressed': String(device === k), onclick: () => { device = k; render(); mountPreview(); } }, t(l))));
      pvDevices.hidden = DEVICES[draft.kind].length < 2;
      const saved = savedId && s.pages.find(p => p.id === savedId);
      pvFoot.replaceChildren(...(saved
        ? [h('div', { class: 'qr-grid' }, ctx.qrCard(saved.name, ctx.pageUrl(saved))), ctx.linkLine(ctx.pageUrl(saved))]
        : [h('p', { class: 'help' }, t('Adresse und QR-Code gibt es nach „Übernehmen“.'))]));
      preparePreview();
      if (!pvCleanup) mountPreview();
    }
    function refreshStatus() {
      const isDirty = dirty();
      status.textContent = !savedId ? t('Neu – noch nicht live') : isDirty ? t('Entwurf – noch nicht live') : t('Live');
      status.dataset.state = !savedId || isDirty ? 'draft' : 'live';
      applyBtn.disabled = Boolean(savedId) && !isDirty;
      discardBtn.hidden = !savedId || !isDirty;
      preparePreview();
    }

    current = { close, render };
    render();
    setTimeout(mountPreview, 0);
  }

  root.ETPageEditor = { tab, open, refresh: () => { if (current) current.render(); }, isOpen: () => Boolean(current) };
})(globalThis);
