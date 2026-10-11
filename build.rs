// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

// Embeds everything under web/ into the binary and, for Windows, the app
// icon plus version details (shown in Explorer and Task Manager).
use std::{env, fs, path::Path};

fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir).expect("web dir").flatten().collect();
    entries.sort_by_key(|e| e.path());
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            walk(&p, base, out);
        } else {
            let rel = p
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let mime = match p.extension().and_then(|x| x.to_str()).unwrap_or("") {
                "html" => "text/html; charset=utf-8",
                "js" => "text/javascript; charset=utf-8",
                "css" => "text/css; charset=utf-8",
                "svg" => "image/svg+xml",
                "png" => "image/png",
                "ico" => "image/x-icon",
                "json" | "webmanifest" => "application/manifest+json",
                "woff2" => "font/woff2",
                _ => "application/octet-stream",
            };
            let abs = fs::canonicalize(&p).unwrap();
            out.push(format!(
                "    ({:?}, include_bytes!({:?}), {:?}),",
                rel,
                abs.to_string_lossy(),
                mime
            ));
        }
    }
}

fn main() {
    windows_resources();
    let web = Path::new("web");
    println!("cargo:rerun-if-changed=web");
    let mut entries = Vec::new();
    walk(web, web, &mut entries);
    let code = format!(
        "pub static ASSETS: &[(&str, &[u8], &str)] = &[\n{}\n];\n",
        entries.join("\n")
    );
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"),
        code,
    )
    .unwrap();
}

// ------------------------------------------------------------ Windows
// A compiled resource file (.res) written by hand – no rc.exe, no crates –
// and handed to the MSVC linker, which accepts .res files directly.

fn le16(v: &mut Vec<u8>, x: u16) {
    v.extend_from_slice(&x.to_le_bytes());
}
fn le32(v: &mut Vec<u8>, x: u32) {
    v.extend_from_slice(&x.to_le_bytes());
}
fn pad4(v: &mut Vec<u8>) {
    while v.len() % 4 != 0 {
        v.push(0);
    }
}
fn utf16z(v: &mut Vec<u8>, s: &str) {
    for c in s.encode_utf16().chain(Some(0)) {
        le16(v, c);
    }
}

/// One entry of a .res file: header (numeric type and name) + data.
fn res_entry(out: &mut Vec<u8>, kind: u16, name: u16, flags: u16, data: &[u8]) {
    le32(out, data.len() as u32);
    le32(out, 32); // header size
    le16(out, 0xFFFF);
    le16(out, kind);
    le16(out, 0xFFFF);
    le16(out, name);
    le32(out, 0); // data version
    le16(out, flags);
    le16(out, if kind == 0 { 0 } else { 0x0409 }); // language: en-US
    le32(out, 0); // version
    le32(out, 0); // characteristics
    out.extend_from_slice(data);
    pad4(out);
}

/// VERSIONINFO node: wLength, wValueLength, wType, key, value, children.
fn ver_node(key: &str, value: &[u8], value_len: u16, text: bool, children: &[Vec<u8>]) -> Vec<u8> {
    let mut v = Vec::new();
    le16(&mut v, 0);
    le16(&mut v, value_len);
    le16(&mut v, u16::from(text));
    utf16z(&mut v, key);
    pad4(&mut v);
    v.extend_from_slice(value);
    for c in children {
        pad4(&mut v);
        v.extend_from_slice(c);
    }
    let len = v.len() as u16;
    v[0..2].copy_from_slice(&len.to_le_bytes());
    v
}

fn ver_string(key: &str, value: &str) -> Vec<u8> {
    let mut val = Vec::new();
    utf16z(&mut val, value);
    ver_node(key, &val, (val.len() / 2) as u16, true, &[])
}

fn version_info() -> Vec<u8> {
    let version = env::var("CARGO_PKG_VERSION").unwrap();
    let n: Vec<u32> = version
        .split(|c: char| !c.is_ascii_digit())
        .take(3)
        .map(|x| x.parse().unwrap_or(0))
        .collect();
    let (ma, mi, pa) = (
        n[0],
        n.get(1).copied().unwrap_or(0),
        n.get(2).copied().unwrap_or(0),
    );
    let mut fixed = Vec::new();
    for x in [
        0xFEEF_04BDu32, // signature
        0x0001_0000,    // structure version
        ma << 16 | mi,  // file version
        pa << 16,
        ma << 16 | mi, // product version
        pa << 16,
        0x3F,        // flags mask
        0,           // flags
        0x0004_0004, // VOS_NT_WINDOWS32
        1,           // VFT_APP
        0,
        0,
        0,
    ] {
        le32(&mut fixed, x);
    }
    let strings = [
        ("CompanyName", "Felix Spindler"),
        ("FileDescription", "Event Timer"),
        ("FileVersion", version.as_str()),
        ("InternalName", "event-timer"),
        (
            "LegalCopyright",
            "\u{a9} 2026 Felix Spindler <f-spindler@pm.me> \u{b7} GPL-3.0-or-later",
        ),
        ("OriginalFilename", "event-timer.exe"),
        ("ProductName", "Event Timer"),
        ("ProductVersion", version.as_str()),
    ]
    .iter()
    .map(|(k, v)| ver_string(k, v))
    .collect::<Vec<_>>();
    let table = ver_node("040904b0", &[], 0, true, &strings);
    let string_info = ver_node("StringFileInfo", &[], 0, true, &[table]);
    let mut translation = Vec::new();
    le16(&mut translation, 0x0409);
    le16(&mut translation, 0x04b0);
    let var = ver_node("Translation", &translation, 4, false, &[]);
    let var_info = ver_node("VarFileInfo", &[], 0, true, &[var]);
    ver_node(
        "VS_VERSION_INFO",
        &fixed,
        52,
        false,
        &[string_info, var_info],
    )
}

/// Icon group + one RT_ICON per image of the .ico, plus VERSIONINFO.
pub fn build_res(ico: &[u8]) -> Vec<u8> {
    let rd16 = |o: usize| u16::from_le_bytes([ico[o], ico[o + 1]]);
    let rd32 = |o: usize| u32::from_le_bytes([ico[o], ico[o + 1], ico[o + 2], ico[o + 3]]);
    let count = rd16(4) as usize;
    let mut res = Vec::new();
    res_entry(&mut res, 0, 0, 0, &[]); // marks a 32-bit .res file
    let mut group = Vec::new();
    le16(&mut group, 0);
    le16(&mut group, 1);
    le16(&mut group, count as u16);
    for i in 0..count {
        let e = 6 + 16 * i;
        let (size, offset) = (rd32(e + 8) as usize, rd32(e + 12) as usize);
        let id = (i + 1) as u16;
        res_entry(&mut res, 3, id, 0x1010, &ico[offset..offset + size]); // RT_ICON
        group.extend_from_slice(&ico[e..e + 8]); // width, height, colours, reserved, planes, bits
        le32(&mut group, size as u32);
        le16(&mut group, id);
    }
    res_entry(&mut res, 14, 1, 0x1030, &group); // RT_GROUP_ICON
    res_entry(&mut res, 16, 1, 0x0030, &version_info()); // RT_VERSION
    res
}

fn windows_resources() {
    println!("cargo:rerun-if-changed=packaging/icon/event-timer.ico");
    let windows_msvc = env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    let force = env::var_os("EVENT_TIMER_WRITE_RES").is_some(); // lets the .res be checked off Windows
    if !windows_msvc && !force {
        return;
    }
    let ico = fs::read("packaging/icon/event-timer.ico").expect("packaging/icon/event-timer.ico");
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("event-timer.res");
    fs::write(&out, build_res(&ico)).unwrap();
    if windows_msvc {
        println!("cargo:rustc-link-arg-bins={}", out.display());
    }
}
