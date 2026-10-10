//! Event Timer – Countdown, Redezeit und Ablaufplan für Bühne und Regie.
//! Ein einzelnes Programm ohne Abhängigkeiten; Bedienung im Browser.

mod assets;
mod engine;
mod http;
mod json;
mod mdns;
mod net;
mod server;
mod store;
mod util;

use server::App;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

pub const APP_ID: &str = "event-timer";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_PORT: u16 = 2468;

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
                println!("{VERSION}");
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
        println!("Event Timer {VERSION} läuft bereits auf Port {port} – öffne die Regie.");
        if open {
            net::open_browser(&format!("http://localhost:{port}/control"));
        }
        std::thread::sleep(Duration::from_millis(300));
        return true;
    }
    println!(
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
    let opts = parse_args();
    if handle_existing_instance(opts.port, opts.open) {
        return;
    }

    let data_path = opts.data.clone().unwrap_or_else(store::default_path);
    let (state, cfg, load_error) = store::load(&data_path);
    let app = Arc::new(App::new(state, cfg, data_path, opts.host.clone()));
    if let Some(e) = load_error {
        eprintln!("Achtung: Speicherdatei war beschädigt und wurde zurückgesetzt: {e}");
    }
    if let Some(pin) = &opts.pin {
        app.set_pin(pin);
    }
    if let Some(name) = &opts.name {
        if !app.set_name(name) {
            eprintln!(
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
                eprintln!("Port {port} ist nicht verfügbar: {e}");
                std::thread::sleep(Duration::from_secs(5));
                std::process::exit(1);
            }
            Err(_) => {}
        }
    }
    let listener = listener.expect("listener");
    let port = app.port.load(Ordering::SeqCst);

    // persistence: debounced writes in the background
    {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(400));
            if app.dirty.swap(false, Ordering::SeqCst) {
                app.save_now();
            }
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
    app.dirty.store(true, Ordering::SeqCst);

    // short addresses: <name>.local via mDNS, optionally without port (80)
    let mdns_ok = mdns::spawn(app.clone());
    app.mdns_ok.store(mdns_ok, Ordering::SeqCst);
    let want80 = opts
        .port80
        .unwrap_or_else(|| app.cfg.lock().unwrap_or_else(|e| e.into_inner()).port80);
    if want80 {
        if let Err(e) = server::set_port80(&app, true) {
            eprintln!("  {e}");
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
                eprintln!("Verbindungsfehler: {e}");
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

fn print_banner(app: &App, port: u16, wanted: u16) {
    let line = "─".repeat(52);
    println!("\n{line}");
    println!("  Event Timer {VERSION}");
    println!("{line}");
    if port != wanted {
        println!("  Port {wanted} ist belegt – weiche aus auf {port}.");
    }
    println!("  Auf diesem Rechner:  http://localhost:{port}/control");
    let net = app.net.lock().unwrap_or_else(|e| e.into_inner());
    for a in &net.addresses {
        println!("  Im Netzwerk:         http://{a}:{port}/control");
    }
    if let Some(h) = &net.hostname {
        println!("  Per Name:            http://{h}:{port}/control");
    }
    if net.addresses.is_empty() {
        println!("  (Kein Netzwerk gefunden – nur lokal erreichbar.)");
    }
    drop(net);
    if app.mdns_ok.load(Ordering::SeqCst) {
        let host = format!("{}.local", app.mdns_name());
        let base = if app.port80_active() {
            format!("http://{host}")
        } else {
            format!("http://{host}:{port}")
        };
        println!("\n  Kurz:                {base}/control");
        println!("  DSM:                 {base}/1 … /8   ·   {base}/uhr   ·   {base}/moderation");
    } else {
        println!("\n  DSM:                 /1 … /8  ·  /uhr  ·  /moderation");
    }
    println!("  Daten:               {}", app.data_path.display());
    if app.pin_required() {
        println!("  Regie ist per PIN geschützt.");
    }
    println!("\n  Beenden mit Strg+C oder Fenster schließen.\n");
}
