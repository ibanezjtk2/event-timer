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
  const KINDS = ['countdown', 'countup', 'clock'];
  const COLOR_KEYS = ['bg', 'fg', 'accent', 'warn', 'crit', 'overBg', 'overFg', 'msgFg', 'msgBg'];
  const PRESET_BOOLS = ['showProgress', 'showClock', 'showTitle', 'showNext', 'showNotice'];
  const PRESET_TEXTS = ['warnText', 'expiredText', 'overText'];

  const BUILTIN_PRESETS = [
    {
      id: 'stage', name: 'Stage', builtin: true,
      bg: '#000000', bgStyle: 'solid', fg: '#f4f6f8', accent: '#2fd47a', warn: '#ffb020', crit: '#ff4757',
      overBg: '#4a0710', overFg: '#ffffff', msgFg: '#000000', msgBg: '#ffd84d',
      font: 'din', weight: 700,
      showProgress: true, showClock: true, showTitle: true, showNext: true, showNotice: true,
      warnText: 'Bitte zum Ende kommen', expiredText: 'Zeit abgelaufen', overText: 'Überzogen',
    },
    {
      id: 'daylight', name: 'Daylight', builtin: true,
      bg: '#eef1f4', bgStyle: 'solid', fg: '#0d1620', accent: '#0f9d58', warn: '#c77700', crit: '#d0192e',
      overBg: '#d0192e', overFg: '#ffffff', msgFg: '#ffffff', msgBg: '#0d1620',
      font: 'grotesk', weight: 700,
      showProgress: true, showClock: true, showTitle: true, showNext: true, showNotice: true,
      warnText: 'Bitte zum Ende kommen', expiredText: 'Zeit abgelaufen', overText: 'Überzogen',
    },
    {
      id: 'overlay', name: 'Overlay (Keying)', builtin: true,
      bg: '#000000', bgStyle: 'transparent', fg: '#ffffff', accent: '#2fd47a', warn: '#ffb020', crit: '#ff4757',
      overBg: '#c4122b', overFg: '#ffffff', msgFg: '#000000', msgBg: '#ffd84d',
      font: 'din', weight: 700,
      showProgress: false, showClock: false, showTitle: false, showNext: false, showNotice: false,
      warnText: '', expiredText: '', overText: '',
    },
    {
      id: 'minimal', name: 'Nur Ziffern', builtin: true,
      bg: '#000000', bgStyle: 'solid', fg: '#ffffff', accent: '#2fd47a', warn: '#ffb020', crit: '#ff4757',
      overBg: '#000000', overFg: '#ff4757', msgFg: '#000000', msgBg: '#ffffff',
      font: 'mono', weight: 600,
      showProgress: false, showClock: false, showTitle: false, showNext: false, showNotice: false,
      warnText: '', expiredText: '', overText: '',
    },
  ];

  const DEFAULT_QUICK = ['Bitte zum Ende kommen', 'Lauter sprechen', 'Näher ans Mikrofon', 'Letzte Frage', 'Langsamer sprechen'];

  // ---------- helpers ----------
  const clone = v => JSON.parse(JSON.stringify(v));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, lo, hi, fallback) => (isNum(Number(v)) && v !== null && v !== '' && typeof v !== 'boolean' ? clamp(Math.round(Number(v)), lo, hi) : fallback);
  const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const color = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v).toLowerCase() : fallback);
  const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

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
      message: { text: '', flash: false, visible: false },
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
      agenda: { timerId: 't1', plannedStart: '', autoStart: true, cursor: -1, items: [] },
    };
  }

  // ---------- derived values ----------
  /** Raw signed value: remaining (countdown/clock) or elapsed (countup). */
  function rawValue(t, now) {
    if (t.kind === 'clock') return t.targetAt == null ? 0 : t.targetAt - now;
    if (!t.running || t.since == null) return t.baseMs;
    return t.kind === 'countup' ? t.baseMs + (now - t.since) : t.baseMs - (now - t.since);
  }

  /**
   * Everything a display needs. ms is what to show (never negative when
   * overtime is off), over = beyond the limit, phase drives colours.
   */
  function timerView(t, now) {
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
    let phase = 'normal';
    if (over || finished) phase = 'over';
    else if (remaining <= t.critMs && remaining !== Infinity) phase = 'crit';
    else if (remaining <= t.warnMs && remaining !== Infinity) phase = 'warn';
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
    if (t.kind === 'clock' || t.running) return;
    if (t.kind === 'countdown' && t.baseMs <= 0 && !t.overtime) return;
    t.running = true;
    t.since = now;
    segmentStarted(s, t, now);
  }

  function pauseTimer(t, now) {
    if (t.kind === 'clock' || !t.running) return;
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
    return out;
  }

  function sanitizeItem(s, raw, keepId) {
    const it = raw || {};
    return {
      id: keepId || ('s' + (++s.seq)),
      title: text(it.title, 80),
      speaker: text(it.speaker, 80),
      durationMs: num(it.durationMs, 0, DAY, 10 * 60 * 1000),
      note: text(it.note, 300),
      startedAt: null,
      endedAt: null,
    };
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
    t.message = { text: '', flash: false, visible: false };
    if (a.autoStart) startTimer(s, t, now);
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
        if ('kind' in p && (p.kind === 'countdown' || p.kind === 'countup') && p.kind !== t.kind) {
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
        if (t.kind === 'clock') { t.kind = 'countdown'; t.targetAt = null; t.targetLabel = ''; }
        t.durationMs = ms;
        t.running = false;
        t.since = null;
        t.baseMs = t.kind === 'countup' ? 0 : ms;
        if (a.start) startTimer(s, t, now);
        return true;
      }
      case 'timer.adjust': {
        if (!t || t.kind === 'clock') return false;
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
      case 'timer.message': {
        if (!t) return false;
        const m = t.message;
        if ('text' in a) { m.text = String(a.text == null ? '' : a.text).trim().slice(0, 280); m.visible = m.text.length > 0; }
        if ('flash' in a) m.flash = Boolean(a.flash);
        if ('visible' in a) m.visible = Boolean(a.visible) && m.text.length > 0;
        return true;
      }
      case 'timer.messageClear':
        if (!t) return false;
        t.message = { text: '', flash: false, visible: false };
        return true;

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
        s.agenda.items = a.items.slice(0, MAX_ITEMS).map(it => sanitizeItem(s, it));
        s.agenda.cursor = -1;
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
        if ('durationMs' in p) {
          it.durationMs = num(p.durationMs, 0, DAY, it.durationMs);
          // keep a loaded-but-untouched timer in sync with the edited slot
          const lt = s.timers.find(x => x.segmentId === it.id);
          if (lt && !lt.running && it.startedAt == null) { lt.durationMs = it.durationMs; lt.baseMs = it.durationMs; }
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
      case 'agenda.reset': {
        s.agenda.cursor = -1;
        s.agenda.items.forEach(it => { it.startedAt = null; it.endedAt = null; });
        s.timers.forEach(x => { if (x.segmentId) { x.segmentId = null; resetTimer(x); } });
        return true;
      }
      default:
        return false;
    }
  }

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
    MAX_TIMERS, BUILTIN_PRESETS, FONTS, KINDS,
    defaultState, apply, timerView, agendaView, rawValue, formatMs, parseDuration, clone,
  };
  root.ETEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
