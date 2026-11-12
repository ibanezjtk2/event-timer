// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Persistence: the whole show is one JSON file, written atomically.

use crate::engine::State;
use crate::json::{self, Json};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "event-timer-data.json";

#[derive(Clone)]
pub struct ServerCfg {
    pub pin_hash: String,
    pub pin_salt: String,
    /// network name: "<name>.local"
    pub name: String,
    /// also listen on port 80 so addresses need no ":2468"
    pub port80: bool,
}

pub const DEFAULT_NAME: &str = "event-timer";

impl Default for ServerCfg {
    fn default() -> Self {
        ServerCfg {
            pin_hash: String::new(),
            pin_salt: String::new(),
            name: DEFAULT_NAME.into(),
            port80: false,
        }
    }
}

fn writable_dir(dir: &Path) -> bool {
    let probe = dir.join(".event-timer-write-test");
    let ok = fs::File::create(&probe)
        .and_then(|mut f| f.write_all(b"ok"))
        .is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

fn config_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("Event Timer"))
    } else if cfg!(target_os = "macos") {
        home.map(|h| h.join("Library/Application Support/Event Timer"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| home.map(|h| h.join(".config")))
            .map(|p| p.join("event-timer"))
    }
}

/// macOS: inside "Event Timer.app/Contents/MacOS" the data belongs next to the .app,
/// never inside the bundle (that would break its signature and get lost on updates).
fn app_bundle_dir(exe_dir: &Path) -> Option<PathBuf> {
    let contents = exe_dir.parent()?;
    let bundle = contents.parent()?;
    let is_bundle = exe_dir.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app";
    if is_bundle {
        bundle.parent().map(Path::to_path_buf)
    } else {
        None
    }
}

/// Portable first: next to the program if that folder is writable and
/// not a temp/translocated location, otherwise the user's config folder.
pub fn default_path() -> PathBuf {
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .map(|d| app_bundle_dir(&d).unwrap_or(d))
    {
        let s = dir.to_string_lossy().to_lowercase();
        let suspicious =
            s.contains("apptranslocation") || s.contains("/target/") || s.contains("\\target\\");
        if !suspicious && (dir.join(FILE_NAME).exists() || writable_dir(&dir)) {
            return dir.join(FILE_NAME);
        }
    }
    if let Some(dir) = config_dir() {
        if fs::create_dir_all(&dir).is_ok() {
            return dir.join(FILE_NAME);
        }
    }
    PathBuf::from(FILE_NAME)
}

/// Loads the show. `Err` means the file exists but cannot be read (locked,
/// no permission): the caller must not start, or the next save would
/// overwrite a show that is still there.
pub fn load(path: &Path) -> Result<(State, ServerCfg, Option<String>), String> {
    let parsed = match fs::read(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((State::default(), ServerCfg::default(), None));
        }
        Err(e) => return Err(format!("{} ({})", e, path.display())),
        // not UTF-8 counts as damaged, like broken JSON
        Ok(bytes) => String::from_utf8(bytes)
            .map_err(|_| "keine gültige UTF-8-Datei".to_string())
            .and_then(|text| json::parse(&text).map_err(|e| e.to_string())),
    };
    Ok(match parsed {
        Ok(j) => {
            let srv = j.get("server");
            let cfg = ServerCfg {
                pin_hash: srv.get("pinHash").as_str().unwrap_or("").to_string(),
                pin_salt: srv.get("pinSalt").as_str().unwrap_or("").to_string(),
                name: srv
                    .get("name")
                    .as_str()
                    .filter(|n| crate::mdns::valid_name(n))
                    .unwrap_or(DEFAULT_NAME)
                    .to_string(),
                port80: srv.get("port80").truthy(),
            };
            (State::from_json(j.get("state")), cfg, None)
        }
        Err(e) => {
            // keep the broken file for inspection instead of overwriting it silently
            let backup = path.with_extension("broken.json");
            if let Err(ce) = fs::copy(path, &backup) {
                return Err(format!(
                    "{} ({}); Sicherung nach {} fehlgeschlagen: {}",
                    e,
                    path.display(),
                    backup.display(),
                    ce
                ));
            }
            (
                State::default(),
                ServerCfg::default(),
                Some(format!(
                    "{} ({}), Sicherung: {}",
                    e,
                    path.display(),
                    backup.display()
                )),
            )
        }
    })
}

pub fn save(path: &Path, state: &State, cfg: &ServerCfg, version: &str) -> std::io::Result<()> {
    let doc = Json::obj()
        .with("app", "event-timer")
        .with("version", version)
        .with("savedAt", crate::util::now_ms())
        .with("state", state.to_json())
        .with(
            "server",
            Json::obj()
                .with("pinHash", &cfg.pin_hash)
                .with("pinSalt", &cfg.pin_salt)
                .with("name", &cfg.name)
                .with("port80", cfg.port80),
        );
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(doc.to_pretty().as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::{app_bundle_dir, load};
    use std::path::Path;

    #[test]
    fn load_missing_damaged_and_valid() {
        let dir = std::env::temp_dir().join(format!("et-store-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("event-timer-data.json");
        let _ = std::fs::remove_file(&f);
        // missing: a new, empty show
        assert!(matches!(load(&f), Ok((_, _, None))));
        // not UTF-8: reset, but only after a backup exists
        std::fs::write(&f, [0xff, 0xfe, b'{']).unwrap();
        assert!(matches!(load(&f), Ok((_, _, Some(_)))));
        assert!(f.with_extension("broken.json").exists());
        // valid
        std::fs::write(
            &f,
            r#"{"app":"event-timer","state":{},"server":{"name":"saal-a"}}"#,
        )
        .unwrap();
        let (_, cfg, err) = load(&f).unwrap();
        assert!(err.is_none());
        assert_eq!(cfg.name, "saal-a");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn data_next_to_mac_app() {
        assert_eq!(
            app_bundle_dir(Path::new(
                "/Users/felix/Programme/Event Timer.app/Contents/MacOS"
            )),
            Some(Path::new("/Users/felix/Programme").to_path_buf())
        );
        assert_eq!(app_bundle_dir(Path::new("/media/usb/event-timer")), None);
        assert_eq!(app_bundle_dir(Path::new("/x/Contents/MacOS")), None);
    }
}
