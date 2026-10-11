// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Application server: routing, WebSocket sessions, PIN, Companion API.

use crate::engine::{self, format_ms, timer_view, Kind, State};
use crate::http::{self, Request, Response, WsEvent};
use crate::json::{self, Json};
use crate::logx::{error, info};
use crate::store::{self, ServerCfg};
use crate::util::{hex, now_ms, query_param, salt, sha1};
use crate::{assets, mdns, net, APP_ID, VERSION};
use std::io::{BufReader, Write};
use std::net::{Ipv4Addr, Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

pub struct Client {
    id: u64,
    writer: Mutex<TcpStream>,
    role: Mutex<String>,
    authed: AtomicBool,
    loopback: bool,
    /// last stage request (rate limit for devices without control rights)
    last_request: AtomicU64,
}

pub struct NetInfo {
    pub addresses: Vec<String>,
    pub hostname: Option<String>,
}

pub struct App {
    pub state: Mutex<State>,
    pub cfg: Mutex<ServerCfg>,
    clients: Mutex<Vec<Arc<Client>>>,
    /// unsaved changes: time of the first and of the latest one (0 = all saved)
    first_dirty: AtomicI64,
    last_change: AtomicI64,
    pub port: AtomicU16,
    pub data_path: PathBuf,
    next_id: AtomicU64,
    pub net: Mutex<NetInfo>,
    bind_host: String,
    port80_active: AtomicBool,
    port80_error: Mutex<Option<String>>,
    pub mdns_ok: AtomicBool,
}

/// Poisoned locks are recovered – one panicking connection must never stop the show.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl App {
    pub fn new(state: State, cfg: ServerCfg, data_path: PathBuf, bind_host: String) -> App {
        App {
            state: Mutex::new(state),
            cfg: Mutex::new(cfg),
            clients: Mutex::new(Vec::new()),
            first_dirty: AtomicI64::new(0),
            last_change: AtomicI64::new(0),
            port: AtomicU16::new(0),
            data_path,
            next_id: AtomicU64::new(1),
            net: Mutex::new(NetInfo {
                addresses: net::lan_addresses(),
                hostname: net::local_hostname(),
            }),
            bind_host,
            port80_active: AtomicBool::new(false),
            port80_error: Mutex::new(None),
            mdns_ok: AtomicBool::new(false),
        }
    }

    pub fn mdns_name(&self) -> String {
        lock(&self.cfg).name.clone()
    }

    pub fn lan_ipv4(&self) -> Vec<Ipv4Addr> {
        lock(&self.net)
            .addresses
            .iter()
            .filter_map(|a| a.parse().ok())
            .collect()
    }

    pub fn port80_active(&self) -> bool {
        self.port80_active.load(Ordering::SeqCst)
    }

    /// Changes the network name ("<name>.local"). Returns false if invalid.
    pub fn set_name(&self, name: &str) -> bool {
        let name = name.trim().to_ascii_lowercase();
        if !mdns::valid_name(&name) {
            return false;
        }
        lock(&self.cfg).name = name;
        self.touch();
        true
    }

    pub fn pin_required(&self) -> bool {
        !lock(&self.cfg).pin_hash.is_empty()
    }

    fn check_pin(&self, pin: &str) -> bool {
        let cfg = lock(&self.cfg);
        !cfg.pin_hash.is_empty()
            && hex(&sha1(format!("{}{}", cfg.pin_salt, pin.trim()).as_bytes())) == cfg.pin_hash
    }

    pub fn set_pin(&self, pin: &str) {
        let mut cfg = lock(&self.cfg);
        let pin = pin.trim();
        if pin.is_empty() {
            cfg.pin_hash.clear();
        } else {
            cfg.pin_salt = salt();
            cfg.pin_hash = hex(&sha1(format!("{}{}", cfg.pin_salt, pin).as_bytes()));
        }
        drop(cfg);
        self.touch();
    }

    /// Marks the show as changed; the save thread writes it once things settle.
    pub fn touch(&self) {
        let now = now_ms();
        self.last_change.store(now, Ordering::SeqCst);
        let _ = self
            .first_dirty
            .compare_exchange(0, now, Ordering::SeqCst, Ordering::SeqCst);
    }

    /// Writes when nothing has changed for 2 s, or at the latest 10 s after
    /// the first unsaved change (a running show keeps changing).
    pub fn save_if_due(&self, now: i64) {
        let first = self.first_dirty.load(Ordering::SeqCst);
        if first == 0 {
            return;
        }
        let quiet = now - self.last_change.load(Ordering::SeqCst) >= 2_000;
        if quiet || now - first >= 10_000 {
            self.save_now();
        }
    }

    pub fn save_now(&self) {
        // cleared first: a change during the write marks the show dirty again
        self.first_dirty.store(0, Ordering::SeqCst);
        let st = lock(&self.state).clone();
        let cfg = lock(&self.cfg).clone();
        if let Err(e) = store::save(&self.data_path, &st, &cfg, VERSION) {
            error!(
                "Speichern fehlgeschlagen ({}): {}",
                self.data_path.display(),
                e
            );
        }
    }

    /// Applies an action, persists and notifies everyone. Returns whether it changed anything.
    pub fn act(&self, action: &Json) -> bool {
        let changed = engine::apply(&mut lock(&self.state), action, now_ms());
        if changed {
            self.touch();
            self.broadcast();
        }
        changed
    }

    fn meta(&self) -> Json {
        let clients = lock(&self.clients);
        let count = |r: &str| clients.iter().filter(|c| *lock(&c.role) == r).count();
        let (controls, displays) = (count("control"), count("display"));
        drop(clients);
        let net = lock(&self.net);
        Json::obj()
            .with("app", APP_ID)
            .with("version", VERSION)
            .with("pinRequired", self.pin_required())
            .with("controls", controls)
            .with("displays", displays)
            .with("port", self.port.load(Ordering::SeqCst))
            .with(
                "addresses",
                Json::Arr(net.addresses.iter().map(Json::from).collect()),
            )
            .with("hostname", net.hostname.clone())
            .with("dataPath", self.data_path.display().to_string())
            .with(
                "logPath",
                crate::logx::path().map(|p| p.display().to_string()),
            )
            .with("name", self.mdns_name())
            .with("nameHost", format!("{}.local", self.mdns_name()))
            .with("mdns", self.mdns_ok.load(Ordering::SeqCst))
            .with("port80", self.port80_active())
            .with("port80Error", lock(&self.port80_error).clone())
    }

    fn can_control(&self, c: &Client) -> bool {
        c.loopback || !self.pin_required() || c.authed.load(Ordering::SeqCst)
    }

    /// Sends the full state to every client. The state is small (a few KB),
    /// so full snapshots keep clients simple and self-healing.
    pub fn broadcast(&self) {
        let body = {
            let st = lock(&self.state);
            Json::obj()
                .with("type", "state")
                .with("now", now_ms())
                .with("state", st.to_json())
                .with("meta", self.meta())
                .to_string()
        };
        let clients: Vec<Arc<Client>> = lock(&self.clients).clone();
        for c in clients {
            self.send_state(&c, &body);
        }
    }

    fn send_state(&self, c: &Client, body: &str) {
        // append the per-client part without re-serialising everything
        let mut msg = String::with_capacity(body.len() + 32);
        msg.push_str(&body[..body.len() - 1]);
        msg.push_str(&format!(
            ",\"you\":{{\"canControl\":{},\"local\":{}}}}}",
            self.can_control(c),
            c.loopback
        ));
        send(c, &msg);
    }

    fn send_state_to(&self, c: &Client) {
        let body = {
            let st = lock(&self.state);
            Json::obj()
                .with("type", "state")
                .with("now", now_ms())
                .with("state", st.to_json())
                .with("meta", self.meta())
                .to_string()
        };
        self.send_state(c, &body);
    }
}

/// Serves an accepted connection on its own thread.
pub fn spawn_connection(app: &Arc<App>, stream: TcpStream) {
    let app = app.clone();
    std::thread::spawn(move || handle_connection(app, stream));
}

/// Optional second listener on port 80, so addresses work without ":2468".
/// Switchable at runtime; the accept loop polls a flag so it can stop.
pub fn set_port80(app: &Arc<App>, on: bool) -> Result<(), String> {
    lock(&app.cfg).port80 = on;
    app.touch();
    if !on {
        app.port80_active.store(false, Ordering::SeqCst);
        *lock(&app.port80_error) = None;
        return Ok(());
    }
    if app.port80_active() {
        return Ok(());
    }
    let listener = TcpListener::bind((app.bind_host.as_str(), 80))
        .and_then(|l| l.set_nonblocking(true).map(|_| l));
    let listener = match listener {
        Ok(l) => l,
        Err(e) => {
            let msg = match e.kind() {
                std::io::ErrorKind::PermissionDenied => {
                    "Port 80 braucht unter Linux erweiterte Rechte: sudo setcap cap_net_bind_service=+ep <programm>".to_string()
                }
                std::io::ErrorKind::AddrInUse => "Port 80 ist schon von einem anderen Programm belegt.".to_string(),
                _ => format!("Port 80 nicht verfügbar: {}", e),
            };
            *lock(&app.port80_error) = Some(msg.clone());
            return Err(msg);
        }
    };
    *lock(&app.port80_error) = None;
    app.port80_active.store(true, Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        while app.port80_active() {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    spawn_connection(&app, stream);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(60))
                }
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    });
    Ok(())
}

fn send(c: &Client, text: &str) {
    let frame = http::ws_frame(0x1, text.as_bytes());
    let mut w = lock(&c.writer);
    if w.write_all(&frame).is_err() {
        let _ = w.shutdown(Shutdown::Both);
    }
}

// ------------------------------------------------------------ connections

pub fn handle_connection(app: Arc<App>, stream: TcpStream) {
    let loopback = stream
        .peer_addr()
        .map(|a| a.ip().to_canonical().is_loopback())
        .unwrap_or(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_nodelay(true);
    let Ok(read_half) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(read_half);
    let mut stream = stream;
    let req = match http::read_request(&mut reader) {
        Ok(Some(r)) => r,
        _ => return,
    };
    let upgrade = req
        .header("upgrade")
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);
    if upgrade && req.path == "/ws" {
        if let Some(key) = req.header("sec-websocket-key").map(str::to_string) {
            ws_session(app, stream, reader, &key, loopback);
        }
        return;
    }
    let resp = route(&app, &req, loopback);
    let _ = http::write_response(&mut stream, &resp, req.method == "HEAD");
}

fn ws_session(
    app: Arc<App>,
    mut stream: TcpStream,
    mut reader: BufReader<TcpStream>,
    key: &str,
    loopback: bool,
) {
    if http::ws_accept(&mut stream, key).is_err() {
        return;
    }
    // clients ping every few seconds; silence means the device is gone
    let _ = reader
        .get_ref()
        .set_read_timeout(Some(Duration::from_secs(40)));
    let client = Arc::new(Client {
        id: app.next_id.fetch_add(1, Ordering::SeqCst),
        writer: Mutex::new(stream),
        role: Mutex::new(String::from("unknown")),
        authed: AtomicBool::new(false),
        loopback,
        last_request: AtomicU64::new(0),
    });
    lock(&app.clients).push(client.clone());
    app.send_state_to(&client);

    loop {
        match http::ws_read(&mut reader) {
            Ok(WsEvent::Text(t)) => handle_ws_message(&app, &client, &t),
            Ok(WsEvent::Ping(p)) => {
                let frame = http::ws_frame(0xA, &p);
                let _ = lock(&client.writer).write_all(&frame);
            }
            Ok(WsEvent::Close) | Err(_) => break,
        }
    }
    {
        let w = lock(&client.writer);
        let _ = w.shutdown(Shutdown::Both);
    }
    lock(&app.clients).retain(|c| c.id != client.id);
    app.broadcast();
}

fn handle_ws_message(app: &Arc<App>, c: &Client, text: &str) {
    let Ok(msg) = json::parse(text) else { return };
    match msg.get("type").as_str().unwrap_or("") {
        "ping" => {
            let reply = Json::obj()
                .with("type", "pong")
                .with("t0", msg.get("t0").clone())
                .with("now", now_ms());
            send(c, &reply.to_string());
        }
        "hello" => {
            let role = match msg.get("role").as_str() {
                Some("control") => "control",
                Some("display") => "display",
                _ => "unknown",
            };
            *lock(&c.role) = role.to_string();
            app.broadcast();
        }
        "auth" => {
            let ok = app.check_pin(msg.get("pin").as_str().unwrap_or(""));
            if !ok {
                std::thread::sleep(Duration::from_millis(600)); // slows down guessing
            }
            c.authed.store(ok, Ordering::SeqCst);
            send(
                c,
                &Json::obj().with("type", "auth").with("ok", ok).to_string(),
            );
            app.send_state_to(c);
        }
        "action" => {
            // the stage may always talk to the control room – even without the PIN –
            // but only one message per 1.5 s per device
            let kind = msg.get("action").get("type").as_str();
            if kind == Some("request.send") {
                let now = now_ms() as u64;
                if now.saturating_sub(c.last_request.load(Ordering::SeqCst)) < 1500 {
                    send(
                        c,
                        &Json::obj()
                            .with("type", "error")
                            .with("code", "slow")
                            .to_string(),
                    );
                    return;
                }
                c.last_request.store(now, Ordering::SeqCst);
                app.act(msg.get("action"));
                return;
            }
            // confirming talkback ("Verstanden") needs no PIN either; it only marks notes as read
            if kind == Some("talkback.ack") {
                app.act(msg.get("action"));
                return;
            }
            if !app.can_control(c) {
                send(
                    c,
                    &Json::obj()
                        .with("type", "error")
                        .with("code", "auth")
                        .to_string(),
                );
                return;
            }
            app.act(msg.get("action"));
        }
        "setPin" => {
            if !app.can_control(c) {
                send(
                    c,
                    &Json::obj()
                        .with("type", "error")
                        .with("code", "auth")
                        .to_string(),
                );
                return;
            }
            app.set_pin(msg.get("pin").as_str().unwrap_or(""));
            c.authed.store(true, Ordering::SeqCst);
            app.broadcast();
        }
        "setName" | "setPort80" => {
            if !app.can_control(c) {
                send(
                    c,
                    &Json::obj()
                        .with("type", "error")
                        .with("code", "auth")
                        .to_string(),
                );
                return;
            }
            if msg.get("type").as_str() == Some("setName") {
                if !app.set_name(msg.get("name").as_str().unwrap_or("")) {
                    send(
                        c,
                        &Json::obj()
                            .with("type", "error")
                            .with("code", "name")
                            .to_string(),
                    );
                }
            } else {
                let _ = set_port80(app, msg.get("on").truthy());
            }
            app.broadcast();
        }
        _ => {}
    }
}

// ------------------------------------------------------------------ routes

fn http_authorized(app: &App, req: &Request, loopback: bool) -> bool {
    if loopback || !app.pin_required() {
        return true;
    }
    let pin = req
        .header("x-event-timer-pin")
        .map(str::to_string)
        .or_else(|| query_param(&req.query, "pin"));
    pin.map(|p| app.check_pin(&p)).unwrap_or(false)
}

fn is_app_route(path: &str) -> bool {
    matches!(
        path,
        "/" | "/control"
            | "/display"
            | "/agenda"
            | "/plan"
            | "/moderation"
            | "/cues"
            | "/clock"
            | "/uhr"
            | "/index.html"
    ) || path[1..]
        .parse::<u8>()
        // screens /1 … /16 (no leading zeros)
        .map(|n| (1..=16).contains(&n) && !path[1..].starts_with('0'))
        .unwrap_or(false)
        // screens by name: /p/<slug>
        || (path.len() > 3
            && path.starts_with("/p/")
            && path[3..]
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'))
        || (path.len() >= 7
            && (path.starts_with("/timer") || path.starts_with("/timer-"))
            && path
                .trim_start_matches("/timer")
                .trim_start_matches('-')
                .parse::<u8>()
                .map(|n| (1..=8).contains(&n))
                .unwrap_or(false))
}

fn route(app: &App, req: &Request, loopback: bool) -> Response {
    let path = req.path.as_str();
    if req.method == "OPTIONS" {
        return Response::new(204, "text/plain", Vec::new())
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            .header(
                "Access-Control-Allow-Headers",
                "Content-Type, X-Event-Timer-Pin",
            );
    }
    if path.starts_with("/api/companion") {
        if !matches!(req.method.as_str(), "GET" | "POST") {
            return Response::json(405, r#"{"ok":false,"error":"GET or POST required"}"#.into());
        }
        if path != "/api/companion"
            && path != "/api/companion/status"
            && !http_authorized(app, req, loopback)
        {
            return Response::json(
                401,
                r#"{"ok":false,"error":"PIN required (?pin=… or X-Event-Timer-Pin header)"}"#
                    .into(),
            );
        }
        return companion(app, req);
    }
    match (req.method.as_str(), path) {
        ("GET", "/api/status") | ("HEAD", "/api/status") => {
            let body = Json::obj()
                .with("app", APP_ID)
                .with("version", VERSION)
                .with("port", app.port.load(Ordering::SeqCst))
                .with("pid", std::process::id() as i64);
            Response::json(200, body.to_string())
        }
        ("GET", "/api/state") => {
            let now = now_ms();
            let st = lock(&app.state);
            let views = Json::Obj(
                st.timers
                    .iter()
                    .map(|t| (t.id.clone(), timer_view(t, now).to_json()))
                    .collect(),
            );
            let body = Json::obj()
                .with("now", now)
                .with("state", st.to_json())
                .with("views", views)
                .with("agenda", engine::agenda_view(&st, now).to_json(&st));
            Response::json(200, body.to_string())
        }
        ("POST", "/api/action") => {
            if !http_authorized(app, req, loopback) {
                return Response::json(401, r#"{"ok":false,"error":"PIN required"}"#.into());
            }
            match json::parse(&String::from_utf8_lossy(&req.body)) {
                Ok(action) => {
                    let changed = app.act(&action);
                    Response::json(
                        200,
                        Json::obj()
                            .with("ok", true)
                            .with("changed", changed)
                            .to_string(),
                    )
                }
                Err(e) => Response::json(
                    400,
                    Json::obj().with("ok", false).with("error", e).to_string(),
                ),
            }
        }
        ("POST", "/api/shutdown") => {
            if !loopback {
                return Response::text(403, "Local access only");
            }
            app.save_now();
            info!("Event Timer wurde über die Regie beendet.");
            std::thread::spawn(|| {
                std::thread::sleep(Duration::from_millis(200));
                std::process::exit(0);
            });
            Response::json(200, r#"{"ok":true}"#.into())
        }
        ("GET", _) | ("HEAD", _) => {
            let file = if is_app_route(path) {
                "index.html"
            } else {
                path.trim_start_matches('/')
            };
            match assets::get(file) {
                Some((body, mime)) => Response::new(200, mime, body.to_vec()),
                None => Response::text(404, "Not found"),
            }
        }
        _ => Response::text(405, "Method not allowed"),
    }
}

// --------------------------------------------------------------- Companion

fn timer_snapshot(st: &State, t: &engine::Timer, now: i64) -> Json {
    let v = timer_view(t, now);
    let slot = t.id[1..].parse::<i64>().unwrap_or(0);
    let page = engine::dsm_page_for(st, &t.id[1..]);
    let msg = page.as_deref().and_then(|p| st.dsm_message(p));
    Json::obj()
        .with("id", &t.id)
        .with("slot", slot)
        .with("name", &t.name)
        .with("kind", t.kind.as_str())
        .with("mode", v.state)
        .with("state", v.state)
        .with("phase", v.phase)
        .with("remainingMs", v.ms)
        .with("durationMs", t.duration_ms)
        .with(
            "display",
            if t.kind == Kind::Time {
                String::new() // wall clock lives in the browser's time zone
            } else {
                format_ms(v.ms, t.kind == Kind::Countup)
            },
        )
        // the overlay on this timer's DSM ("/N" or the page standing in for it)
        .with("message", msg.map(|m| m.text.as_str()).unwrap_or(""))
        .with("messageVisible", msg.map(|m| m.visible).unwrap_or(false))
}

fn companion(app: &App, req: &Request) -> Response {
    let parts: Vec<&str> = req
        .path
        .trim_start_matches("/api/companion")
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    let ok = |action: &str| -> Response {
        let now = now_ms();
        let st = lock(&app.state);
        let av = engine::agenda_view(&st, now);
        let body = Json::obj()
            .with("ok", true)
            .with("action", action)
            .with("app", APP_ID)
            .with("version", VERSION)
            .with("blackout", st.blackout)
            .with(
                "openRequests",
                st.requests.iter().filter(|r| !r.ack).count(),
            )
            .with(
                "lastRequest",
                st.requests
                    .iter()
                    .rev()
                    .find(|r| !r.ack)
                    .map(|r| format!("{}: {}", r.from, r.text)),
            )
            .with(
                "openTalkback",
                st.talkback.iter().filter(|k| k.ack_at.is_none()).count(),
            )
            .with(
                "timers",
                Json::Arr(st.timers.iter().map(|t| timer_snapshot(&st, t, now)).collect()),
            )
            .with(
                "agenda",
                Json::obj()
                    .with("cursor", st.agenda.cursor)
                    .with("count", st.agenda.items.len())
                    .with(
                        "current",
                        av.current.map(|i| st.agenda.items[i].title.clone()),
                    )
                    .with("next", av.next.map(|i| st.agenda.items[i].title.clone()))
                    .with("driftMs", av.drift)
                    .with("drift", format_ms(-av.drift, false)),
            );
        Response::json(200, body.to_string())
    };
    let err = |status: u16, msg: &str| {
        Response::json(
            status,
            Json::obj().with("ok", false).with("error", msg).to_string(),
        )
    };

    match parts.as_slice() {
        [] | ["status"] => ok("status"),
        ["blackout", mode] => {
            let action = match *mode {
                "on" => Json::obj().with("type", "blackout.set").with("value", true),
                "off" => Json::obj()
                    .with("type", "blackout.set")
                    .with("value", false),
                "toggle" => Json::obj().with("type", "blackout.toggle"),
                _ => return err(404, "Unknown blackout action (on|off|toggle)"),
            };
            app.act(&action);
            ok("blackout")
        }
        ["agenda", cmd, rest @ ..] => {
            let action = match (*cmd, rest) {
                ("next", []) => Json::obj().with("type", "agenda.next"),
                ("prev", []) => Json::obj().with("type", "agenda.prev"),
                ("reset", []) => Json::obj().with("type", "agenda.reset"),
                ("go", [n]) => match n.parse::<i64>() {
                    Ok(n) if n >= 1 => Json::obj().with("type", "agenda.go").with("index", n - 1),
                    _ => return err(400, "Slot number (1…) required"),
                },
                _ => return err(404, "Unknown agenda action (next|prev|reset|go/N)"),
            };
            app.act(&action);
            ok(cmd)
        }
        [timer, cmd, rest @ ..] if timer.starts_with("timer") => {
            let slot = timer.trim_start_matches("timer").trim_start_matches('-');
            let id = match slot.parse::<usize>() {
                Ok(n) if (1..=engine::MAX_TIMERS).contains(&n) => format!("t{}", n),
                _ => return err(404, "Unknown timer"),
            };
            if !lock(&app.state).timers.iter().any(|t| t.id == id) {
                return err(404, &format!("Timer {} is not currently available", slot));
            }
            let value = rest.first().and_then(|v| v.parse::<f64>().ok());
            let base = |t: &str| Json::obj().with("type", t).with("id", id.as_str());
            // overlays go to the screen behind "/N" (since 1.6 they belong to screens, not timers)
            let page = engine::dsm_page_for(&lock(&app.state), &id[1..]).unwrap_or_default();
            let dsm = |t: &str| {
                Json::obj()
                    .with("type", t)
                    .with("pages", Json::Arr(vec![Json::from(page.as_str())]))
            };
            let action = match (*cmd, value) {
                ("start" | "pause" | "toggle" | "reset", _) => base(&format!("timer.{}", cmd)),
                ("status", _) => return ok("status"),
                ("clear-message", _) => dsm("dsm.clear"),
                ("message", _) => {
                    let mut a = dsm("dsm.message")
                        .with("text", query_param(&req.query, "text").unwrap_or_default());
                    if let Some(f) = query_param(&req.query, "flash") {
                        a.set("flash", f == "1" || f == "true");
                    }
                    a
                }
                ("flash", _) => {
                    let cur = lock(&app.state)
                        .dsm_message(&page)
                        .map(|m| m.flash)
                        .unwrap_or(false);
                    dsm("dsm.message").with("flash", !cur)
                }
                ("add" | "subtract", Some(sec)) if sec.is_finite() => {
                    let sign = if *cmd == "subtract" { -1.0 } else { 1.0 };
                    base("timer.adjust")
                        .with("ms", (sec.clamp(0.0, 3600.0) * 1000.0 * sign).round())
                }
                ("preset", Some(min)) if min.is_finite() => {
                    let start = query_param(&req.query, "start")
                        .map(|v| v == "1" || v == "true")
                        .unwrap_or(false);
                    base("timer.set")
                        .with("ms", (min.clamp(0.0, 1440.0) * 60000.0).round())
                        .with("start", start)
                }
                ("add" | "subtract", _) => {
                    return err(400, "A valid number of seconds is required")
                }
                ("preset", _) => return err(400, "A valid number of minutes is required"),
                _ => return err(404, "Unknown Companion action"),
            };
            app.act(&action);
            ok(cmd)
        }
        _ => err(404, "Unknown Companion action"),
    }
}
