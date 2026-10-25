/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Regie → Menü → Screens: list of screens and groups, and the screen editor.
 * The editor works on a draft; nothing reaches the devices until "Übernehmen".
 * A screen in a group shows the group's layout – editing it edits the group (all members) –
 * unless "Eigener Aufbau" is switched on for that screen.
 */
(function (root) {
  'use strict';
  const E = root.ETEngine;
  const { h, icon, toast, armed, t } = root.ETUI;
  const P = () => root.ETPages;
  const clone = v => JSON.parse(JSON.stringify(v));

  const DEVICES = {
    show: [['tv', 'Monitor 16:9', 1280, 720]],
    mod: [['ipad-l', 'iPad quer', 1180, 820], ['ipad-p', 'iPad hoch', 820, 1180], ['phone', 'Handy', 390, 844]],
  };
  const VARIANTS = [['full', 'Standard'], ['clock', 'Uhrzeit groß, Timer klein'], ['lower', 'Bauchbinde (Keying)']];
  const NEW_NAMES = { dsm: 'DSM', agenda: 'Agenda-Monitor', clock: 'Uhr', mod: 'Moderation', 'empty-show': 'Anzeige', 'empty-mod': 'Moderation' };

  /**
   * ctx: { tr, S, act, openUrl, pageUrl(pg), linkLine(url), qrCard(label,url), beforeOpen(), onClose(), timerId() }
   */
  function tab(ctx) {
    const s = ctx.S();
    const out = [];
    out.push(h('p', { class: 'help' }, t('Screens sind die Ausgänge: alles, was ein Gerät außerhalb der Regie zeigt. Jeder Screen hat eine Nummer (/1, /2 …) und besteht aus Modulen. Anzeige-Screens zeigen nur an; Moderations-Screens können auch Nachrichten senden und bestätigen.')));
    const full = s.screens.length >= E.MAX_SCREENS;
    out.push(h('div', { class: 'row' },
      h('button', { class: 'btn btn-go', disabled: full, onclick: () => open(ctx, { pick: true }) }, icon('plus'), t('Neuer Screen'))));
    if (full) out.push(h('p', { class: 'help' }, t('Höchstens 16 Screens.')));

    const groupName = id => { const g = s.groups.find(x => x.id === id); return g ? g.name : ''; };
    out.push(h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Screens')),
      ...P().byNum(s).map(sc => h('div', { class: 'pe-row' },
        h('div', { class: 'pe-row-main' },
          h('b', null, P().screenLabel(sc)),
          h('span', { class: 'pe-kind', 'data-kind': sc.kind }, t(P().KIND_NAMES[sc.kind])),
          sc.group ? h('span', { class: 'pe-group' }, t('Gruppe') + ' ' + groupName(sc.group) + (sc.own ? ' · ' + t('eigener Aufbau') : '')) : null,
          h('small', null, '/' + sc.num + ' · /p/' + sc.slug)),
        h('div', { class: 'pe-row-btns' },
          h('button', { class: 'btn', onclick: () => open(ctx, { id: sc.id }) }, icon('edit'), t('Bearbeiten')),
          h('button', { class: 'btn btn-quiet', 'aria-label': t('Öffnen'), title: t('Öffnen'), onclick: () => ctx.openUrl(ctx.pageUrl(sc)) }, icon('open')))))));

    if (s.groups.length) {
      out.push(h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Gruppen')),
        h('p', { class: 'help' }, t('Screens einer Gruppe zeigen denselben Aufbau. Den Aufbau bearbeitest du über einen ihrer Screens.')),
        ...s.groups.map(g => {
          const members = P().byNum(s).filter(x => x.group === g.id);
          return h('div', { class: 'pe-row' },
            h('div', { class: 'pe-row-main' }, h('b', null, g.name), h('span', { class: 'pe-kind', 'data-kind': g.kind }, t(P().KIND_NAMES[g.kind])),
              h('small', null, members.length ? t('Screens') + ': ' + members.map(x => x.num).join(', ') : t('keine Screens'))),
            h('div', { class: 'pe-row-btns' },
              armed(h('button', { class: 'btn btn-quiet', title: t('Gruppe auflösen – die Screens behalten ihren Aufbau') }, t('Auflösen')), () => ctx.act({ type: 'group.remove', groupId: g.id }))));
        })));
    }
    out.push(h('div', { class: 'section' }, h('h3', { class: 'section-title' }, t('Feste Screens')),
      ...[['moderation', '/moderation', 'Erster Moderations-Screen (oder die Vorlage, wenn es keinen gibt)'], ['plan', '/plan', 'Agenda-Monitor'], ['uhr', '/uhr', 'Uhr'], ['cues', '/cues', 'Cue-Liste für Licht, Ton, Video']].map(([k, path, label]) =>
        h('div', { class: 'pe-row' }, h('div', { class: 'pe-row-main' }, h('b', null, path), h('small', null, t(label))),
          h('div', { class: 'pe-row-btns' }, h('button', { class: 'btn btn-quiet', 'aria-label': t('Öffnen'), onclick: () => ctx.openUrl(ctx.baseUrl() + (ctx.standalone ? '#' + k : path)) }, icon('open')))))));
    return out;
  }

  // ------------------------------------------------------------- editor
  let current = null; // only one editor at a time

  /** o: { id } edit · { pick: true } choose a template first · { template } new from template */
  function open(ctx, o) {
    if (current) current.close(true);
    if (ctx.beforeOpen) ctx.beforeOpen();
    const s0 = ctx.S();
    let savedId = o.id || null;
    let scr = null, grp = null, newGroupName = null;
    let picking = Boolean(o.pick);
    if (savedId) {
      scr = clone(s0.screens.find(p => p.id === savedId));
      if (!scr) return;
      grp = scr.group ? clone(s0.groups.find(g => g.id === scr.group) || null) : null;
    } else if (o.template) {
      scr = fromTemplate(s0, o.template);
    }
    let baseline = savedId ? JSON.stringify([scr, grp, newGroupName]) : null;
    let slugTouched = Boolean(savedId);
    let device = null;
    let openOpts = null;
    let addOpen = -1;
    let confirmClose = false, draftTouched = false;

    function fromTemplate(s, key) {
      const tid = (ctx.timerId && ctx.timerId()) || P().agendaTimerId(s);
      const a = E.templateAufbau(key, tid);
      const used = new Set(s.screens.map(x => x.num));
      let num = 1;
      while (used.has(num) && num < E.MAX_SCREENS) num++;
      const name = t(NEW_NAMES[key] || 'Screen');
      return { kind: a.kind, num, name, slug: P().slugify(name), group: '', own: false, layout: a.layout, slots: clone(a.slots) };
    }
    /** where layout edits go: the group while the screen follows it, else the screen itself */
    const ab = () => (scr.group && !scr.own && grp ? grp : scr);

    const status = h('span', { class: 'pe-status' });
    const applyBtn = h('button', { class: 'btn btn-go', onclick: apply }, icon('check'), t('Übernehmen'));
    const discardBtn = armed(h('button', { class: 'btn' }, t('Verwerfen')), () => {
      if (!savedId) { close(true); return; }
      const s = ctx.S();
      scr = clone(s.screens.find(p => p.id === savedId));
      grp = scr.group ? clone(s.groups.find(g => g.id === scr.group) || null) : null;
      newGroupName = null;
      render();
    });
    const backBtn = h('button', { class: 'btn', onclick: () => close(false) }, icon('back'), t('Zurück'));
    const title = h('h2');
    const form = h('div', { class: 'pe-form' });
    const pvBox = h('div', { class: 'pe-pv' });
    const pvStage = h('div', { class: 'pe-pv-stage' });
    const pvDevices = h('div', { class: 'seg', role: 'group' });
    const pvFoot = h('div', { class: 'pe-pv-foot' });
    const side = h('div', { class: 'pe-side' }, h('div', { class: 'pe-pv-head' }, h('b', null, t('Vorschau')), pvDevices), pvBox, pvFoot);
    const el = h('div', { class: 'pe', role: 'dialog', 'aria-modal': 'true' },
      h('header', { class: 'pe-head' }, backBtn, title, status, h('span', { class: 'spacer' }), discardBtn, applyBtn),
      h('div', { class: 'pe-body' }, form, side));
    document.body.appendChild(el);
    document.body.classList.add('pe-open');
    pvBox.appendChild(pvStage);

    // preview: the draft run through the engine on a scratch copy of the show, drawn by the real renderer
    let pvPage = null, pvCleanup = null;
    function preparePreview() {
      if (!scr) { pvPage = null; return; }
      const tmp = clone(ctx.S());
      if (grp && tmp.groups.some(g => g.id === grp.id)) E.apply(tmp, { type: 'group.save', group: grp }, Date.now());
      const before = tmp.screens.map(p => p.id);
      E.apply(tmp, Object.assign({ type: 'screen.save', screen: Object.assign({}, scr, savedId ? { id: savedId } : {}) }, newGroupName != null ? { newGroup: { name: newGroupName } } : {}), Date.now());
      const sc = savedId ? tmp.screens.find(p => p.id === savedId) : tmp.screens.find(p => !before.includes(p.id));
      // the preview reads live state – give it the draft's effective layout directly
      pvPage = sc ? P().effective(tmp, sc) : null;
    }
    function mountPreview() {
      if (pvCleanup) { pvCleanup(); pvCleanup = null; }
      if (!scr) return;
      const list = DEVICES[scr.kind];
      if (!device || !list.some(d => d[0] === device)) device = list[0][0];
      const dev = list.find(d => d[0] === device);
      const maxW = Math.max(240, pvBox.clientWidth || 520), maxH = scr.kind === 'show' ? 420 : 560;
      const scale = Math.min(maxW / dev[2], maxH / dev[3]);
      pvStage.style.width = Math.round(dev[2] * scale) + 'px';
      pvStage.style.height = Math.round(dev[3] * scale) + 'px';
      pvCleanup = P().mountPage(pvStage, ctx.tr, {}, { preview: true, page: () => pvPage, size: { w: dev[2], h: dev[3], scale } });
    }

    function dirty() { return !savedId || JSON.stringify([scr, grp, newGroupName]) !== baseline; }
    function apply() {
      const s = ctx.S();
      const before = s.screens.map(p => p.id);
      const savedGroup = grp && s.groups.find(g => g.id === grp.id);
      if (grp && savedGroup && JSON.stringify(grp) !== JSON.stringify(savedGroup)) ctx.act({ type: 'group.save', group: grp });
      ctx.act(Object.assign({ type: 'screen.save', screen: Object.assign({}, scr, savedId ? { id: savedId } : {}) }, newGroupName != null ? { newGroup: { name: newGroupName } } : {}));
      const now = ctx.S();
      const sc = savedId ? now.screens.find(p => p.id === savedId) : now.screens.find(p => !before.includes(p.id));
      if (!sc) { toast(t('Konnte nicht gespeichert werden.')); return; }
      savedId = sc.id;
      scr = clone(sc);
      grp = scr.group ? clone(now.groups.find(g => g.id === scr.group) || null) : null;
      newGroupName = null;
      baseline = JSON.stringify([scr, grp, newGroupName]);
      slugTouched = true;
      toast(t('Übernommen – der Screen ist live.'));
      render();
    }
    function close(force) {
      if (!force && scr && ((savedId && dirty()) || (!savedId && draftTouched))) {
        if (!confirmClose) {
          confirmClose = true;
          backBtn.replaceChildren(icon('back'), t('Nicht übernommen – nochmal tippen'));
          setTimeout(() => { confirmClose = false; backBtn.replaceChildren(icon('back'), t('Zurück')); }, 2500);
          return;
        }
      }
      if (pvCleanup) pvCleanup();
      el.remove();
      document.body.classList.remove('pe-open');
      window.removeEventListener('resize', onResize);
      current = null;
      if (ctx.onClose) ctx.onClose();
    }
    const onResize = () => mountPreview();
    window.addEventListener('resize', onResize);
    const change = fn => { fn(); draftTouched = true; render(); };

    function moduleCard(m, si, mi) {
      const s = ctx.S();
      const meta = P().MODULES[m.type];
      const slots = ab().slots;
      const optsOpen = openOpts === m;
      const move = dir => change(() => { const sl = slots[si]; const j = mi + dir; if (j < 0 || j >= sl.length) return; [sl[mi], sl[j]] = [sl[j], sl[mi]]; });
      const other = slots.length === 2 ? 1 - si : -1;
      const opts = [];
      if (m.type === 'timer') {
        const sel = h('select', { class: 'input' }, s.timers.map(x => h('option', { value: x.id }, x.name)));
        sel.value = m.opts.timer || 't1';
        sel.addEventListener('change', () => change(() => { m.opts.timer = sel.value; }));
        opts.push(h('label', { class: 'field' }, h('span', null, t('Timer')), sel));
        if (scr.kind === 'show') {
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
      } else if (m.type === 'message' && scr.kind === 'mod') {
        const targets = P().dsmTargets(s, false);
        const v = h('select', { class: 'input' }, h('option', { value: '' }, t('Automatisch (Screen mit dem Agenda-Timer)')), targets.map(x => h('option', { value: x.id }, x.name)));
        v.value = m.opts.page || '';
        v.addEventListener('change', () => change(() => { m.opts.page = v.value; }));
        opts.push(h('label', { class: 'field' }, h('span', null, t('Welcher Screen')), v));
      }
      return h('div', { class: 'pe-mod', 'data-type': m.type },
        h('div', { class: 'pe-mod-head' },
          h('div', { class: 'pe-mod-name' }, h('b', null, t(meta.label)), h('small', null, t(scr.kind === 'mod' && meta.helpMod ? meta.helpMod : meta.help))),
          opts.length ? h('button', { class: 'btn btn-quiet btn-icon', 'aria-pressed': String(optsOpen), 'aria-label': t('Einstellungen'), title: t('Einstellungen'), onclick: () => { openOpts = optsOpen ? null : m; render(); } }, icon('gear')) : null,
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Hoch'), title: t('Hoch'), disabled: mi === 0, onclick: () => move(-1) }, icon('up')),
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Runter'), title: t('Runter'), disabled: mi === slots[si].length - 1, onclick: () => move(1) }, icon('down')),
          other >= 0 ? h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('In den anderen Bereich'), title: t('In den anderen Bereich'), onclick: () => change(() => { slots[si].splice(mi, 1); slots[other].push(m); }) }, icon(other > si ? 'go' : 'back')) : null,
          h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': t('Entfernen'), title: t('Entfernen'), onclick: () => change(() => { slots[si].splice(mi, 1); }) }, icon('trash'))),
        optsOpen && opts.length ? h('div', { class: 'pe-mod-opts' }, ...opts) : null);
    }

    function addMenu(si) {
      const s = ctx.S();
      const types = Object.keys(P().MODULES).filter(k => E.MODULE_KINDS[k].includes(scr.kind));
      return h('div', { class: 'pe-add-menu' }, ...types.map(k => h('button', { class: 'pe-add-item', onclick: () => change(() => {
        const opts = k === 'timer' ? { timer: (ctx.timerId && ctx.timerId()) || P().agendaTimerId(s), variant: 'full' } : k === 'clock' ? { seconds: true } : k === 'message' ? { page: '' } : {};
        ab().slots[si].push({ type: k, opts });
        addOpen = -1;
      }) }, h('b', null, t(P().MODULES[k].label)), h('small', null, t(scr.kind === 'mod' && P().MODULES[k].helpMod ? P().MODULES[k].helpMod : P().MODULES[k].help)))));
    }

    function renderPicker() {
      title.textContent = t('Neuer Screen');
      status.textContent = '';
      status.dataset.state = 'draft';
      applyBtn.hidden = true;
      discardBtn.hidden = true;
      side.hidden = true;
      form.replaceChildren(
        h('p', { class: 'help' }, t('Womit soll der Screen starten? Alles lässt sich danach ändern.')),
        h('div', { class: 'pe-templates' }, ...P().TEMPLATES.map(([key, name, help]) => {
          const a = E.templateAufbau(key);
          return h('button', { class: 'pe-tpl', onclick: () => { scr = fromTemplate(ctx.S(), key); picking = false; draftTouched = true; render(); setTimeout(mountPreview, 0); } },
            h('span', { class: 'pe-kind', 'data-kind': a.kind }, t(P().KIND_NAMES[a.kind])), h('b', null, t(name)), h('small', null, t(help)));
        })));
    }

    let rendering = false;
    function render() {
      // removing a focused field fires "change" while we rebuild – don't re-enter
      if (rendering) return;
      rendering = true;
      try { if (picking) renderPicker(); else renderInner(); } finally { rendering = false; }
    }
    function renderInner() {
      const s = ctx.S();
      if (!s || !scr) return;
      if (savedId && !s.screens.some(p => p.id === savedId)) { close(true); return; }
      applyBtn.hidden = false;
      side.hidden = false;
      title.textContent = (savedId ? t('Screen bearbeiten') : t('Neuer Screen')) + ': ' + (scr.name || '');
      refreshStatus(false);

      // ---- name, address
      const name = h('input', { class: 'input', value: scr.name, maxlength: 40 });
      name.addEventListener('input', () => {
        scr.name = name.value; draftTouched = true;
        if (!slugTouched) { scr.slug = P().slugify(name.value); slugIn.value = scr.slug; }
        title.textContent = (savedId ? t('Screen bearbeiten') : t('Neuer Screen')) + ': ' + scr.name;
        refreshStatus(true);
      });
      name.addEventListener('change', () => render());
      const numSel = h('select', { class: 'input num' }, Array.from({ length: E.MAX_SCREENS }, (_, i) => i + 1)
        .filter(n => n === scr.num || !s.screens.some(x => x.num === n && x.id !== savedId))
        .map(n => h('option', { value: n }, '/' + n)));
      numSel.value = String(scr.num);
      numSel.addEventListener('change', () => change(() => { scr.num = Number(numSel.value); }));
      const slugIn = h('input', { class: 'input num', value: scr.slug || '', maxlength: 40, spellcheck: false });
      slugIn.addEventListener('input', () => { slugTouched = true; draftTouched = true; scr.slug = P().slugify(slugIn.value); refreshStatus(true); });
      slugIn.addEventListener('change', () => { slugIn.value = scr.slug; render(); });

      // ---- group
      const groups = s.groups.filter(g => g.kind === scr.kind);
      const groupSel = h('select', { class: 'input' }, h('option', { value: '' }, t('– keine –')),
        groups.map(g => h('option', { value: g.id }, g.name)),
        s.groups.length < E.MAX_GROUPS ? h('option', { value: '__new' }, t('+ Neue Gruppe …')) : null);
      groupSel.value = newGroupName != null ? '__new' : scr.group || '';
      groupSel.addEventListener('change', () => change(() => {
        const v = groupSel.value;
        if (v === '__new') {
          if (scr.group && !scr.own && grp) { scr.layout = grp.layout; scr.slots = clone(grp.slots); }
          scr.group = ''; scr.own = false; grp = null; newGroupName = scr.name;
        } else if (v === '') {
          // leaving the group: keep showing what it showed
          if (scr.group && !scr.own && grp) { scr.layout = grp.layout; scr.slots = clone(grp.slots); }
          scr.group = ''; scr.own = false; grp = null; newGroupName = null;
        } else {
          scr.group = v; scr.own = false; newGroupName = null;
          grp = clone(s.groups.find(g => g.id === v));
        }
      }));
      const groupRow = [h('label', { class: 'field' }, h('span', null, t('Gruppe')), groupSel)];
      if (newGroupName != null) {
        const gn = h('input', { class: 'input', value: newGroupName, maxlength: 40 });
        gn.addEventListener('input', () => { newGroupName = gn.value; draftTouched = true; refreshStatus(true); });
        groupRow.push(h('label', { class: 'field' }, h('span', null, t('Name der neuen Gruppe')), gn));
      } else if (grp) {
        const gn = h('input', { class: 'input', value: grp.name, maxlength: 40 });
        gn.addEventListener('input', () => { grp.name = gn.value; draftTouched = true; refreshStatus(true); });
        groupRow.push(h('label', { class: 'field' }, h('span', null, t('Name der Gruppe')), gn));
      }
      const ownCb = h('input', { type: 'checkbox' });
      ownCb.checked = Boolean(scr.own);
      ownCb.addEventListener('change', () => change(() => {
        if (ownCb.checked) { scr.own = true; if (grp) { scr.layout = grp.layout; scr.slots = clone(grp.slots); } } else scr.own = false;
      }));
      const members = grp ? P().byNum(s).filter(x => x.group === grp.id && x.id !== savedId) : [];

      // ---- layout + modules (of the group while following it)
      const target = ab();
      const layoutSeg = h('div', { class: 'seg', role: 'group' }, E.PAGE_LAYOUTS[scr.kind].map(l => h('button', {
        'aria-pressed': String(target.layout === l),
        onclick: () => change(() => {
          const n = E.SLOT_COUNT[l];
          const all = target.slots;
          // fewer areas keep every module: the extra areas move into the last one
          if (n < all.length) { const rest = all.splice(n).flat(); all[n - 1].push(...rest); }
          while (all.length < n) all.push([]);
          target.layout = l;
        }),
      }, t(P().LAYOUTS[l]))));
      const slotsEl = target.slots.map((sl, si) => h('div', { class: 'pe-slot' },
        h('div', { class: 'pe-slot-head' }, h('b', null, t(P().SLOT_NAMES[target.layout][si] || '')), h('small', null, sl.length + ' / 8')),
        ...sl.map((m, mi) => moduleCard(m, si, mi)),
        sl.length < 8 ? h('button', { class: 'btn pe-add', 'aria-expanded': String(addOpen === si), onclick: () => { addOpen = addOpen === si ? -1 : si; render(); } }, icon('plus'), t('Modul')) : null,
        addOpen === si ? addMenu(si) : null));

      const kindNote = scr.kind === 'show'
        ? t('Anzeige-Screen: nur Anzeige, für Bildschirme ohne Touch. Module zum Senden oder Bestätigen gibt es hier nicht.')
        : t('Moderations-Screen: für Handy oder Tablet, mit allen Modulen.');
      const following = scr.group && !scr.own && grp;

      form.replaceChildren(...[
        h('p', { class: 'help pe-kindnote' }, h('span', { class: 'pe-kind', 'data-kind': scr.kind }, t(P().KIND_NAMES[scr.kind])), ' ', kindNote),
        h('div', { class: 'pe-grid3' },
          h('label', { class: 'field' }, h('span', null, t('Nummer')), numSel),
          h('label', { class: 'field' }, h('span', null, t('Name')), name),
          h('label', { class: 'field' }, h('span', null, t('Zweite Adresse')), h('div', { class: 'pe-slug' }, h('span', null, '/p/'), slugIn))),
        h('div', { class: 'grid2' }, ...groupRow),
        grp ? h('label', { class: 'switch' }, ownCb, t('Eigener Aufbau'), h('span', { class: 'help' }, ' – ' + t('dieser Screen weicht von der Gruppe ab'))) : null,
        following ? h('p', { class: 'pe-banner' }, icon('copy'), h('span', null, t('Du bearbeitest den Aufbau der Gruppe') + ' „' + grp.name + '“' + (members.length ? ' – ' + t('gilt auch für') + ' ' + members.map(P().screenLabel).join(', ') : '') + '.')) : null,
        newGroupName != null ? h('p', { class: 'pe-banner' }, icon('copy'), h('span', null, t('Die neue Gruppe übernimmt diesen Aufbau. Weitere Screens wählen sie dann unter „Gruppe“ aus.'))) : null,
        h('div', { class: 'field' }, h('span', null, t('Layout')), layoutSeg),
        h('div', { class: 'pe-slots', 'data-n': target.slots.length }, ...slotsEl),
        savedId ? h('div', { class: 'section' }, armed(h('button', { class: 'btn btn-quiet' }, icon('trash'), t('Screen löschen')), () => {
          ctx.act({ type: 'screen.remove', screenId: savedId });
          toast(t('Screen gelöscht.'));
          close(true);
        })) : null].filter(Boolean));

      // ---- preview + address
      const list = DEVICES[scr.kind];
      if (!device || !list.some(d => d[0] === device)) device = list[0][0];
      pvDevices.replaceChildren(...list.map(([k, l]) => h('button', { 'aria-pressed': String(device === k), onclick: () => { device = k; render(); mountPreview(); } }, t(l))));
      pvDevices.hidden = list.length < 2;
      const saved = savedId && s.screens.find(p => p.id === savedId);
      pvFoot.replaceChildren(...(saved
        ? [h('div', { class: 'qr-grid' }, ctx.qrCard(P().screenLabel(saved), ctx.pageUrl(saved))), ctx.linkLine(ctx.pageUrl(saved))]
        : [h('p', { class: 'help' }, t('Adresse und QR-Code gibt es nach „Übernehmen“.'))]));
      preparePreview();
      if (!pvCleanup) mountPreview();
    }
    function refreshStatus(prep) {
      const isDirty = dirty();
      status.textContent = !savedId ? t('Neu – noch nicht live') : isDirty ? t('Entwurf – noch nicht live') : t('Live');
      status.dataset.state = !savedId || isDirty ? 'draft' : 'live';
      applyBtn.disabled = Boolean(savedId) && !isDirty;
      discardBtn.hidden = !savedId || !isDirty;
      if (prep) preparePreview();
    }

    current = { close, render };
    render();
    if (!picking) setTimeout(mountPreview, 0);
  }

  root.ETPageEditor = { tab, open, isOpen: () => Boolean(current) };
})(globalThis);
