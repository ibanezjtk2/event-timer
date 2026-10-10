//! Timer engine – Rust twin of web/js/engine.js.
//! Both are verified against tests/scenarios.json; change them together.

use crate::json::{fmt_num, Json};

pub const MAX_TIMERS: usize = 8;
const MAX_ITEMS: usize = 200;
const MAX_PRESETS: usize = 30;
const DAY: i64 = 24 * 60 * 60 * 1000;
const HOUR: i64 = 60 * 60 * 1000;

const FONTS: [&str; 5] = ["din", "grotesk", "mono", "serif", "rounded"];
const BG_STYLES: [&str; 3] = ["solid", "glow", "transparent"];
const COLOR_KEYS: [&str; 9] = [
    "bg", "fg", "accent", "warn", "crit", "overBg", "overFg", "msgFg", "msgBg",
];
const BOOL_KEYS: [&str; 6] = [
    "showProgress",
    "showClock",
    "showTitle",
    "showNext",
    "showNotice",
    "flashOver",
];
const TEXT_KEYS: [&str; 3] = ["warnText", "expiredText", "overText"];
const DEFAULT_QUICK: [&str; 5] = [
    "Bitte zum Ende kommen",
    "Lauter sprechen",
    "Näher ans Mikrofon",
    "Letzte Frage",
    "Langsamer sprechen",
];

// ------------------------------------------------------------------ model

#[derive(Clone, Debug, PartialEq)]
pub enum Kind {
    Countdown,
    Countup,
    Clock,
    /// shows the wall clock only
    Time,
    /// follows the clock-driven run of show (rendered by the clients)
    Schedule,
}

impl Kind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Kind::Countdown => "countdown",
            Kind::Countup => "countup",
            Kind::Clock => "clock",
            Kind::Time => "time",
            Kind::Schedule => "schedule",
        }
    }
    /// kinds that don't count by themselves
    pub fn is_static(&self) -> bool {
        matches!(self, Kind::Time | Kind::Schedule)
    }
    fn parse(s: &str) -> Option<Kind> {
        match s {
            "countdown" => Some(Kind::Countdown),
            "countup" => Some(Kind::Countup),
            "clock" => Some(Kind::Clock),
            "time" => Some(Kind::Time),
            "schedule" => Some(Kind::Schedule),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Message {
    pub text: String,
    pub flash: bool,
    pub visible: bool,
}

#[derive(Clone, Debug)]
pub struct Timer {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub duration_ms: i64,
    pub target_at: Option<i64>,
    pub target_label: String,
    pub running: bool,
    pub base_ms: i64,
    pub since: Option<i64>,
    pub overtime: bool,
    pub warn_ms: i64,
    pub crit_ms: i64,
    pub preset_id: String,
    pub message: Message,
    pub segment_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub builtin: bool,
    pub colors: [String; 9],
    pub bg_style: String,
    pub font: String,
    pub weight: i64,
    pub bools: [bool; 6],
    pub texts: [String; 3],
}

#[derive(Clone, Debug)]
pub struct Item {
    pub id: String,
    pub title: String,
    pub speaker: String,
    pub duration_ms: i64,
    pub note: String,
    /// fixed clock times "HH:MM" (empty = follows the previous slot)
    pub start: String,
    pub end: String,
    /// live corrections: this slot longer/shorter, and how much later everything after it runs
    pub extra_ms: i64,
    pub ripple_ms: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct Agenda {
    pub timer_id: String,
    pub planned_start: String,
    pub auto_start: bool,
    /// "manual" (Weiter-Knopf) or "clock" (follows the wall clock)
    pub mode: String,
    /// whole plan moved by this much; on hold the plan stands still since hold_at
    pub shift_ms: i64,
    pub hold_at: Option<i64>,
    pub cursor: i64,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug)]
pub struct State {
    pub rev: i64,
    pub seq: i64,
    pub event_title: String,
    pub blackout: bool,
    pub timers: Vec<Timer>,
    pub presets: Vec<Preset>,
    pub quick_messages: Vec<String>,
    pub agenda: Agenda,
}

fn new_timer(slot: usize) -> Timer {
    Timer {
        id: format!("t{}", slot),
        name: format!("Timer {}", slot),
        kind: Kind::Countdown,
        duration_ms: 10 * 60 * 1000,
        target_at: None,
        target_label: String::new(),
        running: false,
        base_ms: 10 * 60 * 1000,
        since: None,
        overtime: true,
        warn_ms: 2 * 60 * 1000,
        crit_ms: 60 * 1000,
        preset_id: "stage".into(),
        message: Message::default(),
        segment_id: None,
    }
}

#[allow(clippy::too_many_arguments)]
fn builtin(
    id: &str,
    name: &str,
    colors: [&str; 9],
    bg_style: &str,
    font: &str,
    weight: i64,
    bools: [bool; 6],
    texts: [&str; 3],
) -> Preset {
    Preset {
        id: id.into(),
        name: name.into(),
        builtin: true,
        colors: colors.map(String::from),
        bg_style: bg_style.into(),
        font: font.into(),
        weight,
        bools,
        texts: texts.map(String::from),
    }
}

pub fn builtin_presets() -> Vec<Preset> {
    let de = ["Bitte zum Ende kommen", "Zeit abgelaufen", "Überzogen"];
    vec![
        builtin(
            "stage",
            "Stage",
            [
                "#000000", "#f4f6f8", "#2fd47a", "#ffb020", "#ff4757", "#4a0710", "#ffffff",
                "#000000", "#ffd84d",
            ],
            "solid",
            "din",
            700,
            [true; 6],
            de,
        ),
        builtin(
            "daylight",
            "Daylight",
            [
                "#eef1f4", "#0d1620", "#0f9d58", "#c77700", "#d0192e", "#d0192e", "#ffffff",
                "#ffffff", "#0d1620",
            ],
            "solid",
            "grotesk",
            700,
            [true; 6],
            de,
        ),
        builtin(
            "overlay",
            "Overlay (Keying)",
            [
                "#000000", "#ffffff", "#2fd47a", "#ffb020", "#ff4757", "#c4122b", "#ffffff",
                "#000000", "#ffd84d",
            ],
            "transparent",
            "din",
            700,
            [false; 6],
            ["", "", ""],
        ),
        builtin(
            "minimal",
            "Nur Ziffern",
            [
                "#000000", "#ffffff", "#2fd47a", "#ffb020", "#ff4757", "#000000", "#ff4757",
                "#000000", "#ffffff",
            ],
            "solid",
            "mono",
            600,
            [false, false, false, false, false, true],
            ["", "", ""],
        ),
    ]
}

impl Default for State {
    fn default() -> Self {
        State {
            rev: 0,
            seq: 0,
            event_title: String::new(),
            blackout: false,
            timers: vec![new_timer(1)],
            presets: builtin_presets(),
            quick_messages: DEFAULT_QUICK.iter().map(|s| s.to_string()).collect(),
            agenda: Agenda {
                timer_id: "t1".into(),
                planned_start: String::new(),
                auto_start: true,
                mode: "manual".into(),
                shift_ms: 0,
                hold_at: None,
                cursor: -1,
                items: vec![],
            },
        }
    }
}

// --------------------------------------------------------------- helpers

/// JavaScript Math.round
fn js_round(n: f64) -> f64 {
    (n + 0.5).floor()
}

/// Same as JS `Math.max(lo, Math.min(hi, v))` – never panics when lo > hi.
fn clampi(v: i64, lo: i64, hi: i64) -> i64 {
    lo.max(hi.min(v))
}

/// JS `num()` from engine.js: accepts numbers and numeric strings.
fn num(v: &Json, lo: i64, hi: i64, fallback: Option<i64>) -> Option<i64> {
    let n = match v {
        Json::Num(n) => Some(*n),
        Json::Str(s) if !s.is_empty() => {
            let t = s.trim();
            if t.is_empty() {
                Some(0.0)
            } else {
                t.parse::<f64>().ok()
            }
        }
        _ => None,
    };
    match n {
        Some(n) if n.is_finite() => {
            let r = js_round(n).clamp(-9.0e15, 9.0e15) as i64;
            Some(clampi(r, lo, hi))
        }
        _ => fallback,
    }
}

fn js_string(v: &Json) -> String {
    match v {
        Json::Str(s) => s.clone(),
        Json::Num(n) => fmt_num(*n),
        Json::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

/// JS `text()`: collapse whitespace, trim, cut.
fn text(v: &Json, max: usize) -> String {
    let s = js_string(v);
    let collapsed = s.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max).collect()
}

fn color(v: &Json, fallback: &str) -> String {
    match v.as_str() {
        Some(s)
            if s.len() == 7
                && s.starts_with('#')
                && s[1..].chars().all(|c| c.is_ascii_hexdigit()) =>
        {
            s.to_ascii_lowercase()
        }
        _ => fallback.to_string(),
    }
}

fn pick(v: &Json, list: &[&str], fallback: &str) -> String {
    match v.as_str() {
        Some(s) if list.contains(&s) => s.to_string(),
        _ => fallback.to_string(),
    }
}

fn valid_hhmm(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 5
        || b[2] != b':'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 2 || c.is_ascii_digit())
    {
        return false;
    }
    let h = (b[0] - b'0') * 10 + (b[1] - b'0');
    let m = (b[3] - b'0') * 10 + (b[4] - b'0');
    h < 24 && m < 60
}

// ---------------------------------------------------------------- views

pub fn raw_value(t: &Timer, now: i64) -> i64 {
    if t.kind.is_static() {
        return 0;
    }
    if t.kind == Kind::Clock {
        return t.target_at.map(|at| at - now).unwrap_or(0);
    }
    match (t.running, t.since) {
        (true, Some(since)) => {
            if t.kind == Kind::Countup {
                t.base_ms + (now - since)
            } else {
                t.base_ms - (now - since)
            }
        }
        _ => t.base_ms,
    }
}

#[derive(Debug, Clone)]
pub struct TimerView {
    pub ms: i64,
    pub over: bool,
    pub phase: &'static str,
    pub state: &'static str,
    pub progress: f64,
    /// None = no limit (count-up without duration)
    pub remaining: Option<i64>,
}

impl TimerView {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("ms", self.ms)
            .with("over", self.over)
            .with("phase", self.phase)
            .with("state", self.state)
            .with("progress", self.progress)
            .with("remaining", self.remaining)
    }
}

pub fn timer_view(t: &Timer, now: i64) -> TimerView {
    if t.kind.is_static() {
        return TimerView {
            ms: 0,
            over: false,
            phase: "normal",
            state: "running",
            progress: 0.0,
            remaining: None,
        };
    }
    let raw = raw_value(t, now);
    let (ms, over, remaining);
    if t.kind == Kind::Countup {
        ms = raw.max(0);
        remaining = if t.duration_ms > 0 {
            Some(t.duration_ms - ms)
        } else {
            None
        };
        over = t.duration_ms > 0 && remaining.unwrap_or(0) < 0;
    } else {
        remaining = Some(raw);
        over = raw < 0;
        ms = if over && !t.overtime { 0 } else { raw };
    }
    let finished = t.kind != Kind::Countup
        && !t.overtime
        && raw <= 0
        && !(t.kind == Kind::Clock && t.target_at.is_none());
    let phase = if over || finished {
        "over"
    } else {
        match remaining {
            Some(r) if r <= t.crit_ms => "crit",
            Some(r) if r <= t.warn_ms => "warn",
            _ => "normal",
        }
    };
    let state = if t.kind == Kind::Clock {
        if t.target_at.is_none() {
            "idle"
        } else if finished {
            "finished"
        } else {
            "running"
        }
    } else if finished {
        "finished"
    } else if t.running {
        "running"
    } else if (t.kind == Kind::Countdown && t.base_ms == t.duration_ms)
        || (t.kind == Kind::Countup && t.base_ms == 0)
    {
        "idle"
    } else {
        "paused"
    };
    let progress = match t.kind {
        Kind::Countdown if t.duration_ms > 0 => {
            (1.0 - remaining.unwrap_or(0) as f64 / t.duration_ms as f64).clamp(0.0, 1.0)
        }
        Kind::Countup if t.duration_ms > 0 => (ms as f64 / t.duration_ms as f64).clamp(0.0, 1.0),
        Kind::Clock => {
            if over {
                1.0
            } else {
                0.0
            }
        }
        _ => 0.0,
    };
    TimerView {
        ms,
        over,
        phase,
        state,
        progress,
        remaining,
    }
}

pub struct AgendaView {
    pub started: bool,
    pub done: bool,
    pub drift: i64,
    pub projected_end: i64,
    pub total_planned: i64,
    pub current: Option<usize>,
    pub next: Option<usize>,
    pub current_elapsed: i64,
}

pub fn agenda_view(s: &State, now: i64) -> AgendaView {
    let a = &s.agenda;
    let mut drift = 0;
    let mut remaining_planned = 0;
    let mut current_elapsed = 0;
    for (i, it) in a.items.iter().enumerate() {
        let i = i as i64;
        if i < a.cursor {
            if let Some(st) = it.started_at {
                let end = it.ended_at.unwrap_or(now);
                drift += (end - st) - it.duration_ms;
            }
        } else if i == a.cursor {
            if let Some(st) = it.started_at {
                current_elapsed = now - st;
                drift += (current_elapsed - it.duration_ms).max(0);
                remaining_planned += (it.duration_ms - current_elapsed).max(0);
            } else {
                remaining_planned += it.duration_ms;
            }
        } else {
            remaining_planned += it.duration_ms;
        }
    }
    let idx = |i: i64| {
        if i >= 0 && (i as usize) < a.items.len() {
            Some(i as usize)
        } else {
            None
        }
    };
    AgendaView {
        started: a.cursor >= 0,
        done: !a.items.is_empty() && a.cursor >= a.items.len() as i64,
        drift,
        projected_end: now + remaining_planned,
        total_planned: a.items.iter().map(|it| it.duration_ms).sum(),
        current: idx(a.cursor),
        next: idx(a.cursor + 1),
        current_elapsed,
    }
}

impl AgendaView {
    pub fn to_json(&self, s: &State) -> Json {
        let item = |i: Option<usize>| i.map(|i| s.agenda.items[i].to_json()).unwrap_or(Json::Null);
        Json::obj()
            .with("started", self.started)
            .with("done", self.done)
            .with("drift", self.drift)
            .with("projectedEnd", self.projected_end)
            .with("totalPlanned", self.total_planned)
            .with("current", item(self.current))
            .with("next", item(self.next))
            .with("currentElapsed", self.current_elapsed)
    }
}

/// "05:00", "1:02:03", "+00:12" (over), counting up rounds down.
pub fn format_ms(ms: i64, up: bool) -> String {
    let neg = ms < 0;
    let abs = ms.abs();
    let total = if up { abs / 1000 } else { (abs + 999) / 1000 };
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    let body = if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    };
    if neg {
        format!("+{}", body)
    } else {
        body
    }
}

// ------------------------------------------------------- state mutations

impl State {
    fn timer_idx(&self, id: &str) -> Option<usize> {
        self.timers.iter().position(|t| t.id == id)
    }
}

fn settle(t: &mut Timer, now: i64) {
    if t.kind == Kind::Countdown && t.running && !t.overtime && raw_value(t, now) <= 0 {
        t.running = false;
        t.since = None;
        t.base_ms = 0;
    }
}

fn freeze(t: &mut Timer, now: i64) {
    if t.running {
        t.base_ms = raw_value(t, now);
        t.since = Some(now);
    }
}

fn start_timer(s: &mut State, ti: usize, now: i64) {
    let t = &mut s.timers[ti];
    if t.kind == Kind::Clock || t.kind.is_static() || t.running {
        return;
    }
    if t.kind == Kind::Countdown && t.base_ms <= 0 && !t.overtime {
        return;
    }
    t.running = true;
    t.since = Some(now);
    if let Some(seg) = t.segment_id.clone() {
        if let Some(it) = s.agenda.items.iter_mut().find(|it| it.id == seg) {
            if it.started_at.is_none() {
                it.started_at = Some(now);
            }
        }
    }
}

fn pause_timer(t: &mut Timer, now: i64) {
    if t.kind == Kind::Clock || t.kind.is_static() || !t.running {
        return;
    }
    t.base_ms = raw_value(t, now);
    t.running = false;
    t.since = None;
}

fn reset_timer(t: &mut Timer) {
    t.running = false;
    t.since = None;
    t.base_ms = if t.kind == Kind::Countup {
        0
    } else {
        t.duration_ms
    };
    if t.kind == Kind::Clock {
        t.target_at = None;
        t.target_label.clear();
        t.kind = Kind::Countdown;
        t.base_ms = t.duration_ms;
    }
}

fn sanitize_preset(p: &Json, base: &Preset, id: String) -> Preset {
    let name = text(p.get("name"), 40);
    let mut colors = base.colors.clone();
    for (i, k) in COLOR_KEYS.iter().enumerate() {
        colors[i] = color(p.get(k), &base.colors[i]);
    }
    let mut bools = base.bools;
    for (i, k) in BOOL_KEYS.iter().enumerate() {
        if p.has(k) {
            bools[i] = p.get(k).truthy();
        }
    }
    let mut texts = base.texts.clone();
    for (i, k) in TEXT_KEYS.iter().enumerate() {
        if p.has(k) {
            texts[i] = text(p.get(k), 60);
        }
    }
    Preset {
        id,
        name: if name.is_empty() {
            base.name.clone()
        } else {
            name
        },
        builtin: false,
        colors,
        bg_style: pick(p.get("bgStyle"), &BG_STYLES, &base.bg_style),
        font: pick(p.get("font"), &FONTS, &base.font),
        weight: num(p.get("weight"), 300, 900, Some(base.weight)).unwrap_or(base.weight),
        bools,
        texts,
    }
}

fn hhmm(v: &Json) -> String {
    let s = js_string(v);
    let s = s.trim();
    if valid_hhmm(s) {
        s.to_string()
    } else {
        String::new()
    }
}

fn minutes_of(s: &str) -> i64 {
    let b = s.as_bytes();
    ((b[0] - b'0') as i64 * 10 + (b[1] - b'0') as i64) * 60
        + (b[3] - b'0') as i64 * 10
        + (b[4] - b'0') as i64
}

/// start→end in ms, past midnight if end is earlier (same as engine.js spanMs)
fn span_ms(a: &str, b: &str) -> i64 {
    let d = minutes_of(b) - minutes_of(a);
    (if d <= 0 { d + 1440 } else { d }) * 60000
}

fn sanitize_item(s: &mut State, it: &Json) -> Item {
    s.seq += 1;
    let mut out = Item {
        id: format!("s{}", s.seq),
        title: text(it.get("title"), 80),
        speaker: text(it.get("speaker"), 80),
        duration_ms: num(it.get("durationMs"), 0, DAY, Some(10 * 60 * 1000)).unwrap_or(0),
        note: text(it.get("note"), 300),
        start: hhmm(it.get("start")),
        end: hhmm(it.get("end")),
        extra_ms: 0,
        ripple_ms: 0,
        started_at: None,
        ended_at: None,
    };
    if !out.start.is_empty() && !out.end.is_empty() {
        out.duration_ms = span_ms(&out.start, &out.end);
    }
    out
}

fn load_segment(s: &mut State, index: i64, now: i64) {
    let ti = s
        .timer_idx(&s.agenda.timer_id)
        .or(if s.timers.is_empty() { None } else { Some(0) });
    let len = s.agenda.items.len() as i64;
    let cur = s.agenda.cursor;
    if cur >= 0 && cur < len {
        let prev = &mut s.agenda.items[cur as usize];
        if prev.started_at.is_some() && prev.ended_at.is_none() {
            prev.ended_at = Some(now);
        }
    }
    if index >= len {
        s.agenda.cursor = len;
        if let Some(ti) = ti {
            pause_timer(&mut s.timers[ti], now);
            s.timers[ti].segment_id = None;
        }
        return;
    }
    s.agenda.cursor = index;
    let seg = &mut s.agenda.items[index as usize];
    seg.started_at = None;
    seg.ended_at = None;
    let (seg_id, dur) = (seg.id.clone(), seg.duration_ms);
    let Some(ti) = ti else { return };
    let t = &mut s.timers[ti];
    t.kind = Kind::Countdown;
    t.target_at = None;
    t.target_label.clear();
    t.duration_ms = dur;
    t.base_ms = dur;
    t.running = false;
    t.since = None;
    t.segment_id = Some(seg_id);
    t.message = Message::default();
    if s.agenda.auto_start {
        start_timer(s, ti, now);
    }
}

/// Applies one action. Returns true when the state changed.
pub fn apply(s: &mut State, a: &Json, now: i64) -> bool {
    let Some(kind) = a.get("type").as_str() else {
        return false;
    };
    let changed = apply_inner(s, kind, a, now);
    if changed {
        s.rev += 1;
    }
    changed
}

fn apply_inner(s: &mut State, kind: &str, a: &Json, now: i64) -> bool {
    for t in s.timers.iter_mut() {
        settle(t, now);
    }
    let ti = a
        .get("id")
        .as_str()
        .filter(|id| !id.is_empty())
        .and_then(|id| s.timer_idx(id));

    macro_rules! timer {
        () => {
            match ti {
                Some(i) => i,
                None => return false,
            }
        };
    }

    match kind {
        "timer.add" => {
            if s.timers.len() >= MAX_TIMERS {
                return false;
            }
            let mut slot = 1;
            while s.timers.iter().any(|t| t.id == format!("t{}", slot)) {
                slot += 1;
            }
            s.timers.push(new_timer(slot));
            s.timers
                .sort_by_key(|t| t.id[1..].parse::<u32>().unwrap_or(0));
            true
        }
        "timer.remove" => {
            let i = timer!();
            if s.timers.len() <= 1 {
                return false;
            }
            let removed = s.timers.remove(i);
            if s.agenda.timer_id == removed.id {
                s.agenda.timer_id = s.timers[0].id.clone();
            }
            true
        }
        "timer.update" => {
            let i = timer!();
            let p = a.get("patch");
            let t = &mut s.timers[i];
            if p.has("name") {
                let n = text(p.get("name"), 40);
                if !n.is_empty() {
                    t.name = n;
                }
            }
            if p.has("overtime") {
                freeze(t, now);
                t.overtime = p.get("overtime").truthy();
            }
            if p.has("warnMs") {
                t.warn_ms = num(p.get("warnMs"), 0, HOUR, Some(t.warn_ms)).unwrap_or(t.warn_ms);
            }
            if p.has("critMs") {
                t.crit_ms = num(p.get("critMs"), 0, HOUR, Some(t.crit_ms)).unwrap_or(t.crit_ms);
            }
            if t.crit_ms > t.warn_ms {
                std::mem::swap(&mut t.crit_ms, &mut t.warn_ms);
            }
            if let Some(pid) = p.get("presetId").as_str() {
                if s.presets.iter().any(|x| x.id == pid) {
                    s.timers[i].preset_id = pid.to_string();
                }
            }
            let t = &mut s.timers[i];
            if let Some(k) = p.get("kind").as_str().and_then(Kind::parse) {
                if k != Kind::Clock && k != t.kind {
                    t.kind = k;
                    t.target_at = None;
                    t.target_label.clear();
                    reset_timer(t);
                }
            }
            true
        }
        "timer.start" => {
            let i = timer!();
            start_timer(s, i, now);
            true
        }
        "timer.pause" => {
            let i = timer!();
            pause_timer(&mut s.timers[i], now);
            true
        }
        "timer.toggle" => {
            let i = timer!();
            if s.timers[i].running {
                pause_timer(&mut s.timers[i], now)
            } else {
                start_timer(s, i, now)
            }
            true
        }
        "timer.reset" => {
            let i = timer!();
            reset_timer(&mut s.timers[i]);
            true
        }
        "timer.set" => {
            let i = timer!();
            let Some(ms) = num(a.get("ms"), 0, DAY, None) else {
                return false;
            };
            let t = &mut s.timers[i];
            if t.kind == Kind::Clock || t.kind.is_static() {
                t.kind = Kind::Countdown;
                t.target_at = None;
                t.target_label.clear();
            }
            t.duration_ms = ms;
            t.running = false;
            t.since = None;
            t.base_ms = if t.kind == Kind::Countup { 0 } else { ms };
            if a.get("start").truthy() {
                start_timer(s, i, now);
            }
            true
        }
        "timer.adjust" => {
            let i = timer!();
            let t = &mut s.timers[i];
            if t.kind == Kind::Clock || t.kind.is_static() {
                return false;
            }
            let delta = num(a.get("ms"), -HOUR, HOUR, Some(0)).unwrap_or(0);
            if delta == 0 {
                return false;
            }
            freeze(t, now);
            let mut next = t.base_ms + delta;
            if t.kind == Kind::Countup || !t.overtime {
                next = next.max(0);
            }
            t.base_ms = next;
            if t.kind == Kind::Countdown && next > t.duration_ms {
                t.duration_ms = next;
            }
            true
        }
        "timer.target" => {
            let i = timer!();
            let Some(at) = num(a.get("at"), 0, 8_640_000_000_000_000, None) else {
                return false;
            };
            let t = &mut s.timers[i];
            t.kind = Kind::Clock;
            t.target_at = Some(at);
            t.target_label = text(a.get("label"), 16);
            t.running = false;
            t.since = None;
            t.base_ms = 0;
            true
        }
        "timer.message" => {
            let i = timer!();
            let m = &mut s.timers[i].message;
            if a.has("text") {
                m.text = js_string(a.get("text")).trim().chars().take(280).collect();
                m.visible = !m.text.is_empty();
            }
            if a.has("flash") {
                m.flash = a.get("flash").truthy();
            }
            if a.has("visible") {
                m.visible = a.get("visible").truthy() && !m.text.is_empty();
            }
            true
        }
        "timer.messageClear" => {
            let i = timer!();
            s.timers[i].message = Message::default();
            true
        }
        "blackout.set" => {
            s.blackout = a.get("value").truthy();
            true
        }
        "blackout.toggle" => {
            s.blackout = !s.blackout;
            true
        }
        "event.update" => {
            s.event_title = text(a.get("title"), 80);
            true
        }
        "quick.set" => {
            let Some(list) = a.get("list").as_array() else {
                return false;
            };
            s.quick_messages = list
                .iter()
                .map(|x| text(x, 80))
                .filter(|x| !x.is_empty())
                .take(12)
                .collect();
            true
        }
        "preset.save" => {
            let p = a.get("preset");
            let pid = p.get("id").as_str();
            let existing = pid.and_then(|id| s.presets.iter().position(|x| x.id == id));
            if let Some(ei) = existing {
                if !s.presets[ei].builtin {
                    let id = s.presets[ei].id.clone();
                    s.presets[ei] = sanitize_preset(p, &s.presets[ei], id);
                    return true;
                }
            }
            if s.presets.iter().filter(|x| !x.builtin).count() >= MAX_PRESETS {
                return false;
            }
            let base = existing
                .map(|i| s.presets[i].clone())
                .or_else(|| {
                    p.get("baseId")
                        .as_str()
                        .and_then(|b| s.presets.iter().find(|x| x.id == b).cloned())
                })
                .unwrap_or_else(|| builtin_presets().remove(0));
            s.seq += 1;
            let np = sanitize_preset(p, &base, format!("p{}", s.seq));
            let new_id = np.id.clone();
            s.presets.push(np);
            if let Some(target) = a.get("assignTo").as_str() {
                if let Some(ti) = s.timer_idx(target) {
                    s.timers[ti].preset_id = new_id;
                }
            }
            true
        }
        "preset.remove" => {
            let Some(pid) = a.get("presetId").as_str() else {
                return false;
            };
            let Some(pi) = s.presets.iter().position(|x| x.id == pid) else {
                return false;
            };
            if s.presets[pi].builtin {
                return false;
            }
            let removed = s.presets.remove(pi);
            for t in s.timers.iter_mut() {
                if t.preset_id == removed.id {
                    t.preset_id = "stage".into();
                }
            }
            true
        }
        "agenda.settings" => {
            if let Some(tid) = a.get("timerId").as_str() {
                if s.timer_idx(tid).is_some() {
                    s.agenda.timer_id = tid.to_string();
                }
            }
            if a.has("plannedStart") {
                let v = js_string(a.get("plannedStart"));
                s.agenda.planned_start = if valid_hhmm(&v) { v } else { String::new() };
            }
            if a.has("autoStart") {
                s.agenda.auto_start = a.get("autoStart").truthy();
            }
            if let Some(m @ ("manual" | "clock")) = a.get("mode").as_str() {
                s.agenda.mode = m.to_string();
            }
            true
        }
        "agenda.replace" => {
            let Some(list) = a.get("items").as_array() else {
                return false;
            };
            let list: Vec<Json> = list.iter().take(MAX_ITEMS).cloned().collect();
            s.agenda.items = list.iter().map(|it| sanitize_item(s, it)).collect();
            s.agenda.cursor = -1;
            for t in s.timers.iter_mut() {
                t.segment_id = None;
            }
            true
        }
        "agenda.add" => {
            if s.agenda.items.len() >= MAX_ITEMS {
                return false;
            }
            let it = sanitize_item(s, a.get("item"));
            let len = s.agenda.items.len() as i64;
            let idx = num(a.get("index"), 0, len, Some(len)).unwrap_or(len);
            s.agenda.items.insert(idx as usize, it);
            if s.agenda.cursor >= 0 && idx <= s.agenda.cursor {
                s.agenda.cursor += 1;
            }
            true
        }
        "agenda.update" => {
            let Some(iid) = a.get("itemId").as_str() else {
                return false;
            };
            let Some(ii) = s.agenda.items.iter().position(|x| x.id == iid) else {
                return false;
            };
            let p = a.get("patch");
            let it = &mut s.agenda.items[ii];
            if p.has("title") {
                it.title = text(p.get("title"), 80);
            }
            if p.has("speaker") {
                it.speaker = text(p.get("speaker"), 80);
            }
            if p.has("note") {
                it.note = text(p.get("note"), 300);
            }
            if p.has("start") {
                it.start = hhmm(p.get("start"));
            }
            if p.has("end") {
                it.end = hhmm(p.get("end"));
            }
            let fixed = !it.start.is_empty() && !it.end.is_empty();
            if p.has("durationMs") || p.has("start") || p.has("end") {
                it.duration_ms = if fixed {
                    span_ms(&it.start, &it.end)
                } else {
                    num(p.get("durationMs"), 0, DAY, Some(it.duration_ms)).unwrap_or(it.duration_ms)
                };
                let (id, dur, untouched) = (it.id.clone(), it.duration_ms, it.started_at.is_none());
                if let Some(lt) = s
                    .timers
                    .iter_mut()
                    .find(|x| x.segment_id.as_deref() == Some(id.as_str()))
                {
                    if !lt.running && untouched {
                        lt.duration_ms = dur;
                        lt.base_ms = dur;
                    }
                }
            }
            true
        }
        "agenda.remove" => {
            let Some(iid) = a.get("itemId").as_str() else {
                return false;
            };
            let Some(idx) = s.agenda.items.iter().position(|x| x.id == iid) else {
                return false;
            };
            s.agenda.items.remove(idx);
            for t in s.timers.iter_mut() {
                if t.segment_id.as_deref() == Some(iid) {
                    t.segment_id = None;
                }
            }
            if (idx as i64) <= s.agenda.cursor {
                s.agenda.cursor -= 1;
            }
            true
        }
        "agenda.move" => {
            let Some(iid) = a.get("itemId").as_str() else {
                return false;
            };
            let Some(from) = s.agenda.items.iter().position(|x| x.id == iid) else {
                return false;
            };
            let len = s.agenda.items.len() as i64;
            let to =
                num(a.get("to"), 0, len - 1, Some(from as i64)).unwrap_or(from as i64) as usize;
            if to == from {
                return false;
            }
            let cur_id = usize::try_from(s.agenda.cursor)
                .ok()
                .and_then(|c| s.agenda.items.get(c))
                .map(|x| x.id.clone());
            let it = s.agenda.items.remove(from);
            s.agenda.items.insert(to, it);
            if let Some(cid) = cur_id {
                s.agenda.cursor = s
                    .agenda
                    .items
                    .iter()
                    .position(|x| x.id == cid)
                    .map(|p| p as i64)
                    .unwrap_or(-1);
            }
            true
        }
        "agenda.go" => {
            let len = s.agenda.items.len() as i64;
            let Some(idx) = num(a.get("index"), 0, len - 1, None) else {
                return false;
            };
            load_segment(s, idx, now);
            true
        }
        "agenda.next" => {
            let len = s.agenda.items.len() as i64;
            if len == 0 || s.agenda.cursor >= len {
                return false;
            }
            let next = s.agenda.cursor + 1;
            load_segment(s, next, now);
            true
        }
        "agenda.prev" => {
            if s.agenda.cursor <= 0 {
                return false;
            }
            let len = s.agenda.items.len() as i64;
            let target = s.agenda.cursor.min(len) - 1;
            for it in s.agenda.items.iter_mut().skip(target.max(0) as usize) {
                it.started_at = None;
                it.ended_at = None;
            }
            s.agenda.cursor = -1;
            load_segment(s, target, now);
            true
        }
        "agenda.adjust" => {
            let ms = num(a.get("ms"), -12 * HOUR, 12 * HOUR, Some(0)).unwrap_or(0);
            let iid = a.get("itemId").as_str().unwrap_or("");
            let Some(it) = s.agenda.items.iter_mut().find(|x| x.id == iid) else {
                return false;
            };
            if ms == 0 {
                return false;
            }
            it.extra_ms = (it.extra_ms + ms).clamp(-DAY, DAY);
            if a.get("ripple").truthy() {
                it.ripple_ms = (it.ripple_ms + ms).clamp(-DAY, DAY);
            }
            true
        }
        "agenda.shift" => {
            let ms = num(a.get("ms"), -DAY, DAY, Some(0)).unwrap_or(0);
            if ms == 0 {
                return false;
            }
            s.agenda.shift_ms = (s.agenda.shift_ms + ms).clamp(-DAY, DAY);
            true
        }
        "agenda.hold" => {
            if s.agenda.hold_at.is_some() {
                return false;
            }
            s.agenda.hold_at = Some(now);
            true
        }
        "agenda.resume" => {
            let Some(held_since) = s.agenda.hold_at.take() else {
                return false;
            };
            let ms = (now - held_since).clamp(0, DAY);
            let after = a.get("mode").as_str() == Some("after");
            let iid = a.get("itemId").as_str().unwrap_or("");
            if let Some(it) = s.agenda.items.iter_mut().find(|x| x.id == iid) {
                it.ripple_ms = (it.ripple_ms + ms).clamp(-DAY, DAY);
                if !after {
                    it.extra_ms = (it.extra_ms + ms).clamp(-DAY, DAY);
                }
            } else {
                s.agenda.shift_ms = (s.agenda.shift_ms + ms).clamp(-DAY, DAY);
            }
            true
        }
        "agenda.clearAdjust" => {
            s.agenda.shift_ms = 0;
            s.agenda.hold_at = None;
            for it in s.agenda.items.iter_mut() {
                it.extra_ms = 0;
                it.ripple_ms = 0;
            }
            true
        }
        "agenda.reset" => {
            s.agenda.cursor = -1;
            for it in s.agenda.items.iter_mut() {
                it.started_at = None;
                it.ended_at = None;
            }
            for t in s.timers.iter_mut() {
                if t.segment_id.is_some() {
                    t.segment_id = None;
                    reset_timer(t);
                }
            }
            true
        }
        _ => false,
    }
}

// ------------------------------------------------------- serialization

impl Timer {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("id", &self.id)
            .with("name", &self.name)
            .with("kind", self.kind.as_str())
            .with("durationMs", self.duration_ms)
            .with("targetAt", self.target_at)
            .with("targetLabel", &self.target_label)
            .with("running", self.running)
            .with("baseMs", self.base_ms)
            .with("since", self.since)
            .with("overtime", self.overtime)
            .with("warnMs", self.warn_ms)
            .with("critMs", self.crit_ms)
            .with("presetId", &self.preset_id)
            .with(
                "message",
                Json::obj()
                    .with("text", &self.message.text)
                    .with("flash", self.message.flash)
                    .with("visible", self.message.visible),
            )
            .with("segmentId", self.segment_id.clone())
    }

    fn from_json(j: &Json, fallback_slot: usize) -> Timer {
        let mut t = new_timer(fallback_slot);
        if let Some(id) = j.get("id").as_str() {
            if id.len() > 1 && id.starts_with('t') && id[1..].parse::<usize>().is_ok() {
                t.id = id.to_string();
            }
        }
        if let Some(v) = j.get("name").as_str() {
            t.name = v.to_string();
        }
        if let Some(k) = j.get("kind").as_str().and_then(Kind::parse) {
            t.kind = k;
        }
        if let Some(v) = j.get("durationMs").as_i64() {
            t.duration_ms = v;
        }
        t.target_at = j.get("targetAt").as_i64();
        if let Some(v) = j.get("targetLabel").as_str() {
            t.target_label = v.to_string();
        }
        t.running = j.get("running").truthy();
        if let Some(v) = j.get("baseMs").as_i64() {
            t.base_ms = v;
        }
        t.since = j.get("since").as_i64();
        if t.running && t.since.is_none() {
            t.running = false;
        }
        if j.has("overtime") {
            t.overtime = j.get("overtime").truthy();
        }
        if let Some(v) = j.get("warnMs").as_i64() {
            t.warn_ms = v;
        }
        if let Some(v) = j.get("critMs").as_i64() {
            t.crit_ms = v;
        }
        if let Some(v) = j.get("presetId").as_str() {
            t.preset_id = v.to_string();
        }
        let m = j.get("message");
        t.message = Message {
            text: m.get("text").as_str().unwrap_or("").to_string(),
            flash: m.get("flash").truthy(),
            visible: m.get("visible").truthy(),
        };
        t.segment_id = j.get("segmentId").as_str().map(String::from);
        t
    }
}

impl Preset {
    pub fn to_json(&self) -> Json {
        let mut j = Json::obj()
            .with("id", &self.id)
            .with("name", &self.name)
            .with("builtin", self.builtin);
        for (i, k) in COLOR_KEYS.iter().enumerate() {
            j.set(k, &self.colors[i]);
        }
        j.set("bgStyle", &self.bg_style);
        j.set("font", &self.font);
        j.set("weight", self.weight);
        for (i, k) in BOOL_KEYS.iter().enumerate() {
            j.set(k, self.bools[i]);
        }
        for (i, k) in TEXT_KEYS.iter().enumerate() {
            j.set(k, &self.texts[i]);
        }
        j
    }
}

impl Item {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("id", &self.id)
            .with("title", &self.title)
            .with("speaker", &self.speaker)
            .with("durationMs", self.duration_ms)
            .with("note", &self.note)
            .with("start", &self.start)
            .with("end", &self.end)
            .with("extraMs", self.extra_ms)
            .with("rippleMs", self.ripple_ms)
            .with("startedAt", self.started_at)
            .with("endedAt", self.ended_at)
    }
    fn from_json(j: &Json) -> Option<Item> {
        Some(Item {
            id: j.get("id").as_str()?.to_string(),
            title: j.get("title").as_str().unwrap_or("").to_string(),
            speaker: j.get("speaker").as_str().unwrap_or("").to_string(),
            duration_ms: j.get("durationMs").as_i64().unwrap_or(0).clamp(0, DAY),
            note: j.get("note").as_str().unwrap_or("").to_string(),
            start: hhmm(j.get("start")),
            end: hhmm(j.get("end")),
            extra_ms: j.get("extraMs").as_i64().unwrap_or(0).clamp(-DAY, DAY),
            ripple_ms: j.get("rippleMs").as_i64().unwrap_or(0).clamp(-DAY, DAY),
            started_at: j.get("startedAt").as_i64(),
            ended_at: j.get("endedAt").as_i64(),
        })
    }
}

impl State {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("v", 1)
            .with("rev", self.rev)
            .with("seq", self.seq)
            .with("event", Json::obj().with("title", &self.event_title))
            .with("blackout", self.blackout)
            .with(
                "timers",
                Json::Arr(self.timers.iter().map(Timer::to_json).collect()),
            )
            .with(
                "presets",
                Json::Arr(self.presets.iter().map(Preset::to_json).collect()),
            )
            .with(
                "quickMessages",
                Json::Arr(self.quick_messages.iter().map(Json::from).collect()),
            )
            .with(
                "agenda",
                Json::obj()
                    .with("timerId", &self.agenda.timer_id)
                    .with("plannedStart", &self.agenda.planned_start)
                    .with("autoStart", self.agenda.auto_start)
                    .with("mode", &self.agenda.mode)
                    .with("shiftMs", self.agenda.shift_ms)
                    .with("holdAt", self.agenda.hold_at)
                    .with("cursor", self.agenda.cursor)
                    .with(
                        "items",
                        Json::Arr(self.agenda.items.iter().map(Item::to_json).collect()),
                    ),
            )
    }

    /// Tolerant loader for persisted state: anything missing or broken
    /// falls back to defaults instead of refusing to start.
    pub fn from_json(j: &Json) -> State {
        let mut s = State::default();
        s.rev = j.get("rev").as_i64().unwrap_or(0).max(0);
        s.seq = j.get("seq").as_i64().unwrap_or(0).max(0);
        s.event_title = j
            .get("event")
            .get("title")
            .as_str()
            .unwrap_or("")
            .to_string();
        s.blackout = j.get("blackout").truthy();
        if let Some(list) = j.get("timers").as_array() {
            let mut timers: Vec<Timer> = Vec::new();
            for (i, tj) in list.iter().enumerate().take(MAX_TIMERS) {
                let t = Timer::from_json(tj, i + 1);
                if !timers.iter().any(|x| x.id == t.id) {
                    timers.push(t);
                }
            }
            if !timers.is_empty() {
                s.timers = timers;
            }
        }
        if let Some(list) = j.get("presets").as_array() {
            for pj in list {
                if pj.get("builtin").truthy() {
                    continue;
                }
                if let Some(id) = pj.get("id").as_str() {
                    let base = builtin_presets().remove(0);
                    let mut p = sanitize_preset(pj, &base, id.to_string());
                    if let Some(n) = pj.get("name").as_str() {
                        p.name = n.to_string();
                    }
                    s.presets.push(p);
                }
            }
        }
        for t in s.timers.iter_mut() {
            if !s.presets.iter().any(|p| p.id == t.preset_id) {
                t.preset_id = "stage".into();
            }
        }
        if let Some(list) = j.get("quickMessages").as_array() {
            s.quick_messages = list
                .iter()
                .filter_map(|x| x.as_str().map(String::from))
                .take(12)
                .collect();
        }
        let a = j.get("agenda");
        if let Some(tid) = a.get("timerId").as_str() {
            if s.timer_idx(tid).is_some() {
                s.agenda.timer_id = tid.to_string();
            }
        }
        if !s.timers.iter().any(|t| t.id == s.agenda.timer_id) {
            s.agenda.timer_id = s.timers[0].id.clone();
        }
        let ps = a.get("plannedStart").as_str().unwrap_or("");
        s.agenda.planned_start = if valid_hhmm(ps) {
            ps.to_string()
        } else {
            String::new()
        };
        if a.has("autoStart") {
            s.agenda.auto_start = a.get("autoStart").truthy();
        }
        if let Some(m @ ("manual" | "clock")) = a.get("mode").as_str() {
            s.agenda.mode = m.to_string();
        }
        s.agenda.shift_ms = a.get("shiftMs").as_i64().unwrap_or(0).clamp(-DAY, DAY);
        s.agenda.hold_at = a.get("holdAt").as_i64();
        if let Some(list) = a.get("items").as_array() {
            s.agenda.items = list
                .iter()
                .filter_map(Item::from_json)
                .take(MAX_ITEMS)
                .collect();
        }
        let len = s.agenda.items.len() as i64;
        s.agenda.cursor = a.get("cursor").as_i64().unwrap_or(-1).clamp(-1, len);
        s
    }
}

// ------------------------------------------------------------------ tests

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    fn resolve(s: &State, path: &str, now: i64) -> Json {
        let parts: Vec<&str> = path.split('.').collect();
        if parts[0] == "view" {
            return match s.timer_idx(parts[1]) {
                Some(i) => timer_view(&s.timers[i], now)
                    .to_json()
                    .get(parts[2])
                    .clone(),
                None => Json::Null,
            };
        }
        if parts[0] == "agendaView" {
            return agenda_view(s, now).to_json(s).get(parts[1]).clone();
        }
        let mut v = s.to_json();
        for p in parts {
            if p == "length" {
                if let Some(a) = v.as_array() {
                    return Json::from(a.len());
                }
            }
            v = v.get(p).clone();
        }
        v
    }

    #[test]
    fn scenarios_match_js_engine() {
        let all = json::parse(include_str!("../tests/scenarios.json")).expect("scenarios.json");
        let mut failures = Vec::new();
        let mut checks = 0;
        for sc in all.as_array().unwrap() {
            let name = sc.get("name").as_str().unwrap();
            let mut s = State::default();
            for (i, step) in sc.get("steps").as_array().unwrap().iter().enumerate() {
                let at = step.get("at").as_i64().unwrap();
                if !step.get("do").is_null() {
                    let changed = apply(&mut s, step.get("do"), at);
                    let want = if step.has("changed") {
                        step.get("changed").truthy()
                    } else {
                        true
                    };
                    checks += 1;
                    if changed != want {
                        failures.push(format!(
                            "{} #{} {}: changed={} expected {}",
                            name,
                            i,
                            step.get("do").get("type").to_string(),
                            changed,
                            want
                        ));
                    }
                }
                if let Json::Obj(exp) = step.get("expect") {
                    for (path, want) in exp {
                        checks += 1;
                        let got = resolve(&s, path, at);
                        if got != *want {
                            failures.push(format!(
                                "{} #{} {}: got {} expected {}",
                                name,
                                i,
                                path,
                                got.to_string(),
                                want.to_string()
                            ));
                        }
                    }
                }
            }
        }
        assert!(
            failures.is_empty(),
            "{} of {} checks failed:\n{}",
            failures.len(),
            checks,
            failures.join("\n")
        );
    }

    #[test]
    fn state_roundtrip() {
        let mut s = State::default();
        apply(
            &mut s,
            &json::parse(r#"{"type":"agenda.replace","items":[{"title":"A","durationMs":60000}]}"#)
                .unwrap(),
            0,
        );
        apply(
            &mut s,
            &json::parse(r#"{"type":"preset.save","preset":{"baseId":"stage","name":"X"}}"#)
                .unwrap(),
            0,
        );
        apply(
            &mut s,
            &json::parse(r#"{"type":"agenda.next"}"#).unwrap(),
            5,
        );
        let j = s.to_json();
        let back = State::from_json(&json::parse(&j.to_string()).unwrap());
        assert_eq!(back.to_json(), j);
    }

    #[test]
    fn formatting() {
        assert_eq!(format_ms(0, false), "00:00");
        assert_eq!(format_ms(59_001, false), "01:00");
        assert_eq!(format_ms(3_600_000, false), "1:00:00");
        assert_eq!(format_ms(-61_000, false), "+01:01");
        assert_eq!(format_ms(1_999, true), "00:01");
    }
}
