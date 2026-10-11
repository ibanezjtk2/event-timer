// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! Log: everything the console shows also goes to `event-timer.log` next to
//! the data file – on Windows there is no console window any more, so this
//! file is where start-up information and errors can be found.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static FILE: Mutex<Option<File>> = Mutex::new(None);
static PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
const MAX_BYTES: u64 = 1_000_000;

pub fn init(data_path: &Path) {
    let path = data_path.with_file_name("event-timer.log");
    // keep it small: one previous generation is enough to look back
    if fs::metadata(&path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, path.with_extension("log.old"));
    }
    if let Ok(f) = OpenOptions::new().create(true).append(true).open(&path) {
        *FILE.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
        *PATH.lock().unwrap_or_else(|e| e.into_inner()) = Some(path);
    }
}

pub fn path() -> Option<PathBuf> {
    PATH.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn write(text: &str, error: bool) {
    if error {
        eprintln!("{text}");
    } else {
        println!("{text}");
    }
    let mut guard = FILE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(f) = guard.as_mut() {
        let stamp = timestamp(crate::util::now_ms());
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            let _ = writeln!(
                f,
                "{stamp} {}{}",
                if error { "FEHLER " } else { "" },
                line.trim_end()
            );
        }
        let _ = f.flush();
    }
}

/// "2026-10-11 09:41:07 UTC" without any date crate.
fn timestamp(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02} UTC",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

macro_rules! info {
    ($($t:tt)*) => { $crate::logx::write(&format!($($t)*), false) };
}
macro_rules! error {
    ($($t:tt)*) => { $crate::logx::write(&format!($($t)*), true) };
}
pub(crate) use {error, info};

#[cfg(test)]
mod tests {
    #[test]
    fn timestamps() {
        assert_eq!(super::timestamp(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(
            super::timestamp(1_791_660_000_000),
            "2026-10-10 19:20:00 UTC"
        );
    }
}
