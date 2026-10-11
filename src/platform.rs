// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Felix Spindler <f-spindler@pm.me>

//! The few things that differ per operating system: a console when started
//! from a terminal, a visible message for fatal errors (there is no console
//! window on Windows and none in the macOS app), and a clean stop on
//! Ctrl+C / logout / `kill` so the show is saved before the program ends.

use std::sync::atomic::{AtomicBool, Ordering};

/// Set when the operating system asks us to stop; main saves and exits.
pub static STOP: AtomicBool = AtomicBool::new(false);

/// Windows builds have no console window. Started from cmd/PowerShell, we
/// borrow that terminal so the start-up lines and `--version` still appear.
pub fn attach_console() {
    #[cfg(windows)]
    win::attach_console();
}

/// Ctrl+C, closing the terminal, `kill`, logging out → STOP.
pub fn install_stop_handlers() {
    #[cfg(unix)]
    unix::install();
    #[cfg(windows)]
    win::install();
}

/// Shows a message where the user will actually see it. `wait` = block
/// until it is closed (use for fatal errors right before exiting).
pub fn alert(text: &str, wait: bool) {
    let text = text.to_string();
    let show = move || {
        #[cfg(windows)]
        win::message_box(&text);
        #[cfg(target_os = "macos")]
        mac::alert(&text);
        #[cfg(not(any(windows, target_os = "macos")))]
        let _ = text;
    };
    if wait {
        show();
    } else {
        std::thread::spawn(show);
    }
}

pub fn stop_requested() -> bool {
    STOP.load(Ordering::SeqCst)
}

#[cfg(unix)]
mod unix {
    use super::STOP;
    use std::sync::atomic::Ordering;

    extern "C" {
        fn signal(signum: i32, handler: extern "C" fn(i32)) -> usize;
    }
    // only an atomic store here: everything else happens on a normal thread
    extern "C" fn on_signal(_: i32) {
        STOP.store(true, Ordering::SeqCst);
    }
    pub fn install() {
        // SIGHUP = terminal closed, SIGINT = Ctrl+C, SIGTERM = kill / shutdown
        for sig in [1, 2, 15] {
            unsafe {
                signal(sig, on_signal);
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod mac {
    pub fn alert(text: &str) {
        let quoted = text.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("display alert \"Event Timer\" message \"{quoted}\" as warning");
        let _ = std::process::Command::new("osascript")
            .args(["-e", &script])
            .status();
    }
}

#[cfg(windows)]
mod win {
    use super::STOP;
    use std::ffi::c_void;
    use std::sync::atomic::Ordering;

    type Handle = *mut c_void;
    type Bool = i32;
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    const GENERIC_READ_WRITE: u32 = 0xC000_0000;
    const FILE_SHARE_READ_WRITE: u32 = 3;
    const OPEN_EXISTING: u32 = 3;
    const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    const STD_ERROR_HANDLE: u32 = -12i32 as u32;
    const MB_ICONWARNING_SETFOREGROUND: u32 = 0x30 | 0x1_0000;

    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(process: u32) -> Bool;
        fn CreateFileW(
            name: *const u16,
            access: u32,
            share: u32,
            security: *mut c_void,
            disposition: u32,
            flags: u32,
            template: Handle,
        ) -> Handle;
        fn SetStdHandle(which: u32, handle: Handle) -> Bool;
        fn SetConsoleCtrlHandler(
            handler: Option<unsafe extern "system" fn(u32) -> Bool>,
            add: Bool,
        ) -> Bool;
    }
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(owner: Handle, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    pub fn attach_console() {
        unsafe {
            if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
                return; // double-clicked: no terminal, output goes to the log file only
            }
            let name = wide("CONOUT$");
            let h = CreateFileW(
                name.as_ptr(),
                GENERIC_READ_WRITE,
                FILE_SHARE_READ_WRITE,
                std::ptr::null_mut(),
                OPEN_EXISTING,
                0,
                std::ptr::null_mut(),
            );
            if h as isize != -1 && !h.is_null() {
                SetStdHandle(STD_OUTPUT_HANDLE, h);
                SetStdHandle(STD_ERROR_HANDLE, h);
            }
        }
    }

    unsafe extern "system" fn on_ctrl(_kind: u32) -> Bool {
        STOP.store(true, Ordering::SeqCst);
        // give main a moment to save before Windows ends the process
        std::thread::sleep(std::time::Duration::from_millis(1500));
        1
    }

    pub fn install() {
        unsafe {
            SetConsoleCtrlHandler(Some(on_ctrl), 1);
        }
    }

    pub fn message_box(text: &str) {
        let (t, c) = (wide(text), wide("Event Timer"));
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                t.as_ptr(),
                c.as_ptr(),
                MB_ICONWARNING_SETFOREGROUND,
            );
        }
    }
}
