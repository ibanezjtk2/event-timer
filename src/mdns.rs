//! Minimal mDNS responder (RFC 6762), so devices can open
//! http://event-timer.local instead of typing an IP address.
//! Answers A queries for "<name>.local" with the LAN address that sits in
//! the asker's subnet. No crates: the socket needs SO_REUSEADDR/REUSEPORT
//! (the OS's own Bonjour/mDNS service already owns port 5353), which std
//! cannot set, so it is created through a few lines of FFI.

use crate::server::App;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::{Duration, Instant};

const GROUP: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 251);
const PORT: u16 = 5353;

/// Lowercase letters, digits and dashes; 1–40 chars; no dash at the ends.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 40
        && !name.starts_with('-')
        && !name.ends_with('-')
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Starts the responder thread. Returns false if port 5353 could not be opened.
pub fn spawn(app: Arc<App>) -> bool {
    let sock = match sys::bind_reuse(PORT) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("  Netzwerkname nicht verfügbar (mDNS-Port 5353: {e}).");
            return false;
        }
    };
    let _ = sock.set_multicast_loop_v4(true);
    let _ = sock.set_multicast_ttl_v4(255);
    let _ = sock.set_read_timeout(Some(Duration::from_millis(1000)));
    std::thread::spawn(move || run(app, sock));
    true
}

fn join_all(sock: &UdpSocket, addrs: &[Ipv4Addr]) {
    let _ = sock.join_multicast_v4(&GROUP, &Ipv4Addr::UNSPECIFIED);
    for a in addrs {
        let _ = sock.join_multicast_v4(&GROUP, a); // "already joined" errors are fine
    }
}

fn run(app: Arc<App>, sock: UdpSocket) {
    let mut addrs = app.lan_ipv4();
    let mut name = app.mdns_name();
    join_all(&sock, &addrs);
    let mut announce_left = 3;
    let mut next_announce = Instant::now();
    let mut next_check = Instant::now() + Duration::from_secs(5);
    let mut buf = [0u8; 4096];
    loop {
        if Instant::now() >= next_check {
            next_check = Instant::now() + Duration::from_secs(5);
            let (a, n) = (app.lan_ipv4(), app.mdns_name());
            if a != addrs || n != name {
                if a != addrs {
                    join_all(&sock, &a);
                }
                addrs = a;
                name = n;
                announce_left = 3;
            }
        }
        if announce_left > 0 && Instant::now() >= next_announce {
            if let Some(ip) = addrs.first() {
                let pkt = response(&name, *ip, 0, None, 120, true);
                let _ = sock.send_to(&pkt, (GROUP, PORT));
            }
            announce_left -= 1;
            next_announce = Instant::now() + Duration::from_secs(1);
        }
        match sock.recv_from(&mut buf) {
            Ok((n, src)) => handle(&sock, &buf[..n], src, &name, &addrs),
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) => {}
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

fn u16_at(p: &[u8], i: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*p.get(i)?, *p.get(i + 1)?]))
}

/// Reads a (possibly compressed) DNS name; returns it lowercase plus the position after it.
fn read_name(p: &[u8], mut pos: usize) -> Option<(String, usize)> {
    let mut labels: Vec<String> = Vec::new();
    let mut end = None;
    for _ in 0..64 {
        let len = *p.get(pos)? as usize;
        if len == 0 {
            return Some((labels.join("."), end.unwrap_or(pos + 1)));
        }
        if len & 0xC0 == 0xC0 {
            let ptr = ((len & 0x3F) << 8) | *p.get(pos + 1)? as usize;
            end.get_or_insert(pos + 2);
            pos = ptr;
            continue;
        }
        let label = p.get(pos + 1..pos + 1 + len)?;
        labels.push(String::from_utf8_lossy(label).to_ascii_lowercase());
        pos += 1 + len;
    }
    None
}

fn write_name(out: &mut Vec<u8>, name: &str) {
    for label in name.split('.').filter(|l| !l.is_empty()) {
        out.push(label.len() as u8);
        out.extend_from_slice(label.as_bytes());
    }
    out.push(0);
}

/// A-record answer. `question` = Some(id) builds a legacy unicast reply that
/// echoes the question (for simple resolvers that don't speak mDNS proper).
fn response(
    name: &str,
    ip: Ipv4Addr,
    id: u16,
    question: Option<()>,
    ttl: u32,
    cache_flush: bool,
) -> Vec<u8> {
    let fqdn = format!("{}.local", name);
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&id.to_be_bytes());
    out.extend_from_slice(&0x8400u16.to_be_bytes()); // response, authoritative
    out.extend_from_slice(&(question.is_some() as u16).to_be_bytes());
    out.extend_from_slice(&1u16.to_be_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    if question.is_some() {
        write_name(&mut out, &fqdn);
        out.extend_from_slice(&[0, 1, 0, 1]);
    }
    write_name(&mut out, &fqdn);
    out.extend_from_slice(&1u16.to_be_bytes()); // A
    out.extend_from_slice(&(if cache_flush { 0x8001u16 } else { 1 }).to_be_bytes());
    out.extend_from_slice(&ttl.to_be_bytes());
    out.extend_from_slice(&4u16.to_be_bytes());
    out.extend_from_slice(&ip.octets());
    out
}

/// The address in the asker's subnet (best guess without netmasks).
fn pick_ip(src: &SocketAddr, addrs: &[Ipv4Addr]) -> Option<Ipv4Addr> {
    if let IpAddr::V4(s) = src.ip() {
        let so = s.octets();
        for prefix in [3usize, 2, 1] {
            if let Some(a) = addrs.iter().find(|a| a.octets()[..prefix] == so[..prefix]) {
                return Some(*a);
            }
        }
    }
    addrs.first().copied()
}

fn handle(sock: &UdpSocket, p: &[u8], src: SocketAddr, name: &str, addrs: &[Ipv4Addr]) {
    let (Some(id), Some(flags), Some(qd)) = (u16_at(p, 0), u16_at(p, 2), u16_at(p, 4)) else {
        return;
    };
    if flags & 0x8000 != 0 || qd == 0 {
        return; // a response, not a question
    }
    let fqdn = format!("{}.local", name);
    let mut pos = 12;
    let mut wanted = false;
    let mut unicast = false;
    for _ in 0..qd.min(32) {
        let Some((qname, after)) = read_name(p, pos) else {
            return;
        };
        let (Some(qtype), Some(qclass)) = (u16_at(p, after), u16_at(p, after + 2)) else {
            return;
        };
        pos = after + 4;
        if qname == fqdn
            && (qtype == 1 || qtype == 255)
            && (qclass & 0x7FFF == 1 || qclass & 0x7FFF == 255)
        {
            wanted = true;
            unicast |= qclass & 0x8000 != 0;
        }
    }
    if !wanted {
        return;
    }
    let Some(ip) = pick_ip(&src, addrs) else {
        return;
    };
    if src.port() != PORT {
        // legacy one-shot resolver: answer directly with its query id
        let _ = sock.send_to(&response(name, ip, id, Some(()), 10, false), src);
        return;
    }
    let pkt = response(name, ip, 0, None, 120, true);
    if unicast {
        let _ = sock.send_to(&pkt, src);
    }
    let _ = sock.send_to(&pkt, (GROUP, PORT));
}

// ------------------------------------------------------------------ sockets

#[cfg(unix)]
mod sys {
    use std::io;
    use std::net::UdpSocket;
    use std::os::raw::{c_int, c_void};
    use std::os::unix::io::FromRawFd;

    extern "C" {
        fn socket(domain: c_int, ty: c_int, protocol: c_int) -> c_int;
        fn setsockopt(
            fd: c_int,
            level: c_int,
            name: c_int,
            value: *const c_void,
            len: u32,
        ) -> c_int;
        fn bind(fd: c_int, addr: *const c_void, len: u32) -> c_int;
        fn close(fd: c_int) -> c_int;
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    mod c {
        pub const SOL_SOCKET: i32 = 1;
        pub const REUSE: &[i32] = &[2]; // SO_REUSEADDR (REUSEPORT would demand the same uid as avahi)
        #[repr(C)]
        pub struct SockAddrIn {
            pub family: u16,
            pub port: u16,
            pub addr: u32,
            pub zero: [u8; 8],
        }
        pub fn addr(port: u16) -> SockAddrIn {
            SockAddrIn {
                family: 2,
                port: port.to_be(),
                addr: 0,
                zero: [0; 8],
            }
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    mod c {
        pub const SOL_SOCKET: i32 = 0xffff;
        pub const REUSE: &[i32] = &[0x4, 0x200]; // SO_REUSEADDR, SO_REUSEPORT (like mDNSResponder)
        #[repr(C)]
        pub struct SockAddrIn {
            pub len: u8,
            pub family: u8,
            pub port: u16,
            pub addr: u32,
            pub zero: [u8; 8],
        }
        pub fn addr(port: u16) -> SockAddrIn {
            SockAddrIn {
                len: 16,
                family: 2,
                port: port.to_be(),
                addr: 0,
                zero: [0; 8],
            }
        }
    }

    pub fn bind_reuse(port: u16) -> io::Result<UdpSocket> {
        // SAFETY: plain BSD socket calls; the fd is closed on every error path
        // and handed to UdpSocket (which owns it) on success.
        unsafe {
            let fd = socket(2, 2, 0); // AF_INET, SOCK_DGRAM
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            let one: c_int = 1;
            for &opt in c::REUSE {
                setsockopt(
                    fd,
                    c::SOL_SOCKET,
                    opt,
                    &one as *const c_int as *const c_void,
                    4,
                );
            }
            let sa = c::addr(port);
            if bind(
                fd,
                &sa as *const c::SockAddrIn as *const c_void,
                std::mem::size_of::<c::SockAddrIn>() as u32,
            ) != 0
            {
                let e = io::Error::last_os_error();
                close(fd);
                return Err(e);
            }
            Ok(UdpSocket::from_raw_fd(fd))
        }
    }
}

#[cfg(windows)]
mod sys {
    use std::io;
    use std::net::UdpSocket;
    use std::os::windows::io::FromRawSocket;

    #[link(name = "ws2_32")]
    extern "system" {
        fn socket(af: i32, ty: i32, protocol: i32) -> usize;
        fn setsockopt(s: usize, level: i32, name: i32, value: *const u8, len: i32) -> i32;
        fn bind(s: usize, addr: *const u8, len: i32) -> i32;
        fn closesocket(s: usize) -> i32;
    }

    #[repr(C)]
    struct SockAddrIn {
        family: u16,
        port: u16,
        addr: u32,
        zero: [u8; 8],
    }

    pub fn bind_reuse(port: u16) -> io::Result<UdpSocket> {
        // std initialises Winsock (WSAStartup) on first use; make sure that happened.
        drop(UdpSocket::bind("127.0.0.1:0"));
        // SAFETY: plain Winsock calls; the socket is closed on every error path
        // and handed to UdpSocket (which owns it) on success.
        unsafe {
            let s = socket(2, 2, 17); // AF_INET, SOCK_DGRAM, IPPROTO_UDP
            if s == usize::MAX {
                return Err(io::Error::last_os_error());
            }
            let one: i32 = 1;
            setsockopt(s, 0xffff, 4, &one as *const i32 as *const u8, 4); // SOL_SOCKET, SO_REUSEADDR
            let sa = SockAddrIn {
                family: 2,
                port: port.to_be(),
                addr: 0,
                zero: [0; 8],
            };
            if bind(
                s,
                &sa as *const SockAddrIn as *const u8,
                std::mem::size_of::<SockAddrIn>() as i32,
            ) != 0
            {
                let e = io::Error::last_os_error();
                closesocket(s);
                return Err(e);
            }
            Ok(UdpSocket::from_raw_socket(s as u64))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_packets() {
        assert!(valid_name("event-timer"));
        assert!(valid_name("saal1"));
        assert!(!valid_name("Saal 1"));
        assert!(!valid_name("-x"));
        let pkt = response(
            "event-timer",
            Ipv4Addr::new(192, 168, 1, 20),
            7,
            Some(()),
            10,
            false,
        );
        let (q, after) = read_name(&pkt, 12).unwrap();
        assert_eq!(q, "event-timer.local");
        assert_eq!(&pkt[after..after + 4], &[0, 1, 0, 1]);
        assert_eq!(&pkt[pkt.len() - 4..], &[192, 168, 1, 20]);
        let src: SocketAddr = "10.0.5.9:5353".parse().unwrap();
        let addrs = [Ipv4Addr::new(192, 168, 1, 20), Ipv4Addr::new(10, 0, 5, 2)];
        assert_eq!(pick_ip(&src, &addrs), Some(Ipv4Addr::new(10, 0, 5, 2)));
    }
}
