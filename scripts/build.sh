#!/usr/bin/env bash
# One command for everything: format check, lint, tests, release build.
#   scripts/build.sh            check + build for this machine → dist/
#   scripts/build.sh --check    only checks and tests, no release build
#   scripts/build.sh --clean    cargo clean first
set -euo pipefail
cd "$(dirname "$0")/.."

log() { printf '%s INF [build] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*"; }
fail() { printf '%s ERR [build] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*" >&2; exit 1; }

check_only=0
for a in "$@"; do
  case "$a" in
    --check) check_only=1 ;;
    --clean) log "cargo clean"; cargo clean ;;
    *) fail "unbekannte Option: $a (erlaubt: --check, --clean)" ;;
  esac
done

command -v cargo >/dev/null || fail "cargo fehlt – Rust installieren: https://rustup.rs"
command -v node >/dev/null || fail "node fehlt – Node.js 22 installieren"

V=$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2)
log "Event Timer $V ($(git rev-parse --short HEAD 2>/dev/null || echo ohne-git))"

log "Format";        cargo fmt --check
log "Clippy";        cargo clippy --all-targets --locked -- -D warnings
log "JS-Syntax";     for f in web/js/*.js scripts/*.js tests/*.js; do node --check "$f"; done
log "Rust-Tests";    cargo test --locked --quiet
log "JS-Engine";     node tests/engine.test.js

[ "$check_only" = 1 ] && { log "Checks grün"; exit 0; }

log "Release-Build"; cargo build --release --locked
mkdir -p dist
exe=target/release/event-timer
[ -f "$exe.exe" ] && exe="$exe.exe"
os=$(uname -s | tr '[:upper:]' '[:lower:]'); arch=$(uname -m)
out="dist/event-timer-$V-$os-$arch${exe##*event-timer}"
cp "$exe" "$out"
log "Standalone";    node scripts/build-standalone.js
mv dist/event-timer-standalone.html "dist/event-timer-$V-standalone.html"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
(cd dist && sha "$(basename "$out")" "event-timer-$V-standalone.html" > SHA256SUMS.txt)
log "fertig: $out"
