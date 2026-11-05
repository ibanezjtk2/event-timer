# CLAUDE.md – Spickzettel für Claude

Event Timer: Countdown, Redezeit und Agenda für Bühne und Regie. Ein Rust-Programm ohne Abhängigkeiten liefert eine Browser-Oberfläche aus. Felix testet und entscheidet, Claude schreibt Code und erledigt Git.

## Befehle
- Prüfen vor jedem Commit: `scripts/build.sh --check` (Format, Clippy `-D warnings`, `node --check`, `cargo test`, `node tests/engine.test.js`)
- Komplett: `scripts/build.sh` → `dist/` (Release-Binary, Standalone-HTML, SHA256SUMS)
- Lokal starten: `cargo run -- --port 2600 --host 127.0.0.1 --data /tmp/et.json --no-browser --no-port80`
- Icons neu: `node scripts/sync-icons.js <phosphor-core>/package` bzw. `node scripts/make-icons.js`

## Aufbau
- `src/` Server: `engine.rs` Logik, `server.rs` Routing/WebSocket/API, `access.rs` PIN und Origin, `store.rs` Speichern
- `web/js/engine.js` ist dieselbe Logik in JS. **Logik immer in beiden Engines ändern** und ein Szenario in `tests/scenarios.json` ergänzen.
- `web/` wird von `build.rs` ins Binary eingebettet. Neue Dateitypen brauchen einen MIME-Eintrag in `build.rs`.
- `scripts/build-standalone.js` baut die Einzeldatei: alles inline, Schriften und Logo als Data-URL.
- Details: `docs/ARCHITECTURE.md`, Entscheidungen: `docs/decisions/`

## Design (Show-UI)
- Farben nur über Variablen aus `web/css/tokens.css`, nie Hex-Werte in Komponenten-CSS oder JS.
- Ziffern in D-DIN und festen Zellen: `ETUI.setCells(node, text)`. Text in IBM Plex Sans, Medium als Standard.
- Icons: `icon('name')`, gefüllt für aktiv: `icon('name', true)`. Namen siehe `scripts/sync-icons.js`.
- Signalfarben: Grün läuft, Gelb Vorwarnung, Rot Kritisch/Überzeit/live, Cyan Auswahl/Fokus/Talkback.
- App-Icon = `web/brand/event-timer-icon.svg` (fs-Kachel mit Restzeit-Ring), daraus `node scripts/make-icons.js`. Schriftzug bleibt „fs Event Timer“.
- Screens (`.dsp`) sind immer dunkel. Theme nur über `data-theme` am `<html>`.

## Sprache und Begriffe
- Oberfläche, Doku und Commits auf Deutsch, neue Bezeichner auf Englisch. EN-Übersetzung in `ui.js` (`EN`).
- Begriffe laut README → Begriffe: Agenda, Programmpunkt, Screen, Einblendung, Talkback, Meldung, Puffer, Zeitkonto.
- Uhrzeiten tragen „Uhr“ („Ende 14:32 Uhr“), Screens bleiben kurz.
- Nie „Foyer-Uhr“ schreiben. Die Seite heißt „Uhr“ (`/uhr`).

## Regeln
- Conventional Commits (`feat(ui): …`), Body erklärt das Warum. Version nur in `Cargo.toml`, CHANGELOG pflegen.
- Kein Force-Push, keine History umschreiben. Arbeit auf Branches, PR gegen `main`.
- Datenformat bleibt kompatibel: alte Show-Dateien müssen laden.
- Neutralität: keine Hinweise auf Arbeitsplatz, Kunden, Räume, interne IPs. Beispiele „Saal A“, IPs aus `192.0.2.0/24`.
- Nie eine echte Show-Datei committen (`event-timer-data.json` ist ignoriert).
- Keine Crates, keine CDNs, keine Web-Fonts aus dem Netz, keine Telemetrie.
- Das Repo bleibt bis 1.0 privat. Release-Builds kommen aus GitHub Actions (PRs bauen nur Linux x64).
