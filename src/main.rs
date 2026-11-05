// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Event Timer – Countdown, Redezeit und Agenda für Bühne und Regie.
//! Ein einzelnes Programm ohne Abhängigkeiten; Bedienung im Browser.

// Windows: no console window – start-up info goes to event-timer.log
// (and to the terminal, if started from one).
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod access;
mod assets;
mod engine;
mod http;
mod json;
mod logx;
mod mdns;
mod net;
mod platform;
mod server;
mod store;
mod util;

use logx::{error, info};
use server::App;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

pub const APP_ID: &str = "event-timer";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Commit the binary was built from (set by build.rs).
pub const COMMIT: &str = env!("ET_COMMIT");
const DEFAULT_PORT: u16 = 2468;
/// Save attempts when the system asks the program to stop (Ctrl+C, logout, kill).
const STOP_SAVE_TRIES: u32 = 3;

struct Options {
    port: u16,
    port_fixed: bool,
    host: String,
    data: Option<PathBuf>,
    open: bool,
    pin: Option<String>,
    name: Option<String>,
    port80: Option<bool>,
}

fn usage() -> ! {
    println!(
        "Event Timer {VERSION}

Aufruf: event-timer [Optionen]

  --port <n>       Wunschport (Standard {DEFAULT_PORT}; belegt → nächster freier)
  --host <ip>      Netzwerkadresse zum Lauschen (Standard 0.0.0.0 = alle)
  --data <datei>   Speicherdatei (Standard: neben dem Programm, sonst Benutzerordner)
  --pin <pin>      Regie-PIN setzen (leer \"\" = PIN entfernen)
  --name <name>    Netzwerkname: http://<name>.local (Standard event-timer)
  --port80         zusätzlich Port 80, Adressen dann ohne :2468 (--no-port80 aus)
  --no-browser     Browser beim Start nicht öffnen
  --version        Version anzeigen

Umgebungsvariablen PORT und HOST werden ebenfalls gelesen."
    );
    std::process::exit(0)
}

fn parse_args() -> Options {
    let mut o = Options {
        port: DEFAULT_PORT,
        port_fixed: false,
        host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
        data: None,
        open: true,
        pin: None,
        name: None,
        port80: None,
    };
    if let Some(p) = std::env::var("PORT").ok().and_then(|p| p.parse().ok()) {
        o.port = p;
    }
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--port" | "-p" => {
                o.port = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| usage());
                o.port_fixed = true;
            }
            "--host" => o.host = args.next().unwrap_or_else(|| usage()),
            "--data" => o.data = args.next().map(PathBuf::from),
            "--pin" => o.pin = Some(args.next().unwrap_or_default()),
            "--no-browser" => o.open = false,
            "--name" => o.name = Some(args.next().unwrap_or_else(|| usage())),
            "--port80" => o.port80 = Some(true),
            "--no-port80" => o.port80 = Some(false),
            "--version" | "-V" => {
                println!("{VERSION}+{COMMIT}");
                std::process::exit(0)
            }
            _ => usage(),
        }
    }
    o
}

/// If an Event Timer already runs on this port: same version → just open
/// it; older/newer version → ask it to shut down so we can take over.
fn handle_existing_instance(port: u16, open: bool) -> bool {
    let Some((200, body)) = net::local_request(port, "GET", "/api/status", 500) else {
        return false;
    };
    let Ok(j) = json::parse(&body) else {
        return false;
    };
    if j.get("app").as_str() != Some(APP_ID) {
        return false;
    }
    if j.get("version").as_str() == Some(VERSION) {
        info!("Event Timer {VERSION} läuft bereits auf Port {port} – öffne die Regie.");
        if open {
            net::open_browser(&format!("http://localhost:{port}/control"));
        }
        std::thread::sleep(Duration::from_millis(300));
        return true;
    }
    info!(
        "Ersetze laufenden Event Timer {} durch {VERSION} …",
        j.get("version").as_str().unwrap_or("?")
    );
    let _ = net::local_request(port, "POST", "/api/shutdown", 1500);
    for _ in 0..30 {
        std::thread::sleep(Duration::from_millis(150));
        if net::local_request(port, "GET", "/api/status", 200).is_none() {
            break;
        }
    }
    false
}

fn main() {
    platform::attach_console();
    let opts = parse_args();
    let data_path = opts.data.clone().unwrap_or_else(store::default_path);
    logx::init(&data_path);
    if handle_existing_instance(opts.port, opts.open) {
        return;
    }
    platform::install_stop_handlers();

    let (state, cfg, load_error) = match store::load(&data_path) {
        Ok(loaded) => loaded,
        Err(e) => {
            let msg = format!(
                "Event Timer kann die Speicherdatei nicht lesen und startet nicht, damit die Show nicht überschrieben wird.\n{e}\nIst die Datei in einem anderen Programm geöffnet?"
            );
            error!("{msg}");
            platform::alert(&msg, true);
            std::process::exit(1);
        }
    };
    let app = Arc::new(App::new(state, cfg, data_path, opts.host.clone()));
    if let Some(e) = load_error {
        let msg = format!("Die Speicherdatei war beschädigt und wurde zurückgesetzt.\n{e}");
        error!("{msg}");
        platform::alert(&msg, false);
    }
    if let Some(pin) = &opts.pin {
        app.set_pin(pin);
    }
    if let Some(name) = &opts.name {
        if !app.set_name(name) {
            error!(
                "Ungültiger Name „{name}“: nur a–z, 0–9 und Bindestrich. Bleibe bei {}.",
                app.mdns_name()
            );
        }
    }

    // bind with automatic fallback so we never fight another program for its port
    let attempts = if opts.port_fixed { 1 } else { 20 };
    let mut listener = None;
    for i in 0..attempts {
        let port = opts.port.saturating_add(i);
        match TcpListener::bind((opts.host.as_str(), port)) {
            Ok(l) => {
                listener = Some(l);
                app.port.store(port, Ordering::SeqCst);
                break;
            }
            Err(e) if i + 1 == attempts => {
                let msg = format!(
                    "Event Timer kann nicht starten: Port {port} ist nicht verfügbar ({e})."
                );
                error!("{msg}");
                platform::alert(&msg, true);
                std::process::exit(1);
            }
            Err(_) => {}
        }
    }
    let listener = listener.expect("listener");
    let port = app.port.load(Ordering::SeqCst);

    // persistence: written once things settle (2 s quiet, at the latest every 10 s);
    // Ctrl+C, logout or `kill` save immediately and end the program cleanly
    {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(100));
            if platform::stop_requested() {
                // the system wants us gone: a few quick retries, then exit with an error
                let saved = (0..STOP_SAVE_TRIES).any(|i| {
                    if i > 0 {
                        std::thread::sleep(Duration::from_millis(500));
                    }
                    app.save_now()
                });
                if saved {
                    info!("Event Timer beendet.");
                    std::process::exit(0);
                }
                error!(
                    "Event Timer beendet, die letzten Änderungen konnten nicht gespeichert werden."
                );
                std::process::exit(1);
            }
            app.save_if_due(util::now_ms());
        });
    }
    // network changes (Wi-Fi switch, cable plugged) → update the shown addresses
    {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(20));
            let addrs = net::lan_addresses();
            let changed = {
                let mut n = app.net.lock().unwrap_or_else(|e| e.into_inner());
                let changed = n.addresses != addrs;
                n.addresses = addrs;
                changed
            };
            if changed {
                app.broadcast();
            }
        });
    }
    app.touch();

    // short addresses: <name>.local via mDNS, optionally without port (80)
    let mdns_ok = mdns::spawn(app.clone());
    app.mdns_ok.store(mdns_ok, Ordering::SeqCst);
    let want80 = opts
        .port80
        .unwrap_or_else(|| app.cfg.lock().unwrap_or_else(|e| e.into_inner()).port80);
    if want80 {
        if let Err(e) = server::set_port80(&app, true) {
            error!("  {e}");
        }
    } else if opts.port80 == Some(false) {
        let _ = server::set_port80(&app, false);
    }

    print_banner(&app, port, opts.port);
    if opts.open {
        net::open_browser(&format!("http://localhost:{port}/control"));
    }

    for stream in listener.incoming() {
        match stream {
            Ok(s) => server::spawn_connection(&app, s),
            Err(e) => {
                error!("Verbindungsfehler: {e}");
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

fn print_banner(app: &App, port: u16, wanted: u16) {
    let line = "─".repeat(52);
    let mut out = vec![
        String::new(),
        line.clone(),
        format!("  Event Timer {VERSION}+{COMMIT}"),
        line,
    ];
    if port != wanted {
        out.push(format!(
            "  Port {wanted} ist belegt – weiche aus auf {port}."
        ));
    }
    out.push(format!(
        "  Auf diesem Rechner:  http://localhost:{port}/control"
    ));
    let net = app.net.lock().unwrap_or_else(|e| e.into_inner());
    for a in &net.addresses {
        out.push(format!("  Im Netzwerk:         http://{a}:{port}/control"));
    }
    if let Some(h) = &net.hostname {
        out.push(format!("  Per Name:            http://{h}:{port}/control"));
    }
    if net.addresses.is_empty() {
        out.push("  (Kein Netzwerk gefunden – nur lokal erreichbar.)".into());
    }
    drop(net);
    if app.mdns_ok.load(Ordering::SeqCst) {
        let host = format!("{}.local", app.mdns_name());
        let base = if app.port80_active() {
            format!("http://{host}")
        } else {
            format!("http://{host}:{port}")
        };
        out.push(String::new());
        out.push(format!("  Kurz:                {base}/control"));
        out.push(format!(
            "  DSM:                 {base}/1 … /8   ·   {base}/uhr   ·   {base}/moderation"
        ));
    } else {
        out.push(String::new());
        out.push("  DSM:                 /1 … /8  ·  /uhr  ·  /moderation".into());
    }
    out.push(format!(
        "  Daten:               {}",
        app.data_path.display()
    ));
    if let Some(p) = logx::path() {
        out.push(format!("  Log:                 {}", p.display()));
    }
    if app.pin_required() {
        out.push("  Regie ist per PIN geschützt.".into());
    }
    out.push(String::new());
    out.push("  Beenden: Regie → Menü → System → „Event Timer beenden“ (oder Strg+C).".into());
    out.push(String::new());
    info!("{}", out.join("\n"));
}
