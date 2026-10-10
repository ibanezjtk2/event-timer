# Event Timer 1.1

Countdown, Redezeit und Ablaufplan für Bühne und Regie. Ein einzelnes Programm (unter 1 MB, keine Installation, keine Abhängigkeiten), bedient wird alles im Browser: am Rechner, auf dem Handy oder auf dem iPad.

## Zwei Betriebsarten

| | **Server** (`event-timer` / `.exe`) | **Standalone** (`event-timer-standalone.html`) |
|---|---|---|
| Läuft auf | Windows, macOS, Linux, Raspberry Pi | jedem Browser, auch iPad/iPhone/Android |
| Geräte | beliebig viele im selben Netzwerk | ein Gerät (plus Fenster auf dessen zweitem Bildschirm) |
| Speichert | Datei neben dem Programm | im Browser |
| Companion / PIN | ja | nein |

Standalone ist für „Ich hab nur ein iPad dabei“: Datei öffnen, fertig. Unter *Einstellungen → Verbinden → Bühnenansicht hier* wird das Gerät selbst zum Display, oder *Display in neuem Fenster* für einen zweiten Bildschirm.

## Start (Server)

Doppelklick bzw. `./event-timer`. Die Steuerung öffnet sich im Browser, im Konsolenfenster stehen die Adressen fürs Netzwerk. Der QR-Code unter *Einstellungen → Verbinden* bringt Handys direkt hin.

```
event-timer [--port 2468] [--host 0.0.0.0] [--data datei.json] [--pin 1234]
            [--name saal1] [--port80 | --no-port80] [--no-browser]
```

- **Port 2468** (früher 3000, damit nichts mit anderer Show-Software kollidiert). Ist er belegt, nimmt das Programm automatisch den nächsten freien und zeigt ihn an. Mit `--port` ist der Port fest.
- Startest du das Programm ein zweites Mal, öffnet es nur die Steuerung der laufenden Instanz. Eine andere Version wird automatisch ersetzt.
- **Windows-Firewall:** Beim ersten Start „Private Netzwerke“ erlauben, sonst kommen Handys nicht ran.
- **macOS:** Unsignierte Datei → einmal Rechtsklick → *Öffnen*, oder `xattr -d com.apple.quarantine event-timer-macos`.
- **Raspberry Pi:** `event-timer-linux-arm64` (64-Bit-OS) bzw. `-armv7` (32-Bit). Autostart per systemd: siehe `tools/event-timer.service`.

## Kurze Adressen statt IP

Das Programm meldet sich per mDNS (Bonjour) selbst im Netzwerk an. Statt `192.168.178.42:2468/timer1` tippst du einfach:

```
event-timer.local:2468/1          # Display Timer 1
event-timer.local/1               # dasselbe, wenn „Ohne Portnummer (Port 80)“ an ist
```

- **Name ändern** unter *Einstellungen → Verbinden* oder mit `--name saal1` → `saal1.local`. Laufen zwei Event Timer im selben Netz, braucht jeder einen eigenen Namen.
- **Port 80** ist aus, damit nichts anderem in die Quere kommt. Unter Linux braucht Port 80 erweiterte Rechte: `sudo setcap cap_net_bind_service=+ep event-timer`.
- Das klappt auf iPhone, iPad, Mac, Windows 10/11 und Linux (mit Avahi). Manche Android-Geräte lösen `.local` nicht auf, dort hilft der QR-Code oder die IP.

## Adressen

| Pfad | Zweck |
|---|---|
| `/control` | Steuerung |
| `/1` … `/8` (auch `/timer1`) | Vollbild-Display eines Timers |
| `/agenda` | Backstage-Display mit Ablaufplan, Abweichung und Ende-Prognose |
| `/plan` | Zeitplan für die Moderation: laufender Punkt mit Restzeit und Balken, ganzer Tagesablauf daneben |
| `/moderation` | Handy der Moderation: Restzeit plus Knöpfe, die Meldungen an die Regie schicken (ohne PIN) |
| `/cues` | Cue-Liste groß für weitere Operatoren (Licht, Video, Ton) |
| `/uhr` (auch `/clock`) | nur die Uhrzeit, sonst nichts (`?sec=0` ohne Sekunden) |
| `/display?t=2&layout=clock` | Uhrzeit groß, Timer klein |
| `/display?t=1&layout=lower&bg=transparent` | Bauchbinde mit transparentem Hintergrund, für vMix/OBS als Browser-Input |
| `&chrome=0` | blendet Vollbild-Knopf und Verbindungshinweis aus |

Displays brauchen nie eine PIN, halten den Bildschirm wach (Wake Lock) und synchronisieren ihre Uhr mit dem Server. Bricht die Verbindung ab, läuft die Zeit lokal korrekt weiter.

## Funktionen

- **Bis zu 8 Timer**: Countdown, Hochzählen (mit optionalem Limit), bis Uhrzeit („Beginn um 14:30“) oder einfach **Uhrzeit**: Damit schaltest du ein Bühnen-Display in der Pause per Klick auf die Uhr um.
- **Blinken beim Überziehen**: Der Bildschirm pulsiert rot, sobald die Zeit um ist. Abschaltbar pro Design.
- **Ablaufplan**: Slots mit Titel, Sprecher*in und Dauer; *Weiter* lädt und startet den nächsten Slot. Zeigt die Abweichung zum Plan, die voraussichtliche Endzeit und mit *Planbeginn* die Uhrzeit jedes Slots. Import per Copy & Paste (`Titel; Sprecher*in; Minuten`, auch direkt aus Excel).
- **Nachrichten an die Bühne** mit Schnellnachrichten und Blinken
- **Designs**: 4 eingebaute (Stage, Daylight, Overlay zum Keying, Nur Ziffern) plus eigene, mit Live-Vorschau, frei pro Timer wählbar
- **Blackout** für alle Displays
- **Multiviewer**: Die Steuerung zeigt jeden Timer als Live-Kachel mit Tally-Rahmen (grün läuft, gelb Warnung, rot kritisch/überzogen)
- **Speichern**: Jede Änderung landet sofort in `event-timer-data.json`. Nach einem Absturz oder Neustart läuft ein laufender Timer zeitlich korrekt weiter.
- **PIN** für die Steuerung (Einstellungen → Sicherheit oder `--pin`). Am Rechner selbst (localhost) ist keine nötig.
- Deutsch / Englisch, Tastenkürzel: Leertaste, R, ↑/↓ (±1 min), ←/→ (±10 s), G (nächster Slot), B (Blackout), 1–8

## Zeitplan nach Uhrzeit

Im Ablaufplan oben rechts **„Nach Uhrzeit“** wählen. Dann läuft der Ablauf von selbst nach der Uhr, ganz ohne „Weiter“-Knopf:

- Programmpunkte mit **Von/Bis** eintragen (`13:00–15:00 Workshop A`) oder nur mit Dauer. Punkte ohne Uhrzeit schließen direkt an den vorherigen an, der erste an den *Planbeginn*.
- Der laufende Punkt bekommt einen Balken, der bis zum Ende durchläuft. Lücken zeigen „Pause, weiter um 15:30“.
- **`/plan`** zeigt der Moderation den ganzen Tag mit Restzeit des laufenden Punkts. Die Timer-Art **„Zeitplan“** macht dasselbe auf jedem normalen Display (`/1` …).
- **Eingreifen aus der Regie:**
  - **Anhalten/Fortsetzen:** Die Haltezeit hängt sich an den laufenden Punkt, alles Folgende rutscht mit.
  - **±1/±5 Min** für den laufenden Punkt, mit oder ohne „Folgende verschieben“
  - **Jetzt weiter:** beendet den laufenden Punkt sofort.
  - **Ganzer Plan ±5:** z. B. wenn ihr später anfangt
  - **Anpassungen zurücksetzen:** zurück zum Originalplan
- Der Import versteht Uhrzeiten: `13:00-15:00; Workshop A; Anna Schmidt`

## Cues für die Regie

Jeder Programmpunkt kann technische Cues haben, z. B. „Einspieler starten“ oder „Panel-Mikros auf“. Du legst sie im Ablaufplan über den Stift an der Zeile an.

- **Wann:** bei Start, x Min. vor oder nach dem Start, x Min. vor dem Ende oder bei Ende.
- **Cue-Leiste** in der Steuerung: 60 Sekunden vorher steht der Cue gelb auf *Standby*, zum Zeitpunkt rot blinkend auf **GO**, bis du **Go** drückst (oder die Taste **C**).
- Nach Uhrzeit laufen die Cues vollautomatisch mit. Im Modus „Per Knopf“ zählen sie ab dem Moment, in dem der Punkt startet.
- **`/cues`** zeigt die Liste groß, z. B. am Lichtpult.

## Rückkanal Bühne → Regie

Die Moderation öffnet **`/moderation`** auf dem Handy. Sie sieht die eigene Restzeit und den nächsten Punkt und hat große Knöpfe wie „Brauche 2 Minuten mehr“ oder „Mikrofon-Problem“, dazu ein Freitextfeld.

- In der Steuerung erscheint die Meldung als rot pulsierendes Banner mit Ton, der Tab-Titel zeigt die Anzahl.
- **Gesehen** quittiert die Meldung. Auf dem Handy steht dann „gesehen ✓“.
- Es braucht **keine PIN**, aber pro Gerät höchstens eine Meldung alle 1,5 Sekunden.
- Knöpfe anpassen unter *Einstellungen → Nachrichten*, Ton abschalten unter *Mehr*.

## Bitfocus Companion

Modul **Generic HTTP**, GET-Requests (bei gesetzter PIN `?pin=…` anhängen):

```
/api/companion/timer1/{start|pause|toggle|reset}
/api/companion/timer1/add/60          /api/companion/timer1/subtract/30
/api/companion/timer1/preset/10       (?start=1 startet sofort)
/api/companion/timer1/message?text=Bitte%20zum%20Ende&flash=1
/api/companion/timer1/{clear-message|flash}
/api/companion/agenda/{next|prev|reset}   /api/companion/agenda/go/3
/api/companion/blackout/{on|off|toggle}
/api/companion/status                 → JSON inkl. timers[].display ("04:59"), phase, agenda.current, agenda.drift,
                                        openRequests, lastRequest (Meldungen von der Bühne)
```

Die Pfade aus v0.12 funktionieren weiter. Neu sind Timer 7–8, Ablauf, Blackout und Flash. Wichtig ist nur der neue Port.

Zum Skripten gibt es außerdem `GET /api/state` und `POST /api/action` mit JSON, z. B. `{"type":"timer.set","id":"t1","ms":300000,"start":true}`.

## Selbst bauen

Rust installieren (rustup.rs), dann:

```
cargo build --release          # → target/release/event-timer(.exe)
node tools/build-standalone.js # → dist/event-timer-standalone.html
cargo test && node tools/test-engine.js
```

Es gibt keine Abhängigkeiten, deshalb klappt der Build auch offline. Ins eigene GitHub-Repo gepusht, baut `.github/workflows/build.yml` automatisch alle Plattformen. Ein Tag `v1.0.0` erzeugt ein Release mit allen Dateien.

## Aufbau

```
src/engine.rs   Timer-Logik (Rust)          web/js/engine.js   dieselbe Logik (JS, für Standalone)
src/server.rs   HTTP, WebSocket, PIN, API   tests/scenarios.json  gemeinsame Tests für beide Engines
src/json.rs     JSON ohne Crates            web/js/control.js  Steuerung
src/http.rs     HTTP/WebSocket-Protokoll    web/js/display.js  Display-Renderer (auch für die Kacheln)
src/store.rs    Speichern                   web/js/qr.js       QR-Code-Encoder
```

Die Web-Oberfläche wird beim Kompilieren ins Programm eingebettet.
