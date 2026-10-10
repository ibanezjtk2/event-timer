//! Application server: routing, WebSocket sessions, PIN, Companion API.

use crate::engine::{self, format_ms, timer_view, Kind, State};
use crate::http::{self, Request, Response, WsEvent};
use crate::json::{self, Json};
use crate::store::{self, ServerCfg};
use crate::util::{hex, now_ms, query_param, salt, sha1};
use crate::{assets, net, APP_ID, VERSION};
use std::io::{BufReader, Write};
use std::net::{Shutdown, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

pub struct Client {
    id: u64,
    writer: Mutex<TcpStream>,
    role: Mutex<String>,
    authed: AtomicBool,
    loopback: bool,
}

pub struct NetInfo {
    pub addresses: Vec<String>,
    pub hostname: Option<String>,
}

pub struct App {
    pub state: Mutex<State>,
    pub cfg: Mutex<ServerCfg>,
    clients: Mutex<Vec<Arc<Client>>>,
    pub dirty: AtomicBool,
    pub port: AtomicU16,
    pub data_path: PathBuf,
    next_id: AtomicU64,
    pub net: Mutex<NetInfo>,
}

/// Poisoned locks are recovered – one panicking connection must never stop the show.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl App {
    pub fn new(state: State, cfg: ServerCfg, data_path: PathBuf) -> App {
        App {
            state: Mutex::new(state),
            cfg: Mutex::new(cfg),
            clients: Mutex::new(Vec::new()),
            dirty: AtomicBool::new(false),
            port: AtomicU16::new(0),
            data_path,
            next_id: AtomicU64::new(1),
            net: Mutex::new(NetInfo {
                addresses: net::lan_addresses(),
                hostname: net::local_hostname(),
            }),
        }
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
        self.dirty.store(true, Ordering::SeqCst);
    }

    pub fn save_now(&self) {
        let st = lock(&self.state).clone();
        let cfg = lock(&self.cfg).clone();
        if let Err(e) = store::save(&self.data_path, &st, &cfg, VERSION) {
            eprintln!(
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
            self.dirty.store(true, Ordering::SeqCst);
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
            ",\"you\":{{\"canControl\":{}}}}}",
            self.can_control(c)
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

fn handle_ws_message(app: &App, c: &Client, text: &str) {
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
        "/" | "/control" | "/display" | "/agenda" | "/index.html"
    ) || (path.len() >= 7
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

fn timer_snapshot(t: &engine::Timer, now: i64) -> Json {
    let v = timer_view(t, now);
    let slot = t.id[1..].parse::<i64>().unwrap_or(0);
    Json::obj()
        .with("id", &t.id)
        .with("slot", slot)
        .with("name", &t.name)
        .with(
            "kind",
            match t.kind {
                Kind::Countdown => "countdown",
                Kind::Countup => "countup",
                Kind::Clock => "clock",
            },
        )
        .with("mode", v.state)
        .with("state", v.state)
        .with("phase", v.phase)
        .with("remainingMs", v.ms)
        .with("durationMs", t.duration_ms)
        .with("display", format_ms(v.ms, t.kind == Kind::Countup))
        .with("message", &t.message.text)
        .with("messageVisible", t.message.visible)
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
                "timers",
                Json::Arr(st.timers.iter().map(|t| timer_snapshot(t, now)).collect()),
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
            let action = match (*cmd, value) {
                ("start" | "pause" | "toggle" | "reset", _) => base(&format!("timer.{}", cmd)),
                ("status", _) => return ok("status"),
                ("clear-message", _) => base("timer.messageClear"),
                ("message", _) => {
                    let mut a = base("timer.message")
                        .with("text", query_param(&req.query, "text").unwrap_or_default());
                    if let Some(f) = query_param(&req.query, "flash") {
                        a.set("flash", f == "1" || f == "true");
                    }
                    a
                }
                ("flash", _) => {
                    let cur = lock(&app.state)
                        .timers
                        .iter()
                        .find(|t| t.id == id)
                        .map(|t| t.message.flash)
                        .unwrap_or(false);
                    base("timer.message").with("flash", !cur)
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
