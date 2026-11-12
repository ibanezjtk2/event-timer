# Testen

## Automatisch

```
scripts/build.sh --check     # Format, Clippy, JS-Syntax, Rust-Tests, Engine-Szenarien
```

- `cargo test`: Rust-Engine, JSON-Parser, HTTP/WebSocket, Zugriff
- `node tests/engine.test.js`: dieselben Szenarien aus `tests/scenarios.json` gegen die JS-Engine

## Manuell vor einem Release

Mit dem fertigen Artefakt aus GitHub Actions, auf einem sauberen Rechner (Windows Sandbox, VM oder frischer Benutzer).

### Start
- [ ] Programm startet ohne Installation, Browser öffnet die Regie
- [ ] `--version` zeigt Version und Commit; Menü → System → Über zeigt dasselbe
- [ ] Zweiter Start öffnet nur die vorhandene Instanz
- [ ] Eine Show-Datei aus der Vorversion lädt: Timer, Agenda, Designs, Screens, PIN

### Netz und Geräte
- [ ] Handy im selben WLAN öffnet `http://event-timer.local:2468/1` bzw. den QR-Code
- [ ] PIN: falsche PIN wird abgelehnt, nach mehreren Versuchen gesperrt
- [ ] WLAN kurz trennen: Screens verbinden sich selbst wieder, die Zeit stimmt

### Show
- [ ] Countdown starten, Pause, ±Zeit, Zurücksetzen (auch per Tastatur: Leertaste, R, Pfeile)
- [ ] Vorwarnung, Kritisch und Überzeit wechseln Farbe auf Regie, Screen und Moderation
- [ ] Endzeit „Ende 14:32 Uhr“ stimmt, pausiert „~“, bei Überzeit „Ende war“
- [ ] Blinken bei Überzeit: Aus, Sanft, Stark
- [ ] Einblendung senden, blinken, ausblenden; in der Regie rot als LIVE markiert
- [ ] Talkback an die Moderation, „Verstanden“ kommt zurück; Meldung von der Moderation
- [ ] Agenda: GO, Zeitleiste, Zeitkonto mit Vorschlägen, Puffer
- [ ] Blackout alle (B)
- [ ] Companion: `/api/companion/timer1/toggle` und `/api/companion/status`

### Aussehen
- [ ] Dunkel, Hell und „Wie System“ in Menü → System → Darstellung; die Wahl bleibt nach Neuladen
- [ ] Screens bleiben in beiden Themes dunkel
- [ ] Ziffern zappeln nicht, wenn die Sekunden laufen (feste Zellen)
- [ ] Schriften laden ohne Internet (Netzwerk am Rechner aus, Seite neu laden)
- [ ] 390 px (Handy), 1280 px, 1920 px und 4K: nichts abgeschnitten, nichts überlappt
- [ ] Touch-Ziele auf dem Tablet mindestens 44 px

### Standalone
- [ ] `event-timer-standalone.html` offline öffnen: Regie, Screen hier öffnen, Screen in neuem Fenster

### Plattformen
- [ ] Windows 11 (exe, Icon im Explorer und in der Taskleiste)
- [ ] macOS (App startet nach Rechtsklick → Öffnen)
- [ ] Linux (Fedora), Raspberry Pi mit `deploy/systemd/event-timer.service`
- [ ] iPad/iPhone Safari, Android Chrome
