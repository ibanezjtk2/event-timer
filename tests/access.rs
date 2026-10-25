// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! End-to-end checks of the access rules against the real program:
//! foreign websites must not control the show, PIN guessing is locked out,
//! Companion-style requests keep working.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

struct Server {
    child: Child,
    port: u16,
    dir: std::path::PathBuf,
}

impl Server {
    fn start(pin: Option<&str>) -> Server {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let dir = std::env::temp_dir().join(format!("event-timer-test-{port}"));
        std::fs::create_dir_all(&dir).unwrap();
        let mut cmd = Command::new(env!("CARGO_BIN_EXE_event-timer"));
        cmd.args(["--port", &port.to_string(), "--host", "127.0.0.1"])
            .args(["--no-browser", "--no-port80"])
            .arg("--data")
            .arg(dir.join("data.json"))
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(pin) = pin {
            cmd.args(["--pin", pin]);
        }
        let child = cmd.spawn().expect("start event-timer");
        let s = Server { child, port, dir };
        let t0 = Instant::now();
        while s
            .raw("GET /api/status HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .0
            != 200
        {
            assert!(
                t0.elapsed() < Duration::from_secs(10),
                "server did not start"
            );
            std::thread::sleep(Duration::from_millis(50));
        }
        s
    }

    /// Sends a raw request; returns status code and the whole response.
    fn raw(&self, req: &str) -> (u16, String) {
        let Ok(mut s) = TcpStream::connect(("127.0.0.1", self.port)) else {
            return (0, String::new());
        };
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s.write_all(req.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        let code = out
            .split_whitespace()
            .nth(1)
            .and_then(|c| c.parse().ok())
            .unwrap_or(0);
        (code, out)
    }

    /// POST /api/action with extra header lines (each ending in \r\n).
    fn action(&self, host: &str, extra: &str) -> u16 {
        let body = r#"{"type":"blackout.toggle"}"#;
        self.raw(&format!(
            "POST /api/action HTTP/1.1\r\nHost: {host}\r\n{extra}Content-Type: text/plain\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ))
        .0
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn foreign_websites_cannot_control_the_show() {
    let s = Server::start(None);
    let host = format!("localhost:{}", s.port);

    // Companion / curl and the program's own pages
    assert_eq!(s.action(&host, ""), 200);
    assert_eq!(s.action(&host, "Sec-Fetch-Site: same-origin\r\n"), 200);
    assert_eq!(s.action(&host, &format!("Origin: http://{host}\r\n")), 200);

    // a page on another site, in a current and in an older browser
    assert_eq!(s.action(&host, "Sec-Fetch-Site: cross-site\r\n"), 403);
    assert_eq!(s.action(&host, "Origin: https://evil.example\r\n"), 403);

    // Companion GET action triggered by an <img> on a foreign page
    let (code, _) = s.raw(&format!(
        "GET /api/companion/blackout HTTP/1.1\r\nHost: {host}\r\nSec-Fetch-Site: cross-site\r\n\r\n"
    ));
    assert_eq!(code, 403);

    // reading stays open, with CORS
    let (code, resp) = s.raw(&format!(
        "GET /api/status HTTP/1.1\r\nHost: {host}\r\nSec-Fetch-Site: cross-site\r\nOrigin: https://dash.example\r\n\r\n"
    ));
    assert_eq!(code, 200);
    assert!(resp.contains("Access-Control-Allow-Origin: *"));

    // no CORS on responses that change something
    let body = r#"{"type":"blackout.toggle"}"#;
    let (_, resp) = s.raw(&format!(
        "POST /api/action HTTP/1.1\r\nHost: {host}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    ));
    assert!(!resp.contains("Access-Control-Allow-Origin"));

    // WebSocket from a foreign page
    let ws = |origin: &str| {
        s.raw(&format!(
            "GET /ws HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
             Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: {origin}\r\n\r\n"
        ))
        .0
    };
    assert_eq!(ws("https://evil.example"), 403);

    // shutting down from a foreign page
    let (code, _) = s.raw(&format!(
        "POST /api/shutdown HTTP/1.1\r\nHost: {host}\r\nOrigin: https://evil.example\r\nContent-Length: 0\r\n\r\n"
    ));
    assert_eq!(code, 403);
    assert_eq!(
        s.raw("GET /api/status HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .0,
        200
    );
}

#[test]
fn local_privilege_needs_a_local_host_name() {
    let s = Server::start(Some("1234"));
    // this computer, by its local name: no PIN needed
    assert_eq!(s.action(&format!("localhost:{}", s.port), ""), 200);
    assert_eq!(s.action(&format!("127.0.0.1:{}", s.port), ""), 200);
    // DNS rebinding: same connection, but a foreign host name → PIN rules apply
    assert_eq!(s.action("evil.example", ""), 401);
    assert_eq!(s.action("evil.example", "X-Event-Timer-Pin: 1234\r\n"), 200);
}

#[test]
fn pin_guessing_is_locked_out() {
    let s = Server::start(Some("1234"));
    // a foreign host name stands in for another device: no local privilege
    for _ in 0..5 {
        assert_eq!(s.action("evil.example", "X-Event-Timer-Pin: 0000\r\n"), 401);
    }
    // locked now, even with the right PIN
    assert_eq!(s.action("evil.example", "X-Event-Timer-Pin: 1234\r\n"), 401);
    // the computer itself is not affected
    assert_eq!(s.action(&format!("localhost:{}", s.port), ""), 200);
}
