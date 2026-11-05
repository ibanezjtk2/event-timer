// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Tiny HTTP/1.1 + WebSocket layer on top of std::net (one thread per connection).

use crate::util::{base64, sha1};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::TcpStream;

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
}

const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 1024 * 1024;

/// Reads one line, but never more than `limit` bytes, so a peer that sends
/// no newline cannot make the line grow without bound.
fn read_line_limited<R: BufRead>(
    reader: &mut R,
    buf: &mut String,
    limit: usize,
) -> io::Result<usize> {
    let n = reader.by_ref().take(limit as u64).read_line(buf)?;
    if n >= limit && !buf.ends_with('\n') {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "header too large",
        ));
    }
    Ok(n)
}

pub fn read_request(reader: &mut BufReader<TcpStream>) -> io::Result<Option<Request>> {
    let mut line = String::new();
    let mut total = 0;
    if read_line_limited(reader, &mut line, MAX_HEAD)? == 0 {
        return Ok(None);
    }
    total += line.len();
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("/").to_string();
    let mut headers = Vec::new();
    loop {
        let mut h = String::new();
        let n = read_line_limited(reader, &mut h, MAX_HEAD.saturating_sub(total).max(1))?;
        total += n;
        if n == 0 || total > MAX_HEAD {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "header too large",
            ));
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        }
    }
    let len = headers
        .iter()
        .find(|(k, _)| k == "content-length")
        .and_then(|(_, v)| v.parse::<usize>().ok())
        .unwrap_or(0);
    if len > MAX_BODY {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "body too large"));
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body)?;
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target.clone(), String::new()),
    };
    Ok(Some(Request {
        method,
        path,
        query,
        headers,
        body,
    }))
}

pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
    pub extra: Vec<(&'static str, String)>,
}

impl Response {
    pub fn new(status: u16, content_type: &'static str, body: impl Into<Vec<u8>>) -> Self {
        Response {
            status,
            content_type,
            body: body.into(),
            extra: Vec::new(),
        }
    }
    pub fn json(status: u16, body: String) -> Self {
        Response::new(status, "application/json; charset=utf-8", body)
    }
    pub fn text(status: u16, body: &str) -> Self {
        Response::new(
            status,
            "text/plain; charset=utf-8",
            body.as_bytes().to_vec(),
        )
    }
    pub fn header(mut self, k: &'static str, v: impl Into<String>) -> Self {
        self.extra.push((k, v.into()));
        self
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    }
}

pub fn write_response(stream: &mut TcpStream, r: &Response, head_only: bool) -> io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
        r.status,
        reason(r.status),
        r.content_type,
        r.body.len()
    );
    for (k, v) in &r.extra {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    if !head_only {
        stream.write_all(&r.body)?;
    }
    stream.flush()
}

// ------------------------------------------------------------- WebSocket

pub fn ws_accept(stream: &mut TcpStream, key: &str) -> io::Result<()> {
    let accept = base64(&sha1(
        format!("{}258EAFA5-E914-47DA-95CA-C5AB0DC85B11", key).as_bytes(),
    ));
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()
}

pub fn ws_frame(opcode: u8, payload: &[u8]) -> Vec<u8> {
    let mut f = Vec::with_capacity(payload.len() + 10);
    f.push(0x80 | opcode);
    let n = payload.len();
    if n < 126 {
        f.push(n as u8);
    } else if n < 65536 {
        f.push(126);
        f.extend_from_slice(&(n as u16).to_be_bytes());
    } else {
        f.push(127);
        f.extend_from_slice(&(n as u64).to_be_bytes());
    }
    f.extend_from_slice(payload);
    f
}

pub enum WsEvent {
    Text(String),
    Ping(Vec<u8>),
    Close,
}

const MAX_MESSAGE: usize = 1024 * 1024;

/// Reads the next complete message (handles masking and fragmentation).
pub fn ws_read(reader: &mut impl Read) -> io::Result<WsEvent> {
    let mut message: Vec<u8> = Vec::new();
    let mut message_opcode = 0u8;
    loop {
        let mut head = [0u8; 2];
        reader.read_exact(&mut head)?;
        let fin = head[0] & 0x80 != 0;
        let opcode = head[0] & 0x0f;
        let masked = head[1] & 0x80 != 0;
        let mut len = (head[1] & 0x7f) as u64;
        if len == 126 {
            let mut b = [0u8; 2];
            reader.read_exact(&mut b)?;
            len = u16::from_be_bytes(b) as u64;
        } else if len == 127 {
            let mut b = [0u8; 8];
            reader.read_exact(&mut b)?;
            len = u64::from_be_bytes(b);
        }
        if len as usize > MAX_MESSAGE || message.len() + len as usize > MAX_MESSAGE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "message too large",
            ));
        }
        let mut mask = [0u8; 4];
        if masked {
            reader.read_exact(&mut mask)?;
        }
        let mut payload = vec![0u8; len as usize];
        reader.read_exact(&mut payload)?;
        if masked {
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= mask[i % 4];
            }
        }
        match opcode {
            0x8 => return Ok(WsEvent::Close),
            0x9 => return Ok(WsEvent::Ping(payload)),
            0xA => continue,
            0x0..=0x2 => {
                if opcode != 0 {
                    message_opcode = opcode;
                    message.clear();
                }
                message.extend_from_slice(&payload);
                if fin {
                    if message_opcode == 0x1 {
                        return Ok(WsEvent::Text(
                            String::from_utf8_lossy(&message).into_owned(),
                        ));
                    }
                    message.clear();
                }
            }
            _ => return Err(io::Error::new(io::ErrorKind::InvalidData, "bad opcode")),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn header_line_is_capped() {
        let mut long = std::io::Cursor::new(vec![b'a'; 100_000]);
        let mut buf = String::new();
        assert!(super::read_line_limited(&mut long, &mut buf, 1024).is_err());
        assert!(buf.len() <= 1024);
        let mut ok = std::io::Cursor::new(b"Host: x\r\nrest".to_vec());
        let mut buf = String::new();
        assert_eq!(
            super::read_line_limited(&mut ok, &mut buf, 1024).unwrap(),
            9
        );
    }

    use super::*;

    #[test]
    fn frame_roundtrip_with_mask_and_fragments() {
        // masked "Hel" (not fin) + continuation "lo"
        let mask = [1u8, 2, 3, 4];
        let mut data = vec![0x01, 0x80 | 3];
        data.extend_from_slice(&mask);
        data.extend(b"Hel".iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
        data.extend_from_slice(&[0x80, 0x80 | 2]);
        data.extend_from_slice(&mask);
        data.extend(b"lo".iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
        let mut cur = std::io::Cursor::new(data);
        match ws_read(&mut cur).unwrap() {
            WsEvent::Text(t) => assert_eq!(t, "Hello"),
            _ => panic!(),
        }
        let big = vec![b'x'; 70_000];
        let f = ws_frame(1, &big);
        assert_eq!(f[1], 127);
        match ws_read(&mut std::io::Cursor::new(f)).unwrap() {
            WsEvent::Text(t) => assert_eq!(t.len(), 70_000),
            _ => panic!(),
        }
    }
}
