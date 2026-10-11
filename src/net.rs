// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Network helpers without external crates.

use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream, UdpSocket};
use std::process::Command;
use std::time::Duration;

/// LAN IPv4 addresses. std cannot enumerate interfaces, so we ask the
/// routing table which local address it would use for a few targets.
/// Works without internet (isolated show networks) too.
pub fn lan_addresses() -> Vec<String> {
    let probes = [
        "8.8.8.8:80",
        "192.168.0.1:80",
        "192.168.1.1:80",
        "192.168.178.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ];
    let mut out: Vec<String> = Vec::new();
    for p in probes {
        let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else {
            continue;
        };
        if sock.connect(p).is_err() {
            continue;
        }
        if let Ok(SocketAddr::V4(a)) = sock.local_addr() {
            let ip = a.ip();
            if !ip.is_loopback() && !ip.is_unspecified() && !ip.is_link_local() {
                let s = ip.to_string();
                if !out.contains(&s) {
                    out.push(s);
                }
            }
        }
    }
    let rank = |a: &String| {
        if a.starts_with("192.168.") {
            0
        } else if a.starts_with("10.") {
            1
        } else if a.starts_with("172.") {
            2
        } else {
            3
        }
    };
    out.sort_by_key(rank);
    out
}

fn command_output(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() && !s.is_empty() {
        Some(s)
    } else {
        None
    }
}

/// The name this computer answers to via mDNS/Bonjour ("name.local").
pub fn local_hostname() -> Option<String> {
    let raw = if cfg!(target_os = "macos") {
        command_output("scutil", &["--get", "LocalHostName"])
    } else if cfg!(windows) {
        std::env::var("COMPUTERNAME").ok()
    } else {
        std::fs::read_to_string("/etc/hostname")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| command_output("hostname", &[]))
    }?;
    let name = raw.split('.').next()?.to_string();
    let ok = !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if ok {
        Some(format!("{}.local", name.to_ascii_lowercase()))
    } else {
        None
    }
}

pub fn open_browser(url: &str) {
    let _ = if cfg!(windows) {
        Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(url).spawn()
    } else {
        if std::env::var_os("DISPLAY").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_none() {
            return;
        }
        Command::new("xdg-open").arg(url).spawn()
    };
}

/// Minimal HTTP request to localhost, used to detect an already running instance.
pub fn local_request(
    port: u16,
    method: &str,
    path: &str,
    timeout_ms: u64,
) -> Option<(u16, String)> {
    let addr = SocketAddr::new(IpAddr::from([127, 0, 0, 1]), port);
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms)).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(timeout_ms * 2)))
        .ok()?;
    s.set_write_timeout(Some(Duration::from_millis(timeout_ms)))
        .ok()?;
    write!(
        s,
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        method, path
    )
    .ok()?;
    let mut buf = Vec::new();
    let _ = s.take(256 * 1024).read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf).into_owned();
    let status = text.split_whitespace().nth(1)?.parse().ok()?;
    let body = text
        .split_once("\r\n\r\n")
        .map(|(_, b)| b.to_string())
        .unwrap_or_default();
    Some((status, body))
}
