/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Event Timer – core engine (pure, no DOM).
 * Same rules are implemented in Rust (src/engine.rs). Both are checked
 * against tests/scenarios.json – change both together.
 */
(function (root) {
  'use strict';

  const MAX_TIMERS = 8;
  const MAX_ITEMS = 200;
  const MAX_PRESETS = 30;
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;

  const FONTS = ['din', 'grotesk', 'mono', 'serif', 'rounded'];
  const BG_STYLES = ['solid', 'glow', 'transparent'];
  const FLASH_STYLES = ['off', 'soft', 'hard'];
  const KINDS = ['countdown', 'countup', 'clock', 'time'];
  // kinds that don't count by themselves (wall clock, mirror of the run of show)
  const isStatic = k => k === 'time';
  const COLOR_KEYS = ['bg', 'fg', 'accent', 'warn', 'crit', 'overBg', 'overFg', 'msgFg', 'msgBg'];
  const PRESET_BOOLS = ['showProgress', 'showClock', 'showTitle', 'showNext', 'showNotice', 'flashOver', 'showEnd'];
  const PRESET_TEXTS = ['warnText', 'expiredText', 'overText'];

  const BUILTIN_PRESETS = [
    {
      id: 'stage', name: 'Bühne', builtin: true,
      bg: '#000000', bgStyle: 'solid', fg: '#ffffff', accent: '#4cc07f', warn: '#e3ab45', crit: '#e5534b',
      overBg: '#4a0710', overFg: '#ffffff', msgFg: '#000000', msgBg: '#e3ab45',
      font: 'din', weight: 700,
      showProgress: true, showClock: true, showTitle: true, showNext: true, showNotice: true, flashOver: true, showEnd: true, flashStyle: 'soft',
      warnText: 'Bitte zum Ende kommen', expiredText: 'Zeit abgelaufen', overText: 'Überzeit',
    },
    {
      id: 'daylight', name: 'Daylight', builtin: true,
      bg: '#eceef1', bgStyle: 'solid', fg: '#111418', accent: '#1b6e42', warn: '#835509', crit: '#b8342b',
      overBg: '#b8342b', overFg: '#ffffff', msgFg: '#ffffff', msgBg: '#111418',
      font: 'grotesk', weight: 700,
      showProgress: true, showClock: true, showTitle: true, showNext: true, showNotice: true, flashOver: true, showEnd: true, flashStyle: 'soft',
      warnText: 'Bitte zum Ende kommen', expiredText: 'Zeit abgelaufen', overText: 'Überzeit',
    },
    {
      id: 'overlay', name: 'Overlay (Keying)', builtin: true,
      bg: '#000000', bgStyle: 'transparent', fg: '#ffffff', accent: '#4cc07f', warn: '#e3ab45', crit: '#e5534b',
      overBg: '#b8342b', overFg: '#ffffff', msgFg: '#000000', msgBg: '#e3ab45',
      font: 'din', weight: 700,
      showProgress: false, showClock: false, showTitle: false, showNext: false, showNotice: false, flashOver: false, showEnd: false, flashStyle: 'off',
      warnText: '', expiredText: '', overText: '',
    },
    {
      id: 'minimal', name: 'Nur Ziffern', builtin: true,
      bg: '#000000', bgStyle: 'solid', fg: '#ffffff', accent: '#4cc07f', warn: '#e3ab45', crit: '#e5534b',
      overBg: '#000000', overFg: '#e5534b', msgFg: '#000000', msgBg: '#ffffff',
      font: 'mono', weight: 600,
      showProgress: false, showClock: false, showTitle: false, showNext: false, showNotice: false, flashOver: true, showEnd: false, flashStyle: 'soft',
      warnText: '', expiredText: '', overText: '',
    },
  ];

  const DEFAULT_STAGE = ['Brauche 2 Minuten mehr', 'Mikrofon-Problem', 'Frage aus dem Saal', 'Technik bitte kommen', 'Bitte Pause einlegen', 'Alles okay'];
  const DEFAULT_TALK = ['Noch 5 Minuten', 'Noch 1 Minute', 'Bitte zum Ende kommen', 'Bitte strecken', 'Keine Fragen mehr', 'Einspieler kommt', 'Mikrofon ist aus', 'Technisches Problem – bitte überbrücken'];
  // talkback defaults up to 1.5.2 – an untouched old list is swapped for the new one
  const OLD_TALK = ['Noch 5 Minuten', 'Bitte zum Ende kommen', 'Letzte Frage', 'Mikrofon ist aus', 'Fragen aus dem Saal nehmen', 'Pause wird verlängert'];
  const DEFAULT_QUICK = ['Bitte zum Ende kommen', 'Lauter sprechen', 'Näher ans Mikrofon', 'Letzte Frage', 'Langsamer sprechen'];

  // ---------- helpers ----------
  const clone = v => JSON.parse(JSON.stringify(v));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, lo, hi, fallback) => (isNum(Number(v)) && v !== null && v !== '' && typeof v !== 'boolean' ? clamp(Math.round(Number(v)), lo, hi) : fallback);
  const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const color = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v).toLowerCase() : fallback);
  const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const hhmm = v => (HHMM.test(String(v == null ? '' : v).trim()) ? String(v).trim() : '');
  const minutesOf = v => { const m = HHMM.exec(v || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  /** start→end in ms, past midnight if end is earlier */
  const spanMs = (a, b) => { const d = minutesOf(b) - minutesOf(a); return (d <= 0 ? d + 1440 : d) * 60000; };

  function newTimer(slot) {
    return {
      id: 't' + slot,
      name: 'Timer ' + slot,
      kind: 'countdown',
      durationMs: 10 * 60 * 1000,
      targetAt: null,
      targetLabel: '',
      running: false,
      baseMs: 10 * 60 * 1000,
      since: null,
      overtime: true,
      warnMs: 2 * 60 * 1000,
      critMs: 60 * 1000,
      presetId: 'stage',
      segmentId: null,
    };
  }

  function defaultState() {
    return {
      v: 1,
      rev: 0,
      seq: 0,
      event: { title: '' },
      blackout: false,
      timers: [newTimer(1)],
      presets: clone(BUILTIN_PRESETS),
      quickMessages: DEFAULT_QUICK.slice(),
      stageQuick: DEFAULT_STAGE.slice(),
      requests: [],
      talkQuick: DEFAULT_TALK.slice(),
      talkback: [],
      agenda: { timerId: 't1', plannedStart: '', autoStart: true, cursor: -1, items: [] },
      // outputs: what the devices show, each with an address /1…/16 (show = display only, mod = presenter, touch)
      screens: [
        defaultScreen('p1', 1, 'show', 'DSM', 'dsm', templateAufbau('dsm', 't1'), 1),
        defaultScreen('p2', 2, 'mod', 'Moderation', 'moderation', templateAufbau('mod', 't1'), 2),
      ],
      // screens that show the same thing; members follow the group's layout unless "own" is set
      groups: [],
      // overlays per screen id (or "plan" for the fixed /plan page)
      dsmMsg: {},
    };
  }

  // ---------- derived values ----------
  /** Raw signed value: remaining (countdown/clock) or elapsed (countup). */
  function rawValue(t, now) {
    if (isStatic(t.kind)) return 0;
    if (t.kind === 'clock') return t.targetAt == null ? 0 : t.targetAt - now;
    if (!t.running || t.since == null) return t.baseMs;
    return t.kind === 'countup' ? t.baseMs + (now - t.since) : t.baseMs - (now - t.since);
  }

  /**
   * Everything a display needs. ms is what to show (never negative when
   * overtime is off), over = beyond the limit, phase drives colours.
   */
  function timerView(t, now) {
    // 'time' just shows the wall clock – nothing counts
    if (isStatic(t.kind)) return { ms: 0, over: false, phase: 'normal', state: 'running', progress: 0, remaining: Infinity };
    const raw = rawValue(t, now);
    let ms, over, remaining;
    if (t.kind === 'countup') {
      ms = Math.max(0, raw);
      remaining = t.durationMs > 0 ? t.durationMs - ms : Infinity;
      over = t.durationMs > 0 && remaining < 0;
    } else {
      remaining = raw;
      over = raw < 0;
      ms = over && !t.overtime ? 0 : raw;
    }
    const finished = t.kind !== 'countup' && !t.overtime && raw <= 0 && !(t.kind === 'clock' && t.targetAt == null);
    // a threshold as long as the whole timer would colour it from the start: halve it (warn) or quarter it (crit)
    const dur = t.kind === 'countdown' || t.kind === 'countup' ? t.durationMs : 0;
    const warnMs = dur > 0 && t.warnMs >= dur ? Math.floor(dur / 2) : t.warnMs;
    const critMs = dur > 0 && t.critMs >= dur ? Math.floor(dur / 4) : t.critMs;
    let phase = 'normal';
    if (over || finished) phase = 'over';
    else if (remaining <= critMs && remaining !== Infinity) phase = 'crit';
    else if (remaining <= warnMs && remaining !== Infinity) phase = 'warn';
    let state;
    if (t.kind === 'clock') state = t.targetAt == null ? 'idle' : finished ? 'finished' : 'running';
    else if (finished) state = 'finished';
    else if (t.running) state = 'running';
    else if ((t.kind === 'countdown' && t.baseMs === t.durationMs) || (t.kind === 'countup' && t.baseMs === 0)) state = 'idle';
    else state = 'paused';
    let progress = 0;
    if (t.kind === 'countdown' && t.durationMs > 0) progress = clamp(1 - remaining / t.durationMs, 0, 1);
    else if (t.kind === 'countup' && t.durationMs > 0) progress = clamp(ms / t.durationMs, 0, 1);
    else if (t.kind === 'clock') progress = over ? 1 : 0;
    return { ms, over, phase, state, progress, remaining };
  }

  /**
   * When the timer reaches zero, as epoch ms – for "Ende 14:32". Only for timers with an end
   * (countdown, count-up with limit) that have been started. state: running | paused | past.
   */
  function endInfo(t, now) {
    if (!(t.kind === 'countdown' || (t.kind === 'countup' && t.durationMs > 0))) return null;
    const v = timerView(t, now);
    if (v.state === 'idle' || v.remaining === Infinity) return null;
    const state = v.remaining <= 0 || v.state === 'finished' ? 'past' : v.state === 'paused' ? 'paused' : 'running';
    return { at: now + v.remaining, state };
  }

  /** Run-of-show summary: drift (+ = behind schedule) and projected end. */
  function agendaView(s, now) {
    const a = s.agenda;
    let drift = 0;
    let remainingPlanned = 0;
    let currentElapsed = 0;
    a.items.forEach((it, i) => {
      if (i < a.cursor && it.startedAt != null) {
        const end = it.endedAt != null ? it.endedAt : now;
        drift += (end - it.startedAt) - it.durationMs;
      } else if (i === a.cursor) {
        if (it.startedAt != null) {
          currentElapsed = now - it.startedAt;
          drift += Math.max(0, currentElapsed - it.durationMs);
          remainingPlanned += Math.max(0, it.durationMs - currentElapsed);
        } else {
          remainingPlanned += it.durationMs;
        }
      } else if (i > a.cursor) {
        remainingPlanned += it.durationMs;
      }
    });
    const totalPlanned = a.items.reduce((sum, it) => sum + it.durationMs, 0);
    return {
      started: a.cursor >= 0,
      done: a.items.length > 0 && a.cursor >= a.items.length,
      drift,
      projectedEnd: now + remainingPlanned,
      totalPlanned,
      current: a.items[a.cursor] || null,
      next: a.items[a.cursor + 1] || null,
      currentElapsed,
    };
  }

  // ---------- mutation helpers ----------
  function findTimer(s, id) {
    return s.timers.find(t => t.id === id) || null;
  }

  /** Countdown without overtime that hit zero is stopped for real. */
  function settle(t, now) {
    if (t.kind !== 'clock' && t.kind !== 'countup' && t.running && !t.overtime && rawValue(t, now) <= 0) {
      t.running = false;
      t.since = null;
      t.baseMs = 0;
    }
  }

  function freeze(t, now) {
    if (t.running) {
      t.baseMs = rawValue(t, now);
      t.since = now;
    }
  }

  function segmentStarted(s, t, now) {
    if (!t.segmentId) return;
    const seg = s.agenda.items.find(it => it.id === t.segmentId);
    if (seg && seg.startedAt == null) seg.startedAt = now;
  }

  function startTimer(s, t, now) {
    if (t.kind === 'clock' || isStatic(t.kind) || t.running) return;
    if (t.kind === 'countdown' && t.baseMs <= 0 && !t.overtime) return;
    t.running = true;
    t.since = now;
    segmentStarted(s, t, now);
  }

  function pauseTimer(t, now) {
    if (t.kind === 'clock' || isStatic(t.kind) || !t.running) return;
    t.baseMs = rawValue(t, now);
    t.running = false;
    t.since = null;
  }

  function resetTimer(t) {
    t.running = false;
    t.since = null;
    t.baseMs = t.kind === 'countup' ? 0 : t.durationMs;
    if (t.kind === 'clock') { t.targetAt = null; t.targetLabel = ''; t.kind = 'countdown'; t.baseMs = t.durationMs; }
  }

  function sanitizePreset(p, base) {
    const out = { id: base.id, name: text(p.name, 40) || base.name, builtin: false };
    for (const k of COLOR_KEYS) out[k] = color(p[k], base[k]);
    out.bgStyle = pick(p.bgStyle, BG_STYLES, base.bgStyle);
    out.font = pick(p.font, FONTS, base.font);
    out.weight = num(p.weight, 300, 900, base.weight);
    for (const k of PRESET_BOOLS) out[k] = k in p ? Boolean(p[k]) : base[k];
    for (const k of PRESET_TEXTS) out[k] = k in p ? text(p[k], 60) : base[k];
    // overtime flashing has three levels; without one, "on" means soft (older designs flashed hard)
    out.flashStyle = pick(p.flashStyle, FLASH_STYLES, out.flashOver ? (base.flashStyle && base.flashStyle !== 'off' ? base.flashStyle : 'soft') : 'off');
    out.flashOver = out.flashStyle !== 'off';
    return out;
  }

  /** flashing level of a design, also for designs saved before there were levels */
  const flashStyleOf = p => FLASH_STYLES.includes(p.flashStyle) ? p.flashStyle : p.flashOver === false ? 'off' : 'soft';

  function sanitizeItem(s, raw, keepId) {
    const it = raw || {};
    const out = {
      id: keepId || ('s' + (++s.seq)),
      title: text(it.title, 80),
      speaker: text(it.speaker, 80),
      durationMs: num(it.durationMs, 0, DAY, 10 * 60 * 1000),
      note: text(it.note, 300),
      start: hhmm(it.start),
      end: hhmm(it.end),
      // a buffer may be shortened to balance the time account (Zeitkonto)
      buffer: Boolean(it.buffer),
      cues: [],
      startedAt: null,
      endedAt: null,
    };
    if (out.start && out.end) out.durationMs = spanMs(out.start, out.end);
    // planned length: follows the duration until the show starts, then stays put
    out.planMs = s.agenda && s.agenda.cursor >= 0 ? 0 : out.durationMs;
    return out;
  }

  function loadSegment(s, index, now) {
    const a = s.agenda;
    const t = findTimer(s, a.timerId) || s.timers[0];
    const prev = a.items[a.cursor];
    if (prev && prev.startedAt != null && prev.endedAt == null) prev.endedAt = now;
    if (index >= a.items.length) {
      a.cursor = a.items.length;
      if (t) { pauseTimer(t, now); t.segmentId = null; }
      return;
    }
    a.cursor = index;
    const seg = a.items[index];
    seg.startedAt = null;
    seg.endedAt = null;
    if (!t) return;
    t.kind = 'countdown';
    t.targetAt = null;
    t.targetLabel = '';
    t.durationMs = seg.durationMs;
    t.baseMs = seg.durationMs;
    t.running = false;
    t.since = null;
    t.segmentId = seg.id;
    // a new slot starts clean: overlays for the previous speaker go away
    s.dsmMsg = {};
    if (a.autoStart) startTimer(s, t, now);
  }

  // ---------- screens ----------
  const MAX_SCREENS = 16;
  const MAX_GROUPS = 8;
  const MAX_SLOT_MODULES = 8;
  const PAGE_LAYOUTS = { show: ['full', 'side', 'bottom'], mod: ['two', 'one'] };
  const SLOT_COUNT = { full: 1, side: 2, bottom: 2, one: 1, two: 2 };
  /** module type → screen kinds that may use it (display screens are no touch screens: nothing interactive there) */
  const MODULE_KINDS = {
    timer: ['show', 'mod'], clock: ['show', 'mod'], next: ['show', 'mod'], agenda: ['show', 'mod'], message: ['show', 'mod'],
    note: ['mod'], talkback: ['mod'], request: ['mod'],
  };
  const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

  /** Starting layouts (also used for the fixed pages /plan, /uhr and the fallback /moderation). */
  function templateAufbau(name, timerId) {
    const tm = { type: 'timer', opts: { timer: timerId || 't1', variant: 'full' } };
    switch (name) {
      case 'agenda': return { kind: 'show', layout: 'side', slots: [[tm], [{ type: 'agenda', opts: {} }]] };
      case 'clock': return { kind: 'show', layout: 'full', slots: [[{ type: 'clock', opts: { seconds: true } }]] };
      case 'mod': return { kind: 'mod', layout: 'two', slots: [[tm, { type: 'note', opts: {} }, { type: 'agenda', opts: {} }], [{ type: 'talkback', opts: {} }, { type: 'request', opts: {} }]] };
      case 'empty-show': return { kind: 'show', layout: 'full', slots: [[]] };
      case 'empty-mod': return { kind: 'mod', layout: 'two', slots: [[], []] };
      default: return { kind: 'show', layout: 'full', slots: [[tm]] };
    }
  }
  function defaultScreen(id, num, kind, name, slug, a, base) {
    let n = 0;
    return { id, num, kind, name, slug, group: '', own: false, layout: a.layout, slots: a.slots.map(sl => sl.map(m => ({ id: 'm' + base + (n++), type: m.type, opts: clone(m.opts) }))) };
  }
  /** next free id like "p7" – skips ids that already exist */
  function newId(s, prefix, list) {
    let id;
    do { id = prefix + (++s.seq); } while (list.some(x => x.id === id));
    return id;
  }

  function sanitizeModule(s, raw, kind, used) {
    if (!raw || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(MODULE_KINDS, raw.type) || !MODULE_KINDS[raw.type].includes(kind)) return null;
    const o = raw.opts && typeof raw.opts === 'object' ? raw.opts : {};
    const id = typeof raw.id === 'string' && /^m\d{1,9}$/.test(raw.id) && !used.has(raw.id) ? raw.id : 'm' + (++s.seq);
    used.add(id);
    let opts = {};
    if (raw.type === 'timer') opts = { timer: typeof o.timer === 'string' && /^t[1-8]$/.test(o.timer) ? o.timer : 't1', variant: pick(o.variant, ['full', 'clock', 'lower'], 'full') };
    else if (raw.type === 'clock') opts = { seconds: 'seconds' in o ? Boolean(o.seconds) : true };
    else if (raw.type === 'message') opts = { page: typeof o.page === 'string' && /^[a-z0-9]{1,20}$/.test(o.page) ? o.page : '' };
    return { id, type: raw.type, opts };
  }

  /** layout + slots, cleaned for the given kind */
  function sanitizeAufbau(s, raw, kind) {
    const layout = pick(raw.layout, PAGE_LAYOUTS[kind], PAGE_LAYOUTS[kind][0]);
    const used = new Set();
    const slots = [];
    for (let i = 0; i < SLOT_COUNT[layout]; i++) {
      const src = Array.isArray(raw.slots) && Array.isArray(raw.slots[i]) ? raw.slots[i] : [];
      const out = [];
      for (const m of src) {
        if (out.length >= MAX_SLOT_MODULES) break;
        const mod = sanitizeModule(s, m, kind, used);
        if (mod) out.push(mod);
      }
      slots.push(out);
    }
    return { layout, slots };
  }

  /** lowest address 1…16 no other screen uses */
  function freeNum(s, exceptId) {
    for (let n = 1; n <= MAX_SCREENS; n++) if (!s.screens.some(x => x.id !== exceptId && x.num === n)) return n;
    return 0;
  }

  function sanitizeScreen(s, raw, old) {
    const id = old ? old.id : newId(s, 'p', s.screens);
    const kind = old ? old.kind : pick(raw.kind, ['show', 'mod'], 'show');
    const name = text(raw.name, 40) || (kind === 'show' ? 'Screen' : 'Moderation');
    const taken = n => s.screens.some(x => x.id !== id && x.num === n);
    let num = typeof raw.num === 'number' && Number.isInteger(raw.num) && raw.num >= 1 && raw.num <= MAX_SCREENS && !taken(raw.num) ? raw.num : 0;
    if (!num) num = old && !taken(old.num) ? old.num : freeNum(s, id);
    const want = typeof raw.slug === 'string' && SLUG.test(raw.slug) ? raw.slug : 'screen-' + id.slice(1);
    let slug = want, n = 2;
    while (s.screens.some(p => p.id !== id && p.slug === slug)) slug = want.slice(0, 36) + '-' + (n++);
    const g = typeof raw.group === 'string' ? s.groups.find(x => x.id === raw.group && x.kind === kind) : null;
    const a = sanitizeAufbau(s, raw, kind);
    return { id, num, kind, name, slug, group: g ? g.id : '', own: g ? Boolean(raw.own) : false, layout: a.layout, slots: a.slots };
  }

  /** valid, de-duplicated overlay targets: display screens and the fixed page "plan" */
  function dsmIds(s, list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const id of list.slice(0, 32)) {
      if (typeof id !== 'string' || out.includes(id)) continue;
      if (id === 'plan' || s.screens.some(p => p.id === id && p.kind === 'show')) out.push(id);
    }
    return out;
  }

  /**
   * Up to 1.6.0-beta.1 timers had addresses (/N) and custom pages could stand in for them.
   * Now every address is a screen: timer N → screen N showing that timer (or the page that stood in
   * for /N), other pages get the next free numbers, and there is always a presenter screen.
   */
  function migrateScreens(st) {
    if (Array.isArray(st.screens)) return;
    const pages = Array.isArray(st.pages) ? st.pages : [];
    const routes = st.routes && typeof st.routes === 'object' ? st.routes : {};
    const old = st.dsmMsg && typeof st.dsmMsg === 'object' ? st.dsmMsg : {};
    const fresh = { screens: [], groups: [], seq: st.seq || 0 };
    const msg = {};
    const add = (raw, num, keepId) => {
      const sc = sanitizeScreen(fresh, Object.assign({}, raw, { num, kind: raw.kind === 'mod' ? 'mod' : 'show', group: '' }), null);
      if (keepId && /^p\d{1,9}$/.test(keepId) && !fresh.screens.some(x => x.id === keepId)) sc.id = keepId;
      fresh.screens.push(sc);
      return sc;
    };
    const used = new Set();
    for (const tm of st.timers || []) {
      const n = Number(tm.id.slice(1));
      const pg = routes[String(n)] && pages.find(p => p.id === routes[String(n)]);
      const sc = pg ? add(pg, n, pg.id) : add(Object.assign({ name: 'DSM ' + n, slug: 'dsm-' + n }, templateAufbau('dsm', tm.id)), n);
      if (pg) used.add(pg.id);
      const m = old[pg ? pg.id : 'd' + n];
      if (m && m.text) msg[sc.id] = m;
    }
    for (const pg of pages) {
      if (used.has(pg.id) || fresh.screens.length >= MAX_SCREENS) continue;
      const sc = add(pg, freeNum(fresh, ''), pg.id);
      if (old[pg.id] && old[pg.id].text) msg[sc.id] = old[pg.id];
    }
    if (!fresh.screens.some(x => x.kind === 'mod') && fresh.screens.length < MAX_SCREENS) {
      const at = st.agenda && st.agenda.timerId ? st.agenda.timerId : 't1';
      add(Object.assign({ name: 'Moderation', slug: 'moderation' }, templateAufbau('mod', at)), freeNum(fresh, ''));
    }
    if (old.plan && old.plan.text) msg.plan = old.plan;
    st.screens = fresh.screens;
    st.groups = [];
    st.seq = fresh.seq;
    st.dsmMsg = msg;
    delete st.pages; delete st.routes;
  }

  // ---------- reducer ----------
  /**
   * Applies one action. Returns true when the state changed.
   * `now` is passed in so the engine stays pure and testable.
   */
  function apply(s, action, now) {
    if (!action || typeof action.type !== 'string') return false;
    const changed = applyInner(s, action, now);
    if (changed) s.rev += 1;
    return changed;
  }

  function applyInner(s, a, now) {
    s.timers.forEach(t => settle(t, now));
    const t = a.id ? findTimer(s, a.id) : null;

    switch (a.type) {
      case 'timer.add': {
        if (s.timers.length >= MAX_TIMERS) return false;
        let slot = 1;
        while (s.timers.some(x => x.id === 't' + slot)) slot++;
        const nt = newTimer(slot);
        s.timers.push(nt);
        s.timers.sort((x, y) => Number(x.id.slice(1)) - Number(y.id.slice(1)));
        return true;
      }
      case 'timer.remove': {
        if (!t || s.timers.length <= 1) return false;
        s.timers = s.timers.filter(x => x !== t);
        if (s.agenda.timerId === t.id) s.agenda.timerId = s.timers[0].id;
        return true;
      }
      case 'timer.update': {
        if (!t) return false;
        const p = a.patch || {};
        if ('name' in p) { const n = text(p.name, 40); if (n) t.name = n; }
        if ('overtime' in p) { freeze(t, now); t.overtime = Boolean(p.overtime); }
        if ('warnMs' in p) t.warnMs = num(p.warnMs, 0, HOUR, t.warnMs);
        if ('critMs' in p) t.critMs = num(p.critMs, 0, HOUR, t.critMs);
        if (t.critMs > t.warnMs) { const w = t.warnMs; t.warnMs = t.critMs; t.critMs = w; }
        if ('presetId' in p && s.presets.some(x => x.id === p.presetId)) t.presetId = p.presetId;
        if ('kind' in p && ['countdown', 'countup', 'time'].includes(p.kind) && p.kind !== t.kind) {
          t.kind = p.kind;
          t.targetAt = null;
          t.targetLabel = '';
          resetTimer(t);
        }
        return true;
      }
      case 'timer.start': if (!t) return false; startTimer(s, t, now); return true;
      case 'timer.pause': if (!t) return false; pauseTimer(t, now); return true;
      case 'timer.toggle':
        if (!t) return false;
        if (t.running) pauseTimer(t, now); else startTimer(s, t, now);
        return true;
      case 'timer.reset':
        if (!t) return false;
        resetTimer(t);
        return true;
      case 'timer.set': {
        if (!t) return false;
        const ms = num(a.ms, 0, DAY, null);
        if (ms == null) return false;
        if (t.kind === 'clock' || isStatic(t.kind)) { t.kind = 'countdown'; t.targetAt = null; t.targetLabel = ''; }
        t.durationMs = ms;
        t.running = false;
        t.since = null;
        t.baseMs = t.kind === 'countup' ? 0 : ms;
        if (a.start) startTimer(s, t, now);
        return true;
      }
      case 'timer.adjust': {
        if (!t || t.kind === 'clock' || isStatic(t.kind)) return false;
        const delta = num(a.ms, -HOUR, HOUR, 0);
        if (!delta) return false;
        freeze(t, now);
        let next = t.baseMs + delta;
        if (t.kind === 'countup') next = Math.max(0, next);
        else if (!t.overtime) next = Math.max(0, next);
        t.baseMs = next;
        if (t.kind === 'countdown' && next > t.durationMs) t.durationMs = next;
        return true;
      }
      case 'timer.target': {
        if (!t) return false;
        const at = num(a.at, 0, 8.64e15, null);
        if (at == null) return false;
        t.kind = 'clock';
        t.targetAt = at;
        t.targetLabel = text(a.label, 16);
        t.running = false;
        t.since = null;
        t.baseMs = 0;
        return true;
      }
      // ----- DSM overlays: one per DSM page, sent to an explicit list of pages
      case 'dsm.message': {
        const ids = dsmIds(s, a.pages);
        if (!ids.length) return false;
        let changed = false;
        for (const id of ids) {
          let m = s.dsmMsg[id];
          if (!m) {
            if (!('text' in a)) continue;
            m = s.dsmMsg[id] = { text: '', flash: false, visible: false };
          }
          if ('text' in a) { m.text = String(a.text == null ? '' : a.text).trim().slice(0, 280); m.visible = m.text.length > 0; }
          if ('flash' in a) m.flash = Boolean(a.flash);
          if ('visible' in a) m.visible = Boolean(a.visible) && m.text.length > 0;
          changed = true;
        }
        return changed;
      }
      case 'dsm.clear': {
        let changed = false;
        for (const id of dsmIds(s, a.pages)) if (s.dsmMsg[id]) { delete s.dsmMsg[id]; changed = true; }
        return changed;
      }

      // ----- screens and groups
      case 'screen.save': {
        if (!a.screen || typeof a.screen !== 'object' || Array.isArray(a.screen)) return false;
        const old = s.screens.find(p => p.id === a.screen.id);
        if (!old && s.screens.length >= MAX_SCREENS) return false;
        const sc = sanitizeScreen(s, a.screen, old);
        // "+ neue Gruppe": the group starts with this screen's layout, the screen follows it
        if (a.newGroup && typeof a.newGroup === 'object' && s.groups.length < MAX_GROUPS) {
          const g = { id: newId(s, 'g', s.groups), name: text(a.newGroup.name, 40) || sc.name, kind: sc.kind, layout: sc.layout, slots: clone(sc.slots) };
          s.groups.push(g);
          sc.group = g.id;
          sc.own = false;
        }
        if (old) s.screens[s.screens.indexOf(old)] = sc; else s.screens.push(sc);
        return true;
      }
      case 'screen.remove': {
        const sc = s.screens.find(p => p.id === a.screenId);
        if (!sc) return false;
        s.screens = s.screens.filter(p => p !== sc);
        delete s.dsmMsg[sc.id];
        return true;
      }
      case 'group.save': {
        const g = a.group && typeof a.group === 'object' ? s.groups.find(x => x.id === a.group.id) : null;
        if (!g) return false;
        g.name = text(a.group.name, 40) || g.name;
        const ab = sanitizeAufbau(s, a.group, g.kind);
        g.layout = ab.layout;
        g.slots = ab.slots;
        return true;
      }
      case 'group.remove': {
        const g = s.groups.find(x => x.id === a.groupId);
        if (!g) return false;
        // members keep what they showed: they get the group's layout as their own
        s.screens.forEach(sc => {
          if (sc.group !== g.id) return;
          if (!sc.own) { sc.layout = g.layout; sc.slots = clone(g.slots); }
          sc.group = '';
          sc.own = false;
        });
        s.groups = s.groups.filter(x => x !== g);
        return true;
      }

      case 'blackout.set': s.blackout = Boolean(a.value); return true;
      case 'blackout.toggle': s.blackout = !s.blackout; return true;
      case 'event.update': s.event.title = text(a.title, 80); return true;
      case 'quick.set':
        if (!Array.isArray(a.list)) return false;
        s.quickMessages = a.list.map(x => text(x, 80)).filter(Boolean).slice(0, 12);
        return true;

      case 'preset.save': {
        const p = a.preset || {};
        const existing = s.presets.find(x => x.id === p.id);
        if (existing && !existing.builtin) {
          Object.assign(existing, sanitizePreset(p, existing));
          return true;
        }
        if (s.presets.filter(x => !x.builtin).length >= MAX_PRESETS) return false;
        const base = existing || s.presets.find(x => x.id === p.baseId) || BUILTIN_PRESETS[0];
        const np = sanitizePreset(p, Object.assign({}, base, { id: 'p' + (++s.seq) }));
        s.presets.push(np);
        if (a.assignTo) { const at = findTimer(s, a.assignTo); if (at) at.presetId = np.id; }
        return true;
      }
      case 'preset.remove': {
        const p = s.presets.find(x => x.id === a.presetId);
        if (!p || p.builtin) return false;
        s.presets = s.presets.filter(x => x !== p);
        s.timers.forEach(x => { if (x.presetId === p.id) x.presetId = 'stage'; });
        return true;
      }

      case 'agenda.settings': {
        const ag = s.agenda;
        if ('timerId' in a && findTimer(s, a.timerId)) ag.timerId = a.timerId;
        if ('plannedStart' in a) ag.plannedStart = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.plannedStart)) ? String(a.plannedStart) : '';
        if ('autoStart' in a) ag.autoStart = Boolean(a.autoStart);
        return true;
      }
      case 'agenda.replace': {
        if (!Array.isArray(a.items)) return false;
        s.agenda.cursor = -1;
        s.agenda.items = a.items.slice(0, MAX_ITEMS).map(it => sanitizeItem(s, it));
        s.timers.forEach(x => { x.segmentId = null; });
        return true;
      }
      case 'agenda.add': {
        const ag = s.agenda;
        if (ag.items.length >= MAX_ITEMS) return false;
        const it = sanitizeItem(s, a.item);
        const idx = num(a.index, 0, ag.items.length, ag.items.length);
        ag.items.splice(idx, 0, it);
        if (ag.cursor >= 0 && idx <= ag.cursor) ag.cursor += 1;
        return true;
      }
      case 'agenda.update': {
        const it = s.agenda.items.find(x => x.id === a.itemId);
        if (!it) return false;
        const p = a.patch || {};
        if ('title' in p) it.title = text(p.title, 80);
        if ('speaker' in p) it.speaker = text(p.speaker, 80);
        if ('note' in p) it.note = text(p.note, 300);
        if ('start' in p) it.start = hhmm(p.start);
        if ('end' in p) it.end = hhmm(p.end);
        if ('buffer' in p) it.buffer = Boolean(p.buffer);
        const fixed = it.start && it.end;
        if ('durationMs' in p || ('start' in p || 'end' in p)) {
          it.durationMs = fixed ? spanMs(it.start, it.end) : num(p.durationMs, 0, DAY, it.durationMs);
          // keep a loaded-but-untouched timer in sync with the edited slot
          const lt = s.timers.find(x => x.segmentId === it.id);
          if (lt && !lt.running && it.startedAt == null) { lt.durationMs = it.durationMs; lt.baseMs = it.durationMs; }
          if (s.agenda.cursor < 0) it.planMs = it.durationMs;
        }
        return true;
      }
      case 'agenda.remove': {
        const ag = s.agenda;
        const idx = ag.items.findIndex(x => x.id === a.itemId);
        if (idx < 0) return false;
        ag.items.splice(idx, 1);
        s.timers.forEach(x => { if (x.segmentId === a.itemId) x.segmentId = null; });
        // removing the live slot steps back one, so "next" loads the slot that followed it
        if (idx <= ag.cursor) ag.cursor -= 1;
        return true;
      }
      case 'agenda.move': {
        const ag = s.agenda;
        const from = ag.items.findIndex(x => x.id === a.itemId);
        if (from < 0) return false;
        const to = num(a.to, 0, ag.items.length - 1, from);
        if (to === from) return false;
        const cur = ag.items[ag.cursor];
        const [it] = ag.items.splice(from, 1);
        ag.items.splice(to, 0, it);
        if (cur) ag.cursor = ag.items.indexOf(cur);
        return true;
      }
      case 'agenda.go': {
        const idx = num(a.index, 0, s.agenda.items.length - 1, null);
        if (idx == null) return false;
        loadSegment(s, idx, now);
        return true;
      }
      case 'agenda.next': {
        const ag = s.agenda;
        if (!ag.items.length || ag.cursor >= ag.items.length) return false;
        loadSegment(s, ag.cursor + 1, now);
        return true;
      }
      case 'agenda.prev': {
        const ag = s.agenda;
        if (ag.cursor <= 0) return false;
        const target = Math.min(ag.cursor, ag.items.length) - 1;
        for (let i = target; i < ag.items.length; i++) { ag.items[i].startedAt = null; ag.items[i].endedAt = null; }
        ag.cursor = -1;
        loadSegment(s, target, now);
        return true;
      }
      // ----- technical cues per slot (Regie only)
      case 'cue.add': {
        const it = s.agenda.items.find(x => x.id === a.itemId);
        if (!it || it.cues.length >= 20) return false;
        it.cues.push({ id: 'c' + (++s.seq), text: text(a.text, 80) || 'Cue', ref: a.ref === 'end' ? 'end' : 'start', offsetMs: num(a.offsetMs, -DAY, DAY, 0), done: false });
        return true;
      }
      case 'cue.update': {
        const it = s.agenda.items.find(x => x.id === a.itemId);
        const c = it && it.cues.find(x => x.id === a.cueId);
        if (!c) return false;
        const p = a.patch || {};
        if ('text' in p) { const tx = text(p.text, 80); if (tx) c.text = tx; }
        if ('ref' in p) c.ref = p.ref === 'end' ? 'end' : 'start';
        if ('offsetMs' in p) c.offsetMs = num(p.offsetMs, -DAY, DAY, c.offsetMs);
        return true;
      }
      case 'cue.remove': {
        const it = s.agenda.items.find(x => x.id === a.itemId);
        if (!it || !it.cues.some(x => x.id === a.cueId)) return false;
        it.cues = it.cues.filter(x => x.id !== a.cueId);
        return true;
      }
      case 'cue.done': {
        const it = s.agenda.items.find(x => x.id === a.itemId);
        const c = it && it.cues.find(x => x.id === a.cueId);
        if (!c) return false;
        c.done = 'done' in a ? Boolean(a.done) : true;
        return true;
      }

      // ----- back channel: stage → control room
      case 'request.send': {
        const tx = text(a.text, 120);
        if (!tx) return false;
        s.requests.push({ id: 'r' + (++s.seq), text: tx, from: text(a.from, 30) || 'Bühne', at: now, ack: false });
        while (s.requests.length > 30) {
          const i = s.requests.findIndex(x => x.ack);
          s.requests.splice(i >= 0 ? i : 0, 1);
        }
        return true;
      }
      case 'request.ack': {
        const r = s.requests.find(x => x.id === a.requestId);
        if (!r || r.ack) return false;
        r.ack = true;
        return true;
      }
      case 'request.ackAll': {
        const open = s.requests.filter(x => !x.ack);
        if (!open.length) return false;
        open.forEach(x => { x.ack = true; });
        return true;
      }
      case 'request.clear':
        if (!s.requests.length) return false;
        s.requests = [];
        return true;
      // ----- talkback: control room → presenter
      case 'talkback.send': {
        const tx = text(a.text, 120);
        if (!tx) return false;
        s.talkback.push({ id: 'k' + (++s.seq), text: tx, at: now, ackAt: null });
        while (s.talkback.length > 20) {
          const i = s.talkback.findIndex(x => x.ackAt != null);
          s.talkback.splice(i >= 0 ? i : 0, 1);
        }
        return true;
      }
      case 'talkback.ack': {
        // with an id: that note; without: everything still open
        const open = s.talkback.filter(x => x.ackAt == null && (a.talkbackId == null || x.id === a.talkbackId));
        if (!open.length) return false;
        open.forEach(x => { x.ackAt = now; });
        return true;
      }
      case 'talkback.clear':
        if (!s.talkback.length) return false;
        s.talkback = [];
        return true;
      case 'talkback.quickSet':
        if (!Array.isArray(a.list)) return false;
        s.talkQuick = a.list.map(x => text(x, 60)).filter(Boolean).slice(0, 12);
        return true;
      case 'stage.quickSet':
        if (!Array.isArray(a.list)) return false;
        s.stageQuick = a.list.map(x => text(x, 60)).filter(Boolean).slice(0, 12);
        return true;

      case 'agenda.reset': {
        s.agenda.cursor = -1;
        // what was played becomes the plan for the next run
        s.agenda.items.forEach(it => { it.startedAt = null; it.endedAt = null; it.planMs = it.durationMs; it.cues.forEach(c => { c.done = false; }); });
        s.timers.forEach(x => { if (x.segmentId) { x.segmentId = null; resetTimer(x); } });
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Planned clock times of the run of show. Each slot starts at its own
   * "start" time or, without one, when the previous slot ends (first slot:
   * planned start). Ends at "end" or start + duration. Local time zone.
   * Times are for orientation only – the show itself runs GO by GO.
   */
  function planView(s, wallNow) {
    const a = s.agenda;
    const d = new Date(wallNow);
    const dayAt = min => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min).getTime();
    let prevEnd = minutesOf(a.plannedStart) != null ? dayAt(minutesOf(a.plannedStart)) : null;
    let prevStart = null;
    const rows = a.items.map((item, index) => {
      const sm = minutesOf(item.start);
      let start = sm != null ? dayAt(sm) : prevEnd;
      if (start != null && prevStart != null && start < prevStart - 12 * HOUR) start += DAY; // past midnight
      if (start != null && prevEnd != null && start < prevEnd) start = prevEnd; // one stage: never overlap
      let end = null;
      if (start != null) {
        const em = minutesOf(item.end);
        if (em != null && sm == null) {
          end = dayAt(em);
          while (end <= start - 12 * HOUR) end += DAY;
          if (end <= start) end = start + item.durationMs;
        } else {
          end = start + item.durationMs;
        }
        prevStart = start;
      }
      prevEnd = end;
      return { item, index, start, end };
    });
    const timed = rows.filter(r => r.start != null);
    return { rows, endAt: timed.length ? Math.max(...timed.map(r => r.end)) : null };
  }
  /**
   * The run of show as it is running (GO by GO): planned times, status per
   * slot and the live slot's remaining time. While the linked timer carries
   * the slot its time counts (pause and ± follow along); otherwise the time
   * since the slot was started.
   * status: done · live · next · todo
   */
  function runView(s, now) {
    const a = s.agenda;
    const n = a.items.length;
    const plan = planView(s, now);
    const rows = plan.rows.map((r, i) => Object.assign(r, { status: i < a.cursor ? 'done' : i === a.cursor ? 'live' : i === a.cursor + 1 ? 'next' : 'todo' }));
    const current = a.cursor >= 0 && a.cursor < n ? rows[a.cursor] : null;
    const view = { rows, current, next: rows[a.cursor + 1] || null, ready: n > 0, started: a.cursor >= 0, finished: n > 0 && a.cursor >= n, endAt: plan.endAt, running: false, remainingMs: null, progress: 0 };
    if (current) {
      const it = current.item;
      const tm = findTimer(s, a.timerId);
      if (tm && tm.segmentId === it.id && tm.kind === 'countdown') {
        const tv = timerView(tm, now);
        view.remainingMs = tv.remaining;
        view.progress = tv.progress;
        view.running = tm.running;
      } else {
        const el = it.startedAt != null ? (it.endedAt != null ? it.endedAt : now) - it.startedAt : 0;
        view.remainingMs = it.durationMs - el;
        view.progress = it.durationMs > 0 ? clamp(el / it.durationMs, 0, 1) : 0;
        view.running = it.startedAt != null && it.endedAt == null;
      }
    }
    return view;
  }
  /**
   * Cues with their due time, counted from when the slot was actually started.
   * status: go (due, waiting for GO) · standby (≤ 60 s) · ready (untimed, slot live/next)
   *         · later · missed (slot over, never fired) · done
   */
  function cueView(s, now) {
    const a = s.agenda;
    const out = [];
    a.items.forEach((it, i) => {
      if (!it.cues || !it.cues.length) return;
      let start = null, end = null;
      if (it.startedAt != null) { start = it.startedAt; end = it.endedAt != null ? it.endedAt : it.startedAt + it.durationMs; }
      const live = i === a.cursor, next = i === a.cursor + 1, over = i < a.cursor;
      it.cues.forEach(c => {
        const base = c.ref === 'end' ? end : start;
        const dueAt = base == null ? null : base + c.offsetMs;
        let status;
        if (c.done) status = 'done';
        else if (over) status = 'missed';
        else if (dueAt == null) status = live || next ? 'ready' : 'later';
        else if (now >= dueAt) status = 'go';
        else if (dueAt - now <= 60000) status = 'standby';
        else status = 'later';
        out.push({ item: it, index: i, cue: c, dueAt, inMs: dueAt == null ? null : dueAt - now, status, live, next });
      });
    });
    const rank = { go: 0, standby: 1, ready: 2, later: 3, missed: 4, done: 5 };
    out.sort((x, y) => rank[x.status] - rank[y.status] || (x.dueAt == null ? Infinity : x.dueAt) - (y.dueAt == null ? Infinity : y.dueAt) || x.index - y.index);
    return out;
  }
  /** Fills fields added in later versions (older saved standalone shows). */
  function normalize(st) {
    const d = defaultState();
    // 1.6: DSM overlays belong to DSM pages, not to timers (timer N → page dN)
    if (!st.dsmMsg || typeof st.dsmMsg !== 'object') {
      st.dsmMsg = {};
      (st.timers || []).forEach(t => { if (t.message && t.message.text) st.dsmMsg['d' + t.id.slice(1)] = { text: t.message.text, flash: Boolean(t.message.flash), visible: Boolean(t.message.visible) }; });
    }
    (st.timers || []).forEach(t => { delete t.message; });
    // 1.6.0-beta.2: timer kind "Ablaufplan" is gone (a screen with timer + agenda does it better)
    (st.timers || []).forEach(t => { if (t.kind === 'schedule') t.kind = 'countdown'; });
    migrateScreens(st);
    for (const k of Object.keys(d)) if (!(k in st)) st[k] = clone(d[k]);
    for (const k of Object.keys(d.agenda)) if (!(k in st.agenda)) st.agenda[k] = clone(d.agenda[k]);
    // built-in designs always come fresh from this version; custom ones are kept
    st.presets = clone(BUILTIN_PRESETS).concat((st.presets || []).filter(p => p && !p.builtin));
    // 1.6.x: designs from before the flashing levels and the end time
    st.presets.forEach(p => { p.flashStyle = flashStyleOf(p); p.flashOver = p.flashStyle !== 'off'; if (!('showEnd' in p)) p.showEnd = true; });
    st.timers.forEach(t => { if (!st.presets.some(p => p.id === t.presetId)) t.presetId = 'stage'; });
    st.agenda.items.forEach(it => {
      if (!Array.isArray(it.cues)) it.cues = [];
      for (const [k, v] of [['start', ''], ['end', ''], ['buffer', false], ['planMs', it.durationMs]]) if (!(k in it)) it[k] = v;
      delete it.extraMs; delete it.rippleMs;
    });
    // 1.5.3: the run of show always runs GO by GO ("by the clock" is gone)
    for (const k of ['mode', 'shiftMs', 'holdAt']) delete st.agenda[k];
    if (Array.isArray(st.talkQuick) && st.talkQuick.join('\n') === OLD_TALK.join('\n')) st.talkQuick = DEFAULT_TALK.slice();
    return st;
  }
  function toHHMM(ms) { const x = new Date(ms); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); }

  // ---------- formatting ----------
  function formatMs(ms, opts) {
    const o = opts || {};
    const neg = ms < 0;
    let total = Math.abs(ms);
    // countdowns round up (shows 0:01 until truly zero); count-ups round down
    total = o.up ? Math.floor(total / 1000) : Math.ceil(total / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = n => String(n).padStart(2, '0');
    const body = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    return (neg ? '+' : '') + body;
  }

  /** "90", "1:30", "1:30:00", "90s", "1h 5m" → ms. */
  function parseDuration(input) {
    const s = String(input || '').trim().toLowerCase().replace(',', '.');
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60000);
    const colon = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (colon) {
      const [, a, b, c] = colon;
      return c != null ? ((+a * 60 + +b) * 60 + +c) * 1000 : (+a * 60 + +b) * 1000;
    }
    const re = /(\d+(?:\.\d+)?)\s*(h|std|m|min|s|sek|sec)/g;
    let m, total = 0, hit = false;
    while ((m = re.exec(s))) {
      hit = true;
      const v = parseFloat(m[1]);
      total += m[2].startsWith('h') || m[2] === 'std' ? v * 3600000 : m[2].startsWith('m') ? v * 60000 : v * 1000;
    }
    return hit ? Math.round(total) : null;
  }

  const api = {
    MAX_TIMERS, BUILTIN_PRESETS, FONTS, KINDS, MAX_SCREENS, MAX_GROUPS, PAGE_LAYOUTS, SLOT_COUNT, MODULE_KINDS, SLUG, templateAufbau,
    defaultState, apply, timerView, endInfo, flashStyleOf, agendaView, planView, runView, cueView, normalize, toHHMM, isStatic, rawValue, formatMs, parseDuration, clone,
  };
  root.ETEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
