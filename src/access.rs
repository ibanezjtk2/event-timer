// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Who may do what: cross-site requests, the local-computer privilege,
//! PIN lockout and connection limits.
//!
//! The computer running Event Timer controls the show without a PIN. That
//! privilege must not reach a web page that happens to be open in its
//! browser, so requests a browser marks as coming from another site are
//! refused, and the privilege only holds for a local host name (blocks DNS
//! rebinding). Tools without a browser (Companion, curl) send none of these
//! headers and work as before.

use crate::http::Request;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;

/// Wrong PINs in a row (per device) before the lockout starts.
pub const PIN_MAX_FAILS: u32 = 5;
pub const PIN_LOCK_MS: i64 = 60_000;
/// Open connections at once; well above 16 screens plus a few controls.
pub const MAX_CONNECTIONS: usize = 256;
pub const MAX_CONNECTIONS_PER_IP: usize = 32;

/// True if a browser sent this request on behalf of another site.
pub fn is_cross_site(req: &Request) -> bool {
    if let Some(site) = req.header("sec-fetch-site") {
        // "same-site" covers other ports on the same machine, e.g. a dev server
        return matches!(
            site.to_ascii_lowercase().as_str(),
            "cross-site" | "same-site"
        );
    }
    // older browsers: Origin is sent on POST and on WebSocket handshakes
    match req.header("origin") {
        None => false,
        Some(origin) => {
            let host = origin
                .strip_prefix("http://")
                .or_else(|| origin.strip_prefix("https://"));
            match (host, req.header("host")) {
                (Some(o), Some(h)) => !o.eq_ignore_ascii_case(h),
                _ => true, // "null" or another scheme
            }
        }
    }
}

/// True for host names that can only mean this computer or the local network:
/// IP addresses, localhost, `*.local` and the computer's own name.
pub fn is_local_host(host: Option<&str>, own_name: Option<&str>) -> bool {
    let Some(host) = host else {
        return true; // HTTP/1.0 without Host: not a browser
    };
    let name = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        host.rsplit_once(':').map_or(host, |(n, _)| n)
    };
    let name = name.trim_end_matches('.').to_ascii_lowercase();
    name.parse::<IpAddr>().is_ok()
        || name == "localhost"
        || name.ends_with(".localhost")
        || name.ends_with(".local")
        || own_name.is_some_and(|n| n.eq_ignore_ascii_case(&name))
}

#[derive(Debug, PartialEq)]
pub enum PinCheck {
    Ok,
    Wrong,
    Locked,
}

/// Counts wrong PINs per device and locks it out for a minute after
/// [`PIN_MAX_FAILS`] in a row.
#[derive(Default)]
pub struct PinGuard {
    fails: Mutex<HashMap<IpAddr, (u32, i64)>>,
}

impl PinGuard {
    pub fn check(&self, ip: IpAddr, now: i64, verify: impl FnOnce() -> bool) -> PinCheck {
        let mut fails = self.fails.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(&(n, until)) = fails.get(&ip) {
            if n >= PIN_MAX_FAILS {
                if now < until {
                    return PinCheck::Locked;
                }
                fails.remove(&ip);
            }
        }
        if verify() {
            fails.remove(&ip);
            return PinCheck::Ok;
        }
        let entry = fails.entry(ip).or_insert((0, 0));
        entry.0 += 1;
        if entry.0 >= PIN_MAX_FAILS {
            entry.1 = now + PIN_LOCK_MS;
        }
        PinCheck::Wrong
    }
}

/// Open connections, total and per device.
#[derive(Default)]
pub struct ConnLimit {
    open: Mutex<(usize, HashMap<IpAddr, usize>)>,
}

impl ConnLimit {
    /// Reserves a slot; false if this device or the server is at its limit.
    pub fn acquire(&self, ip: IpAddr) -> bool {
        let mut open = self.open.lock().unwrap_or_else(|e| e.into_inner());
        let (total, per_ip) = &mut *open;
        let n = per_ip.entry(ip).or_insert(0);
        if *total >= MAX_CONNECTIONS || *n >= MAX_CONNECTIONS_PER_IP {
            if *n == 0 {
                per_ip.remove(&ip);
            }
            return false;
        }
        *n += 1;
        *total += 1;
        true
    }

    pub fn release(&self, ip: IpAddr) {
        let mut open = self.open.lock().unwrap_or_else(|e| e.into_inner());
        let (total, per_ip) = &mut *open;
        *total = total.saturating_sub(1);
        if let Some(n) = per_ip.get_mut(&ip) {
            *n -= 1;
            if *n == 0 {
                per_ip.remove(&ip);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(headers: &[(&str, &str)]) -> Request {
        Request {
            method: "POST".into(),
            path: "/api/action".into(),
            query: String::new(),
            headers: headers
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            body: Vec::new(),
        }
    }

    #[test]
    fn cross_site_detection() {
        // Companion, curl: no browser headers
        assert!(!is_cross_site(&req(&[("host", "localhost:2468")])));
        // own pages
        assert!(!is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("sec-fetch-site", "same-origin")
        ])));
        assert!(!is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("origin", "http://localhost:2468")
        ])));
        assert!(!is_cross_site(&req(&[
            ("host", "Event-Timer.local"),
            ("origin", "http://event-timer.local")
        ])));
        // typed into the address bar or a bookmark
        assert!(!is_cross_site(&req(&[("sec-fetch-site", "none")])));
        // foreign pages
        assert!(is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("sec-fetch-site", "cross-site")
        ])));
        assert!(is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("sec-fetch-site", "same-site")
        ])));
        assert!(is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("origin", "https://evil.example")
        ])));
        assert!(is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("origin", "http://localhost:3000")
        ])));
        assert!(is_cross_site(&req(&[
            ("host", "localhost:2468"),
            ("origin", "null")
        ])));
    }

    #[test]
    fn local_host_names() {
        for h in [
            "localhost:2468",
            "127.0.0.1:2468",
            "[::1]:2468",
            "192.168.178.42",
            "event-timer.local",
            "saal1.local:2468",
            "REGIE-PC:2468",
        ] {
            assert!(is_local_host(Some(h), Some("regie-pc")), "{h}");
        }
        assert!(is_local_host(None, None));
        for h in [
            "evil.example:2468",
            "localhost.evil.example",
            "regie-pc.evil.example",
        ] {
            assert!(!is_local_host(Some(h), Some("regie-pc")), "{h}");
        }
    }

    #[test]
    fn pin_lockout() {
        let g = PinGuard::default();
        let ip: IpAddr = "192.168.1.20".parse().unwrap();
        let other: IpAddr = "192.168.1.21".parse().unwrap();
        for _ in 0..PIN_MAX_FAILS {
            assert_eq!(g.check(ip, 0, || false), PinCheck::Wrong);
        }
        // locked even with the right PIN, other devices unaffected
        assert_eq!(g.check(ip, 1_000, || true), PinCheck::Locked);
        assert_eq!(g.check(other, 1_000, || true), PinCheck::Ok);
        // after a minute it opens again
        assert_eq!(g.check(ip, PIN_LOCK_MS, || true), PinCheck::Ok);
        // a correct PIN resets the count
        for _ in 0..PIN_MAX_FAILS - 1 {
            g.check(ip, PIN_LOCK_MS, || false);
        }
        assert_eq!(g.check(ip, PIN_LOCK_MS, || true), PinCheck::Ok);
        assert_eq!(g.check(ip, PIN_LOCK_MS, || false), PinCheck::Wrong);
    }

    #[test]
    fn connection_limits() {
        let l = ConnLimit::default();
        let ip: IpAddr = "10.0.0.5".parse().unwrap();
        for _ in 0..MAX_CONNECTIONS_PER_IP {
            assert!(l.acquire(ip));
        }
        assert!(!l.acquire(ip));
        assert!(l.acquire("10.0.0.6".parse().unwrap()));
        l.release(ip);
        assert!(l.acquire(ip));
    }
}
