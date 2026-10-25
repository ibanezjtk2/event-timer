// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

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
const DEFAULT_STAGE: [&str; 6] = [
    "Brauche 2 Minuten mehr",
    "Mikrofon-Problem",
    "Frage aus dem Saal",
    "Technik bitte kommen",
    "Bitte Pause einlegen",
    "Alles okay",
];
const DEFAULT_TALK: [&str; 8] = [
    "Noch 5 Minuten",
    "Noch 1 Minute",
    "Bitte zum Ende kommen",
    "Bitte strecken",
    "Keine Fragen mehr",
    "Einspieler kommt",
    "Mikrofon ist aus",
    "Technisches Problem – bitte überbrücken",
];
/// talkback defaults up to 1.5.2 – an untouched old list is swapped for the new one
const OLD_TALK: [&str; 6] = [
    "Noch 5 Minuten",
    "Bitte zum Ende kommen",
    "Letzte Frage",
    "Mikrofon ist aus",
    "Fragen aus dem Saal nehmen",
    "Pause wird verlängert",
];
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
}

impl Kind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Kind::Countdown => "countdown",
            Kind::Countup => "countup",
            Kind::Clock => "clock",
            Kind::Time => "time",
        }
    }
    /// kinds that don't count by themselves
    pub fn is_static(&self) -> bool {
        matches!(self, Kind::Time)
    }
    fn parse(s: &str) -> Option<Kind> {
        match s {
            "countdown" => Some(Kind::Countdown),
            "countup" => Some(Kind::Countup),
            "clock" => Some(Kind::Clock),
            "time" => Some(Kind::Time),
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
    pub cues: Vec<Cue>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
}

/// Technical cue for the control room, relative to a slot's start or end.
#[derive(Clone, Debug)]
pub struct Cue {
    pub id: String,
    pub text: String,
    pub at_end: bool,
    pub offset_ms: i64,
    pub done: bool,
}

/// Message from the stage to the control room.
#[derive(Clone, Debug)]
pub struct Request {
    pub id: String,
    pub text: String,
    pub from: String,
    pub at: i64,
    pub ack: bool,
}

/// Talkback: a note from the control room to the presenter's phone.
#[derive(Clone, Debug)]
pub struct Talk {
    pub id: String,
    pub text: String,
    pub at: i64,
    pub ack_at: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct Agenda {
    pub timer_id: String,
    pub planned_start: String,
    pub auto_start: bool,
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
    pub stage_quick: Vec<String>,
    pub requests: Vec<Request>,
    pub talk_quick: Vec<String>,
    pub talkback: Vec<Talk>,
    pub agenda: Agenda,
    /// outputs: what the devices show, each with an address /1…/16
    pub screens: Vec<Screen>,
    /// screens that show the same thing
    pub groups: Vec<Group>,
    /// overlays per screen id (or "plan" for the fixed /plan page)
    pub dsm_msg: Vec<(String, Message)>,
}

// ------------------------------------------------------------------ screens

pub const MAX_SCREENS: usize = 16;
const MAX_GROUPS: usize = 8;
const MAX_SLOT_MODULES: usize = 8;

/// One building block on a screen; only the options of its type are kept.
#[derive(Clone, Debug, PartialEq)]
pub struct Module {
    pub id: String,
    pub typ: String,
    pub timer: String,
    pub variant: String,
    pub seconds: bool,
    pub page: String,
}

/// An output with an address /num: "show" (display only) or "mod" (presenter, touch).
/// In a group it shows the group's layout unless `own` is set.
#[derive(Clone, Debug, PartialEq)]
pub struct Screen {
    pub id: String,
    pub num: i64,
    pub kind: String,
    pub name: String,
    pub slug: String,
    pub group: String,
    pub own: bool,
    pub layout: String,
    pub slots: Vec<Vec<Module>>,
}

/// Screens that show the same thing (e.g. two DSMs in front of the stage).
#[derive(Clone, Debug, PartialEq)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub layout: String,
    pub slots: Vec<Vec<Module>>,
}

fn page_layouts(kind: &str) -> &'static [&'static str] {
    if kind == "mod" {
        &["two", "one"]
    } else {
        &["full", "side", "bottom"]
    }
}

fn slot_count(layout: &str) -> usize {
    match layout {
        "side" | "bottom" | "two" => 2,
        _ => 1,
    }
}

/// Display screens are no touch screens: nothing interactive there.
fn module_allowed(typ: &str, kind: &str) -> bool {
    match typ {
        "timer" | "clock" | "next" | "agenda" | "message" => true,
        "note" | "talkback" | "request" => kind == "mod",
        _ => false,
    }
}

fn digits_id(s: &str, prefix: char) -> bool {
    let b = s.as_bytes();
    b.len() >= 2 && b.len() <= 10 && s.starts_with(prefix) && b[1..].iter().all(u8::is_ascii_digit)
}

fn valid_slug(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty()
        && b.len() <= 40
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

/// Starting layouts as raw JSON (same as engine.js templateAufbau).
fn template(name: &str, timer: &str) -> Json {
    let m = |t: &str| Json::obj().with("type", t).with("opts", Json::obj());
    let tm = Json::obj().with("type", "timer").with(
        "opts",
        Json::obj().with("timer", timer).with("variant", "full"),
    );
    let (kind, layout, slots) = match name {
        "agenda" => ("show", "side", vec![vec![tm], vec![m("agenda")]]),
        "clock" => (
            "show",
            "full",
            vec![vec![Json::obj()
                .with("type", "clock")
                .with("opts", Json::obj().with("seconds", true))]],
        ),
        "mod" => (
            "mod",
            "two",
            vec![
                vec![tm, m("note"), m("agenda")],
                vec![m("talkback"), m("request")],
            ],
        ),
        _ => ("show", "full", vec![vec![tm]]),
    };
    Json::obj().with("kind", kind).with("layout", layout).with(
        "slots",
        Json::Arr(slots.into_iter().map(Json::Arr).collect()),
    )
}

impl Module {
    pub fn to_json(&self) -> Json {
        let opts = match self.typ.as_str() {
            "timer" => Json::obj()
                .with("timer", &self.timer)
                .with("variant", &self.variant),
            "clock" => Json::obj().with("seconds", self.seconds),
            "message" => Json::obj().with("page", &self.page),
            _ => Json::obj(),
        };
        Json::obj()
            .with("id", &self.id)
            .with("type", &self.typ)
            .with("opts", opts)
    }
}

fn slots_json(slots: &[Vec<Module>]) -> Json {
    Json::Arr(
        slots
            .iter()
            .map(|sl| Json::Arr(sl.iter().map(Module::to_json).collect()))
            .collect(),
    )
}

impl Screen {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("id", &self.id)
            .with("num", self.num)
            .with("kind", &self.kind)
            .with("name", &self.name)
            .with("slug", &self.slug)
            .with("group", &self.group)
            .with("own", self.own)
            .with("layout", &self.layout)
            .with("slots", slots_json(&self.slots))
    }
}

impl Group {
    pub fn to_json(&self) -> Json {
        Json::obj()
            .with("id", &self.id)
            .with("name", &self.name)
            .with("kind", &self.kind)
            .with("layout", &self.layout)
            .with("slots", slots_json(&self.slots))
    }
}

fn sanitize_module(seq: &mut i64, raw: &Json, kind: &str, used: &mut Vec<String>) -> Option<Module> {
    let typ = raw.get("type").as_str()?;
    if !module_allowed(typ, kind) {
        return None;
    }
    let o = raw.get("opts");
    let id = match raw.get("id").as_str() {
        Some(id) if digits_id(id, 'm') && !used.iter().any(|u| u == id) => id.to_string(),
        _ => {
            *seq += 1;
            format!("m{}", seq)
        }
    };
    used.push(id.clone());
    let timer = match o.get("timer").as_str() {
        Some(t) if t.len() == 2 && t.starts_with('t') && (b'1'..=b'8').contains(&t.as_bytes()[1]) => t.to_string(),
        _ => "t1".to_string(),
    };
    let page = match o.get("page").as_str() {
        Some(p)
            if !p.is_empty()
                && p.len() <= 20
                && p.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) =>
        {
            p.to_string()
        }
        _ => String::new(),
    };
    Some(Module {
        id,
        typ: typ.to_string(),
        timer,
        variant: pick(o.get("variant"), &["full", "clock", "lower"], "full"),
        seconds: if o.has("seconds") { o.get("seconds").truthy() } else { true },
        page,
    })
}

/// layout + slots, cleaned for the given kind
fn sanitize_aufbau(seq: &mut i64, raw: &Json, kind: &str) -> (String, Vec<Vec<Module>>) {
    let layouts = page_layouts(kind);
    let layout = pick(raw.get("layout"), layouts, layouts[0]);
    let mut used = Vec::new();
    let mut slots = Vec::new();
    for i in 0..slot_count(&layout) {
        let mut out = Vec::new();
        if let Some(src) = raw
            .get("slots")
            .as_array()
            .and_then(|a| a.get(i))
            .and_then(Json::as_array)
        {
            for m in src {
                if out.len() >= MAX_SLOT_MODULES {
                    break;
                }
                if let Some(md) = sanitize_module(seq, m, kind, &mut used) {
                    out.push(md);
                }
            }
        }
        slots.push(out);
    }
    (layout, slots)
}

/// next free id like "p7" – skips ids that already exist
fn new_id(seq: &mut i64, prefix: char, taken: &[&str]) -> String {
    loop {
        *seq += 1;
        let id = format!("{}{}", prefix, seq);
        if !taken.contains(&id.as_str()) {
            return id;
        }
    }
}

/// lowest address 1…16 no other screen uses
fn free_num(screens: &[Screen], except: &str) -> i64 {
    (1..=MAX_SCREENS as i64)
        .find(|n| !screens.iter().any(|x| x.id != except && x.num == *n))
        .unwrap_or(0)
}

/// `old` = (id, kind, num) of the screen being replaced; id and kind never change.
fn sanitize_screen(s: &mut State, raw: &Json, old: Option<(String, String, i64)>) -> Screen {
    let (id, kind, old_num) = match old {
        Some(o) => o,
        None => {
            let ids: Vec<&str> = s.screens.iter().map(|x| x.id.as_str()).collect();
            let id = new_id(&mut s.seq, 'p', &ids);
            (id, pick(raw.get("kind"), &["show", "mod"], "show"), 0)
        }
    };
    let mut name = text(raw.get("name"), 40);
    if name.is_empty() {
        name = if kind == "show" { "Screen" } else { "Moderation" }.to_string();
    }
    let taken = |n: i64| s.screens.iter().any(|x| x.id != id && x.num == n);
    let want_num = raw
        .get("num")
        .as_f64()
        .filter(|f| f.fract() == 0.0 && *f >= 1.0 && *f <= MAX_SCREENS as f64)
        .map(|f| f as i64)
        .filter(|n| !taken(*n));
    let num = match want_num {
        Some(n) => n,
        None if old_num > 0 && !taken(old_num) => old_num,
        None => free_num(&s.screens, &id),
    };
    let want = match raw.get("slug").as_str() {
        Some(sl) if valid_slug(sl) => sl.to_string(),
        _ => format!("screen-{}", &id[1..]),
    };
    let mut slug = want.clone();
    let mut n = 2;
    while s.screens.iter().any(|p| p.id != id && p.slug == slug) {
        slug = format!("{}-{}", want.chars().take(36).collect::<String>(), n);
        n += 1;
    }
    let group = raw
        .get("group")
        .as_str()
        .filter(|g| s.groups.iter().any(|x| x.id == *g && x.kind == kind))
        .unwrap_or("")
        .to_string();
    let own = !group.is_empty() && raw.get("own").truthy();
    let (layout, slots) = sanitize_aufbau(&mut s.seq, raw, &kind);
    Screen { id, num, kind, name, slug, group, own, layout, slots }
}

fn is_dsm_target(s: &State, id: &str) -> bool {
    id == "plan" || s.screens.iter().any(|p| p.id == id && p.kind == "show")
}

/// valid, de-duplicated overlay targets from an action
fn dsm_ids(s: &State, list: &Json) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(l) = list.as_array() {
        for v in l.iter().take(32) {
            if let Some(id) = v.as_str() {
                if !out.iter().any(|x| x == id) && is_dsm_target(s, id) {
                    out.push(id.to_string());
                }
            }
        }
    }
    out
}

/// The screen behind "/N" (for Companion's timerN/message), if there is one.
pub fn dsm_page_for(s: &State, n: &str) -> Option<String> {
    let n: i64 = n.parse().ok()?;
    s.screens.iter().find(|x| x.num == n).map(|x| x.id.clone())
}

impl State {
    pub fn dsm_message(&self, page: &str) -> Option<&Message> {
        self.dsm_msg.iter().find(|(k, _)| k == page).map(|(_, m)| m)
    }
}

fn default_screen(id: &str, num: i64, name: &str, slug: &str, tpl: Json, base: usize) -> Screen {
    // fixed module ids "m10", "m11" … like engine.js
    let mut n = 0;
    let mut raw = tpl.clone();
    if let Json::Arr(slots) = tpl.get("slots").clone() {
        let ids: Vec<Json> = slots
            .into_iter()
            .map(|sl| {
                let list = sl.as_array().cloned().unwrap_or_default();
                Json::Arr(
                    list.into_iter()
                        .map(|mut m| {
                            m.set("id", format!("m{}{}", base, n).as_str());
                            n += 1;
                            m
                        })
                        .collect(),
                )
            })
            .collect();
        raw.set("slots", Json::Arr(ids));
    }
    let kind = tpl.get("kind").as_str().unwrap_or("show").to_string();
    let mut seq = 0;
    let (layout, slots) = sanitize_aufbau(&mut seq, &raw, &kind);
    Screen {
        id: id.into(),
        num,
        kind,
        name: name.into(),
        slug: slug.into(),
        group: String::new(),
        own: false,
        layout,
        slots,
    }
}

/// Up to 1.6.0-beta.1 timers had addresses (/N) and custom pages could stand in for them.
/// Now every address is a screen (same rules as engine.js migrateScreens).
fn migrate_screens(s: &mut State, j: &Json) {
    let pages: Vec<Json> = j.get("pages").as_array().cloned().unwrap_or_default();
    let routes = j.get("routes");
    let msg = |m: &Json| Message {
        text: m.get("text").as_str().unwrap_or("").chars().take(280).collect(),
        flash: m.get("flash").truthy(),
        visible: m.get("visible").truthy(),
    };
    // overlays by old page id ("dN" for the built-in /N); 1.5.x kept them on the timer
    let mut old: Vec<(String, Message)> = Vec::new();
    if let Json::Obj(items) = j.get("dsmMsg") {
        for (k, m) in items {
            old.push((k.clone(), msg(m)));
        }
    } else if let Some(list) = j.get("timers").as_array() {
        for tj in list {
            if let Some(id) = tj.get("id").as_str() {
                old.push((format!("d{}", &id[1.min(id.len())..]), msg(tj.get("message"))));
            }
        }
    }
    let find_old = |k: &str| old.iter().find(|(x, m)| x == k && !m.text.is_empty()).map(|(_, m)| m.clone());
    s.screens.clear();
    s.groups.clear();
    s.dsm_msg.clear();
    let add = |s: &mut State, raw: &Json, num: i64, keep: Option<&str>| -> String {
        let mut r = raw.clone();
        r.set("num", num);
        r.set("kind", if raw.get("kind").as_str() == Some("mod") { "mod" } else { "show" });
        r.set("group", "");
        let mut sc = sanitize_screen(s, &r, None);
        if let Some(k) = keep {
            if digits_id(k, 'p') && !s.screens.iter().any(|x| x.id == k) {
                sc.id = k.to_string();
            }
        }
        let id = sc.id.clone();
        s.screens.push(sc);
        id
    };
    let mut used: Vec<String> = Vec::new();
    let timers: Vec<String> = s.timers.iter().map(|t| t.id.clone()).collect();
    for tid in &timers {
        let n: i64 = tid[1..].parse().unwrap_or(0);
        let pg = routes
            .get(&n.to_string())
            .as_str()
            .and_then(|pid| pages.iter().find(|p| p.get("id").as_str() == Some(pid)));
        let id = match pg {
            Some(p) => {
                let pid = p.get("id").as_str().unwrap_or("").to_string();
                used.push(pid.clone());
                add(s, p, n, Some(&pid))
            }
            None => {
                let mut raw = template("dsm", tid);
                raw.set("name", format!("DSM {}", n).as_str());
                raw.set("slug", format!("dsm-{}", n).as_str());
                add(s, &raw, n, None)
            }
        };
        let key = pg
            .and_then(|p| p.get("id").as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("d{}", n));
        if let Some(m) = find_old(&key) {
            s.dsm_msg.push((id, m));
        }
    }
    for p in &pages {
        let pid = p.get("id").as_str().unwrap_or("").to_string();
        if used.contains(&pid) || s.screens.len() >= MAX_SCREENS {
            continue;
        }
        let n = free_num(&s.screens, "");
        let id = add(s, p, n, Some(&pid));
        if let Some(m) = find_old(&pid) {
            s.dsm_msg.push((id, m));
        }
    }
    if !s.screens.iter().any(|x| x.kind == "mod") && s.screens.len() < MAX_SCREENS {
        let mut raw = template("mod", &s.agenda.timer_id.clone());
        raw.set("name", "Moderation");
        raw.set("slug", "moderation");
        let n = free_num(&s.screens, "");
        add(s, &raw, n, None);
    }
    if let Some(m) = find_old("plan") {
        s.dsm_msg.push(("plan".into(), m));
    }
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
    let de = ["Bitte zum Ende kommen", "Zeit abgelaufen", "Überzeit"];
    vec![
        builtin(
            "stage",
            "Bühne",
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
            stage_quick: DEFAULT_STAGE.iter().map(|s| s.to_string()).collect(),
            requests: Vec::new(),
            talk_quick: DEFAULT_TALK.iter().map(|s| s.to_string()).collect(),
            talkback: Vec::new(),
            screens: vec![
                default_screen("p1", 1, "DSM", "dsm", template("dsm", "t1"), 1),
                default_screen("p2", 2, "Moderation", "moderation", template("mod", "t1"), 2),
            ],
            groups: Vec::new(),
            dsm_msg: Vec::new(),
            agenda: Agenda {
                timer_id: "t1".into(),
                planned_start: String::new(),
                auto_start: true,
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
        cues: Vec::new(),
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
    // a new slot starts clean: overlays for the previous speaker go away
    s.dsm_msg.clear();
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
        "dsm.message" => {
            let ids = dsm_ids(s, a.get("pages"));
            let mut changed = false;
            for id in ids {
                let pos = match s.dsm_msg.iter().position(|(k, _)| *k == id) {
                    Some(p) => p,
                    None => {
                        if !a.has("text") {
                            continue;
                        }
                        s.dsm_msg.push((id, Message::default()));
                        s.dsm_msg.len() - 1
                    }
                };
                let m = &mut s.dsm_msg[pos].1;
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
                changed = true;
            }
            changed
        }
        "dsm.clear" => {
            let ids = dsm_ids(s, a.get("pages"));
            let before = s.dsm_msg.len();
            s.dsm_msg.retain(|(k, _)| !ids.contains(k));
            s.dsm_msg.len() != before
        }
        "screen.save" => {
            let raw = a.get("screen");
            if !matches!(raw, Json::Obj(_)) {
                return false;
            }
            let pos = raw
                .get("id")
                .as_str()
                .and_then(|id| s.screens.iter().position(|p| p.id == id));
            if pos.is_none() && s.screens.len() >= MAX_SCREENS {
                return false;
            }
            let old = pos.map(|i| (s.screens[i].id.clone(), s.screens[i].kind.clone(), s.screens[i].num));
            let mut sc = sanitize_screen(s, raw, old);
            // "+ neue Gruppe": the group starts with this screen's layout, the screen follows it
            let ng = a.get("newGroup");
            if matches!(ng, Json::Obj(_) | Json::Arr(_)) && s.groups.len() < MAX_GROUPS {
                let ids: Vec<&str> = s.groups.iter().map(|x| x.id.as_str()).collect();
                let gid = new_id(&mut s.seq, 'g', &ids);
                let mut name = text(ng.get("name"), 40);
                if name.is_empty() {
                    name = sc.name.clone();
                }
                s.groups.push(Group {
                    id: gid.clone(),
                    name,
                    kind: sc.kind.clone(),
                    layout: sc.layout.clone(),
                    slots: sc.slots.clone(),
                });
                sc.group = gid;
                sc.own = false;
            }
            match pos {
                Some(i) => s.screens[i] = sc,
                None => s.screens.push(sc),
            }
            true
        }
        "screen.remove" => {
            let Some(id) = a.get("screenId").as_str().map(String::from) else {
                return false;
            };
            let before = s.screens.len();
            s.screens.retain(|p| p.id != id);
            if s.screens.len() == before {
                return false;
            }
            s.dsm_msg.retain(|(k, _)| *k != id);
            true
        }
        "group.save" => {
            let raw = a.get("group");
            let Some(gi) = raw
                .get("id")
                .as_str()
                .and_then(|id| s.groups.iter().position(|g| g.id == id))
            else {
                return false;
            };
            let name = text(raw.get("name"), 40);
            if !name.is_empty() {
                s.groups[gi].name = name;
            }
            let kind = s.groups[gi].kind.clone();
            let (layout, slots) = sanitize_aufbau(&mut s.seq, raw, &kind);
            s.groups[gi].layout = layout;
            s.groups[gi].slots = slots;
            true
        }
        "group.remove" => {
            let Some(gi) = a
                .get("groupId")
                .as_str()
                .and_then(|id| s.groups.iter().position(|g| g.id == id))
            else {
                return false;
            };
            // members keep what they showed: they get the group's layout as their own
            let g = s.groups.remove(gi);
            for sc in s.screens.iter_mut().filter(|x| x.group == g.id) {
                if !sc.own {
                    sc.layout = g.layout.clone();
                    sc.slots = g.slots.clone();
                }
                sc.group.clear();
                sc.own = false;
            }
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
        "cue.add" => {
            let iid = a.get("itemId").as_str().unwrap_or("");
            let Some(ii) = s.agenda.items.iter().position(|x| x.id == iid) else {
                return false;
            };
            if s.agenda.items[ii].cues.len() >= 20 {
                return false;
            }
            s.seq += 1;
            let t = text(a.get("text"), 80);
            let cue = Cue {
                id: format!("c{}", s.seq),
                text: if t.is_empty() { "Cue".into() } else { t },
                at_end: a.get("ref").as_str() == Some("end"),
                offset_ms: num(a.get("offsetMs"), -DAY, DAY, Some(0)).unwrap_or(0),
                done: false,
            };
            s.agenda.items[ii].cues.push(cue);
            true
        }
        "cue.update" | "cue.remove" | "cue.done" => {
            let iid = a.get("itemId").as_str().unwrap_or("");
            let cid = a.get("cueId").as_str().unwrap_or("");
            let Some(it) = s.agenda.items.iter_mut().find(|x| x.id == iid) else {
                return false;
            };
            let Some(ci) = it.cues.iter().position(|x| x.id == cid) else {
                return false;
            };
            match kind {
                "cue.remove" => {
                    it.cues.remove(ci);
                }
                "cue.done" => {
                    it.cues[ci].done = if a.has("done") {
                        a.get("done").truthy()
                    } else {
                        true
                    };
                }
                _ => {
                    let p = a.get("patch");
                    let c = &mut it.cues[ci];
                    if p.has("text") {
                        let t = text(p.get("text"), 80);
                        if !t.is_empty() {
                            c.text = t;
                        }
                    }
                    if p.has("ref") {
                        c.at_end = p.get("ref").as_str() == Some("end");
                    }
                    if p.has("offsetMs") {
                        c.offset_ms = num(p.get("offsetMs"), -DAY, DAY, Some(c.offset_ms))
                            .unwrap_or(c.offset_ms);
                    }
                }
            }
            true
        }
        "request.send" => {
            let t = text(a.get("text"), 120);
            if t.is_empty() {
                return false;
            }
            let from = text(a.get("from"), 30);
            s.seq += 1;
            s.requests.push(Request {
                id: format!("r{}", s.seq),
                text: t,
                from: if from.is_empty() {
                    "Bühne".into()
                } else {
                    from
                },
                at: now,
                ack: false,
            });
            while s.requests.len() > 30 {
                let i = s.requests.iter().position(|x| x.ack).unwrap_or(0);
                s.requests.remove(i);
            }
            true
        }
        "request.ack" => {
            let rid = a.get("requestId").as_str().unwrap_or("");
            match s.requests.iter_mut().find(|x| x.id == rid) {
                Some(r) if !r.ack => {
                    r.ack = true;
                    true
                }
                _ => false,
            }
        }
        "request.ackAll" => {
            if !s.requests.iter().any(|x| !x.ack) {
                return false;
            }
            for r in s.requests.iter_mut() {
                r.ack = true;
            }
            true
        }
        "request.clear" => {
            if s.requests.is_empty() {
                return false;
            }
            s.requests.clear();
            true
        }
        "talkback.send" => {
            let t = text(a.get("text"), 120);
            if t.is_empty() {
                return false;
            }
            s.seq += 1;
            s.talkback.push(Talk {
                id: format!("k{}", s.seq),
                text: t,
                at: now,
                ack_at: None,
            });
            while s.talkback.len() > 20 {
                let i = s
                    .talkback
                    .iter()
                    .position(|x| x.ack_at.is_some())
                    .unwrap_or(0);
                s.talkback.remove(i);
            }
            true
        }
        "talkback.ack" => {
            // with an id: that note; without: everything still open
            let tid = a.get("talkbackId").as_str();
            let mut changed = false;
            for k in s.talkback.iter_mut() {
                if k.ack_at.is_none() && tid.map_or(true, |id| id == k.id) {
                    k.ack_at = Some(now);
                    changed = true;
                }
            }
            changed
        }
        "talkback.clear" => {
            if s.talkback.is_empty() {
                return false;
            }
            s.talkback.clear();
            true
        }
        "talkback.quickSet" => {
            let Some(list) = a.get("list").as_array() else {
                return false;
            };
            s.talk_quick = list
                .iter()
                .map(|x| text(x, 60))
                .filter(|x| !x.is_empty())
                .take(12)
                .collect();
            true
        }
        "stage.quickSet" => {
            let Some(list) = a.get("list").as_array() else {
                return false;
            };
            s.stage_quick = list
                .iter()
                .map(|x| text(x, 60))
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
        "agenda.reset" => {
            s.agenda.cursor = -1;
            for it in s.agenda.items.iter_mut() {
                it.started_at = None;
                it.ended_at = None;
                for c in it.cues.iter_mut() {
                    c.done = false;
                }
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
            .with(
                "cues",
                Json::Arr(
                    self.cues
                        .iter()
                        .map(|c| {
                            Json::obj()
                                .with("id", &c.id)
                                .with("text", &c.text)
                                .with("ref", if c.at_end { "end" } else { "start" })
                                .with("offsetMs", c.offset_ms)
                                .with("done", c.done)
                        })
                        .collect(),
                ),
            )
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
            cues: j
                .get("cues")
                .as_array()
                .map(|l| {
                    l.iter()
                        .filter_map(|c| {
                            Some(Cue {
                                id: c.get("id").as_str()?.to_string(),
                                text: c.get("text").as_str().unwrap_or("Cue").to_string(),
                                at_end: c.get("ref").as_str() == Some("end"),
                                offset_ms: c.get("offsetMs").as_i64().unwrap_or(0).clamp(-DAY, DAY),
                                done: c.get("done").truthy(),
                            })
                        })
                        .take(20)
                        .collect()
                })
                .unwrap_or_default(),
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
                "stageQuick",
                Json::Arr(self.stage_quick.iter().map(Json::from).collect()),
            )
            .with(
                "requests",
                Json::Arr(
                    self.requests
                        .iter()
                        .map(|r| {
                            Json::obj()
                                .with("id", &r.id)
                                .with("text", &r.text)
                                .with("from", &r.from)
                                .with("at", r.at)
                                .with("ack", r.ack)
                        })
                        .collect(),
                ),
            )
            .with(
                "talkQuick",
                Json::Arr(self.talk_quick.iter().map(Json::from).collect()),
            )
            .with(
                "talkback",
                Json::Arr(
                    self.talkback
                        .iter()
                        .map(|k| {
                            Json::obj()
                                .with("id", &k.id)
                                .with("text", &k.text)
                                .with("at", k.at)
                                .with("ackAt", k.ack_at)
                        })
                        .collect(),
                ),
            )
            .with(
                "agenda",
                Json::obj()
                    .with("timerId", &self.agenda.timer_id)
                    .with("plannedStart", &self.agenda.planned_start)
                    .with("autoStart", self.agenda.auto_start)
                    .with("cursor", self.agenda.cursor)
                    .with(
                        "items",
                        Json::Arr(self.agenda.items.iter().map(Item::to_json).collect()),
                    ),
            )
            .with(
                "screens",
                Json::Arr(self.screens.iter().map(Screen::to_json).collect()),
            )
            .with(
                "groups",
                Json::Arr(self.groups.iter().map(Group::to_json).collect()),
            )
            .with(
                "dsmMsg",
                Json::Obj(
                    self.dsm_msg
                        .iter()
                        .map(|(k, m)| {
                            (
                                k.clone(),
                                Json::obj()
                                    .with("text", &m.text)
                                    .with("flash", m.flash)
                                    .with("visible", m.visible),
                            )
                        })
                        .collect(),
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
        if let Some(list) = j.get("stageQuick").as_array() {
            s.stage_quick = list
                .iter()
                .filter_map(|x| x.as_str().map(String::from))
                .take(12)
                .collect();
        }
        if let Some(list) = j.get("requests").as_array() {
            s.requests = list
                .iter()
                .filter_map(|r| {
                    Some(Request {
                        id: r.get("id").as_str()?.to_string(),
                        text: r.get("text").as_str().unwrap_or("").to_string(),
                        from: r.get("from").as_str().unwrap_or("").to_string(),
                        at: r.get("at").as_i64().unwrap_or(0),
                        ack: r.get("ack").truthy(),
                    })
                })
                .take(30)
                .collect();
        }
        if let Some(list) = j.get("talkQuick").as_array() {
            s.talk_quick = list
                .iter()
                .filter_map(|x| x.as_str().map(String::from))
                .take(12)
                .collect();
            if s.talk_quick.iter().map(String::as_str).eq(OLD_TALK.iter().copied()) {
                s.talk_quick = DEFAULT_TALK.iter().map(|s| s.to_string()).collect();
            }
        }
        if let Some(list) = j.get("talkback").as_array() {
            s.talkback = list
                .iter()
                .filter_map(|k| {
                    Some(Talk {
                        id: k.get("id").as_str()?.to_string(),
                        text: k.get("text").as_str().unwrap_or("").to_string(),
                        at: k.get("at").as_i64().unwrap_or(0),
                        ack_at: k.get("ackAt").as_i64(),
                    })
                })
                .take(20)
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
        if let Some(list) = a.get("items").as_array() {
            s.agenda.items = list
                .iter()
                .filter_map(Item::from_json)
                .take(MAX_ITEMS)
                .collect();
        }
        let len = s.agenda.items.len() as i64;
        s.agenda.cursor = a.get("cursor").as_i64().unwrap_or(-1).clamp(-1, len);
        if let Some(list) = j.get("screens").as_array() {
            s.screens.clear();
            s.groups.clear();
            for gj in j.get("groups").as_array().cloned().unwrap_or_default() {
                let Some(id) = gj.get("id").as_str().filter(|id| digits_id(id, 'g')) else {
                    continue;
                };
                if s.groups.len() >= MAX_GROUPS || s.groups.iter().any(|g| g.id == id) {
                    continue;
                }
                let kind = pick(gj.get("kind"), &["show", "mod"], "show");
                let mut name = text(gj.get("name"), 40);
                if name.is_empty() {
                    name = "Gruppe".into();
                }
                let (layout, slots) = sanitize_aufbau(&mut s.seq, &gj, &kind);
                s.groups.push(Group { id: id.to_string(), name, kind, layout, slots });
            }
            for sj in list {
                if s.screens.len() >= MAX_SCREENS {
                    break;
                }
                let Some(id) = sj.get("id").as_str().filter(|id| digits_id(id, 'p')) else {
                    continue;
                };
                if s.screens.iter().any(|p| p.id == id) {
                    continue;
                }
                let kind = pick(sj.get("kind"), &["show", "mod"], "show");
                let sc = sanitize_screen(&mut s, sj, Some((id.to_string(), kind, 0)));
                s.screens.push(sc);
            }
            if let Json::Obj(items) = j.get("dsmMsg") {
                for (k, m) in items {
                    if is_dsm_target(&s, k) && !s.dsm_msg.iter().any(|(x, _)| x == k) {
                        s.dsm_msg.push((
                            k.clone(),
                            Message {
                                text: m.get("text").as_str().unwrap_or("").chars().take(280).collect(),
                                flash: m.get("flash").truthy(),
                                visible: m.get("visible").truthy(),
                            },
                        ));
                    }
                }
            }
        } else {
            migrate_screens(&mut s, j);
        }
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
        apply(
            &mut s,
            &json::parse(r#"{"type":"screen.save","newGroup":{"name":"DSM"},"screen":{"kind":"show","name":"DSM links","slug":"dsm-links","num":3,"layout":"side","slots":[[{"type":"timer","opts":{"timer":"t2"}}],[{"type":"agenda"},{"type":"clock","opts":{"seconds":false}}]]}}"#)
                .unwrap(),
            0,
        );
        apply(
            &mut s,
            &json::parse(r#"{"type":"dsm.message","pages":["p1","p3"],"text":"Hallo","flash":true}"#).unwrap(),
            0,
        );
        assert_eq!(s.screens.len(), 3);
        assert_eq!(s.groups.len(), 1);
        assert_eq!(s.dsm_msg.len(), 2);
        let j = s.to_json();
        let back = State::from_json(&json::parse(&j.to_string()).unwrap());
        assert_eq!(back.to_json(), j);
    }

    #[test]
    fn migrates_old_shows() {
        // 1.5.2 file: untouched talkback list, run of show "by the clock"
        let old = r#"{"talkQuick":["Noch 5 Minuten","Bitte zum Ende kommen","Letzte Frage","Mikrofon ist aus","Fragen aus dem Saal nehmen","Pause wird verlängert"],
            "agenda":{"mode":"clock","shiftMs":60000,"holdAt":5,"items":[{"id":"a1","title":"A","durationMs":60000,"extraMs":1000,"rippleMs":2000}]}}"#;
        let s = State::from_json(&json::parse(old).unwrap());
        assert_eq!(s.talk_quick, DEFAULT_TALK.iter().map(|x| x.to_string()).collect::<Vec<_>>());
        let out = s.to_json().to_string();
        for gone in ["\"mode\"", "shiftMs", "holdAt", "extraMs", "rippleMs"] {
            assert!(!out.contains(gone), "{gone} still saved");
        }
        // 1.5.x: the overlay sat on the timer → now on DSM page dN
        let old15 = r#"{"timers":[{"id":"t1","message":{"text":"Bitte zum Ende","flash":true,"visible":true}},{"id":"t2","message":{"text":"","visible":false}}]}"#;
        let s15 = State::from_json(&json::parse(old15).unwrap());
        let nums: Vec<(i64, &str, &str)> = s15.screens.iter().map(|x| (x.num, x.kind.as_str(), x.name.as_str())).collect();
        assert_eq!(nums, vec![(1, "show", "DSM 1"), (2, "show", "DSM 2"), (3, "mod", "Moderation")]);
        assert_eq!(s15.screens[1].slots[0][0].timer, "t2");
        assert_eq!(s15.dsm_msg.len(), 1);
        let m = s15.dsm_message(&s15.screens[0].id).unwrap();
        assert!(m.visible && m.flash && m.text == "Bitte zum Ende");
        assert!(!s15.to_json().get("timers").get("0").has("message"));
        // 1.6.0-beta.1: page standing in for /1, extra presenter page, overlay on built-in /2
        let b1 = r#"{"seq":10,"timers":[{"id":"t1"},{"id":"t2","kind":"schedule"}],
            "pages":[{"id":"p5","kind":"dsm","name":"DSM Ablauf","slug":"dsm-ablauf","layout":"side","slots":[[{"id":"m6","type":"timer","opts":{"timer":"t1"}}],[{"id":"m7","type":"agenda"}]]},
                     {"id":"p8","kind":"mod","name":"Moderation Lea","slug":"moderation-lea","layout":"two","slots":[[{"id":"m9","type":"talkback"}],[]]}],
            "routes":{"1":"p5","moderation":"p8"},
            "dsmMsg":{"d2":{"text":"Hallo","visible":true},"p5":{"text":"Eins","visible":true}}}"#;
        let sb = State::from_json(&json::parse(b1).unwrap());
        let got: Vec<(i64, &str, &str)> = sb.screens.iter().map(|x| (x.num, x.kind.as_str(), x.slug.as_str())).collect();
        assert_eq!(got, vec![(1, "show", "dsm-ablauf"), (2, "show", "dsm-2"), (3, "mod", "moderation-lea")]);
        assert_eq!(sb.screens[0].id, "p5");
        assert_eq!(sb.dsm_message("p5").unwrap().text, "Eins");
        assert_eq!(sb.dsm_message(&sb.screens[1].id).unwrap().text, "Hallo");
        assert_eq!(sb.timers[1].kind, Kind::Countdown);
        let out = sb.to_json().to_string();
        assert!(!out.contains("\"routes\"") && !out.contains("\"pages\""));
        // an edited list stays as it is
        let own = State::from_json(&json::parse(r#"{"talkQuick":["Eigene"]}"#).unwrap());
        assert_eq!(own.talk_quick, vec!["Eigene".to_string()]);
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
