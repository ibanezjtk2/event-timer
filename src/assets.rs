//! Web UI files, embedded at compile time by build.rs.
include!(concat!(env!("OUT_DIR"), "/assets.rs"));

pub fn get(path: &str) -> Option<(&'static [u8], &'static str)> {
    ASSETS
        .iter()
        .find(|(p, _, _)| *p == path)
        .map(|(_, b, m)| (*b, *m))
}
