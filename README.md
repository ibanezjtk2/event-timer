# Event Timer

Countdown, Redezeit und Ablaufplan für Bühne und Regie. Ein einzelnes Programm (unter 1 MB, keine Installation, keine Abhängigkeiten), bedient wird alles im Browser: am Rechner, auf dem Handy oder auf dem iPad.

## Zwei Betriebsarten

| | **Server** (`event-timer` / `.exe`) | **Standalone** (`event-timer-standalone.html`) |
|---|---|---|
| Läuft auf | Windows, macOS, Linux, Raspberry Pi | jedem Browser, auch iPad/iPhone/Android |
| Geräte | beliebig viele im selben Netzwerk | ein Gerät (plus Fenster auf dessen zweitem Bildschirm) |
| Speichert | Datei neben dem Programm | im Browser |
| Companion / PIN | ja | nein |

Standalone ist für „Ich hab nur ein iPad dabei“: Datei öffnen, fertig. Unter *Menü (☰) → Verbindung → DSM hier öffnen* wird das Gerät selbst zum DSM (Downstage-Monitor), oder *DSM in neuem Fenster* für einen zweiten Bildschirm.

## Start (Server)

| System | Datei | Start |
|---|---|---|
| Windows | `event-timer-<version>-windows-x64.exe` | Doppelklick – kein Konsolenfenster |
| macOS | `event-timer-<version>-macos.zip` → **Event Timer.app** | Doppelklick (erster Start: siehe unten) |
| Linux / Raspberry Pi | `event-timer-<version>-linux-x64.tar.gz` (bzw. `-arm64`, `-armv7`) | `./event-timer`; `./install-desktop.sh` legt einen Menüeintrag mit Icon an |

Die Regie öffnet sich im Browser. Adressen fürs Netzwerk und QR-Codes stehen unter *Menü (☰) → Verbindung*; dieselben Startinfos und eventuelle Fehler schreibt das Programm in **`event-timer.log`** neben der Daten-Datei. Aus einem Terminal gestartet, erscheinen sie auch dort.

**Beenden:** *Menü (☰) → System → „Event Timer beenden“* (nur am Rechner selbst sichtbar) oder Strg+C im Terminal. Die Show wird dabei immer gespeichert; im laufenden Betrieb schreibt das Programm, sobald 2 s lang nichts passiert, spätestens alle 10 s.

```
event-timer [--port 2468] [--host 0.0.0.0] [--data datei.json] [--pin 1234]
            [--name saal1] [--port80 | --no-port80] [--no-browser]
```

- **Port 2468** (früher 3000, damit nichts mit NDPro & Co. kollidiert). Ist er belegt, nimmt das Programm automatisch den nächsten freien und zeigt ihn an. Mit `--port` ist der Port fest.
- Startest du das Programm ein zweites Mal, öffnet es nur die Regie der laufenden Instanz. Eine andere Version wird automatisch ersetzt.
- **Windows-Firewall:** Beim ersten Start „Private Netzwerke“ erlauben, sonst kommen Handys nicht ran.
- **Daten:** `event-timer-data.json` liegt neben dem Programm (bzw. neben der *Event Timer.app*) – also auch auf einem USB-Stick. Ist der Ort nicht beschreibbar, nimmt das Programm den Benutzerordner; der Pfad steht unter *System*.
- **macOS:** Die App ist nicht von Apple beglaubigt. Erster Start: Rechtsklick → *Öffnen*; bei neueren macOS-Versionen *Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“*. Die App läuft im Hintergrund ohne Dock-Symbol. Läuft sie schon, öffnet ein weiterer Doppelklick **nicht** erneut die Regie – dann einfach `localhost:2468/control` aufrufen (Lesezeichen).
- **Windows-SmartScreen:** Die .exe ist nicht signiert. Vor dem Start Rechtsklick → *Eigenschaften* → *Zulassen*, oder einmal *Weitere Informationen → Trotzdem ausführen*.
- **Raspberry Pi:** `linux-arm64` (64-Bit-OS) bzw. `linux-armv7` (32-Bit). Autostart per systemd: siehe `tools/event-timer.service`.

## Kurze Adressen statt IP

Das Programm meldet sich per mDNS (Bonjour) selbst im Netzwerk an. Statt `192.168.178.42:2468/timer1` tippst du einfach:

```
event-timer.local:2468/1          # Display Timer 1
event-timer.local/1               # dasselbe, wenn „Ohne Portnummer (Port 80)“ an ist
```

- **Name ändern** unter *Menü (☰) → Verbindung* oder mit `--name saal1` → `saal1.local`. Laufen zwei Event Timer im selben Netz, braucht jeder einen eigenen Namen.
- **Port 80** ist aus, damit nichts anderem in die Quere kommt. Unter Linux braucht Port 80 erweiterte Rechte: `sudo setcap cap_net_bind_service=+ep event-timer`.
- Das klappt auf iPhone, iPad, Mac, Windows 10/11 und Linux (mit Avahi). Manche Android-Geräte lösen `.local` nicht auf, dort hilft der QR-Code oder die IP.

## Adressen

| Pfad | Zweck |
|---|---|
| `/control` | Regie |
| `/1` … `/8` (auch `/timer1`) | DSM (Downstage-Monitor): Vollbild-Timer – oder deine eigene DSM-Seite, wenn sie „Standard für /1“ ist |
| `/p/<name>` | eigene Seite aus Modulen (*Menü → Seiten*), z. B. `/p/dsm-links` |
| `/agenda` | Backstage-Display mit Ablaufplan, Abweichung und Ende-Prognose |
| `/plan` | Ablaufplan für die Moderation: laufender Punkt mit Restzeit und Balken, ganzer Tagesablauf daneben |
| `/moderation` | Handy/iPad der Moderation: Restzeit, Hinweis, Programm, „Von der Regie“ mit „Verstanden“, „An die Regie“ (ohne PIN). Auf dem iPad quer zweispaltig. Oder deine eigene Moderationsseite, wenn sie „Standard für /moderation“ ist. |
| `/cues` | Cue-Liste groß für weitere Operatoren (Licht, Video, Ton) |
| `/uhr` (auch `/clock`) | nur die Uhrzeit, sonst nichts (`?sec=0` ohne Sekunden) |
| `/display?t=2&layout=clock` | Uhrzeit groß, Timer klein (alle Ansichten baut dir *Menü → Verbindung → Display-Link erstellen* mit Vorschau zusammen) |
| `/display?t=1&layout=lower&bg=transparent` | Bauchbinde mit transparentem Hintergrund, für vMix/OBS als Browser-Input |
| `&chrome=0` | blendet Vollbild-Knopf und Verbindungshinweis aus |

Displays brauchen nie eine PIN, halten den Bildschirm wach (Wake Lock) und synchronisieren ihre Uhr mit dem Server. Bricht die Verbindung ab, läuft die Zeit lokal korrekt weiter.

## Funktionen

- **Bis zu 8 Timer**: Countdown, Count-up (mit optionalem Limit), Zielzeit („Beginn um 14:30“), **Uhrzeit** (schaltet den DSM in der Pause per Klick auf die Uhr) oder **Ablaufplan** (zeigt den laufenden Programmpunkt mit Restzeit und „Danach“, z. B. auf einem zweiten Display). *Set* setzt eine Dauer, *Set & Go* (⇧ ↵) startet sie sofort.
- **Blinken bei Überzeit**: Der Bildschirm pulsiert rot, sobald die Zeit um ist. Abschaltbar pro Design.
- **Ablaufplan**: Programmpunkte mit Titel, Sprecher*in und Dauer; *Nächster Punkt* lädt und startet den nächsten Programmpunkt. Zeigt die Abweichung vom Plan in Worten („4:50 vor Plan“), das voraussichtliche Ende und mit *Planbeginn* die Uhrzeit jedes Programmpunkts. Import per Copy & Paste (`Titel; Sprecher*in; Minuten`, auch direkt aus Excel).
- **Drei klare Wege für Nachrichten**, jeder mit eigener Farbe und eigenem Platz:
  - **An DSM** (gelb): Einblendung auf dem Bühnenmonitor, öffentlich, an *Alle DSMs* oder gezielt an einen. „LIVE auf DSM“ / „Ausgeblendet“ zeigt immer, was gerade wo steht.
  - **An Moderation** (blau): Talkback, privat, mit „Verstanden“.
  - **Von Moderation** (rot): Meldungen in der Alarmzone.
- **Seiten aus Modulen**: DSM- und Moderationsseiten selbst zusammenstellen (siehe unten).
- **Alarmzone**: Meldungen von der Bühne stehen fest oben unter der Kopfzeile und scrollen nie weg. Daneben die große Uhrzeit. Cues haben ihr eigenes, ruhiges Panel.
- **Layout**: eine Spalte auf Handy/iPad, zwei am Laptop, ab 1600 px drei (Timer · Ablaufplan · Cues und Talkback). Seltene Timer-Einstellungen liegen eingeklappt unter *Optionen*.
- **Designs**: 4 eingebaute (Stage, Daylight, Overlay zum Keying, Nur Ziffern) plus eigene, mit Live-Vorschau, frei pro Timer wählbar
- **All Blackout** für alle Displays
- **Multiviewer**: Die Regie zeigt jeden Timer als Live-Kachel mit Tally-Rahmen (grün läuft, gelb Warnung, rot kritisch/überzogen)
- **Speichern**: Jede Änderung landet sofort in `event-timer-data.json`. Nach einem Absturz oder Neustart läuft ein laufender Timer zeitlich korrekt weiter.
- **PIN** für die Regie (Menü → Sicherheit oder `--pin`). Am Rechner selbst (localhost) ist keine nötig.
- Deutsch / Englisch. Tastenkürzel stehen direkt auf den Knöpfen: Leertaste, R, ↑/↓ (±1 min), ←/→ (±10 s), ⇧ ↵ (Set & Go), G (nächster Programmpunkt), C (GO), B (All Blackout), 1–8

## Uhrzeiten im Ablaufplan

Der Ablauf läuft immer **Punkt für Punkt per GO** (*Nächster Punkt* oder Taste **G**). Uhrzeiten dienen nur der Planung:

- Programmpunkte mit **Beginn/Ende** eintragen (`13:00–15:00 Workshop A`) oder nur mit Dauer. Punkte ohne Uhrzeit schließen direkt an den vorherigen an, der erste an den *Planbeginn*.
- Regie, `/plan` und `/moderation` zeigen diese Planzeiten an; die Abweichung („4:50 hinter Plan“) rechnet mit den echten Startzeiten.
- **`/plan`** zeigt der Moderation den ganzen Ablauf mit Restzeit des laufenden Punkts. Die Timer-Art **„Ablaufplan“** zeigt dasselbe auf jedem normalen Display (`/2` …).
- Der Import versteht Uhrzeiten: `13:00-15:00; Workshop A; Anna Schmidt`

## Cues für die Regie

Jeder Programmpunkt kann technische Cues haben, z. B. „Einspieler starten“ oder „Panel-Mikros auf“. Du legst sie im Ablaufplan über den Stift an der Zeile an.

- **Wann:** bei Start, x Min. vor oder nach dem Start, x Min. vor dem Ende oder bei Ende.
- **Cue-Panel** in der Regie mit festem Platz – bewusst ruhig, weil Cues meist andere Gewerke auslösen: 60 Sekunden vorher bekommt der Cue einen gelben Rahmen (*Standby*), zum Zeitpunkt steht er gelb auf **jetzt**, bis du **GO** drückst (oder die Taste **C**). Kein Rot, kein Blinken, kein Ton. Cues ohne feste Zeit stehen *Auf Abruf*.
- Die Zeiten zählen ab dem Moment, in dem der Programmpunkt per GO startet.
- **`/cues`** zeigt die Liste groß, z. B. am Lichtpult – ebenso ruhig.

## Seiten aus Modulen

Unter **Menü → Seiten** stellst du eigene Seiten zusammen. Es gibt zwei Arten:

| Art | Für | Module |
|---|---|---|
| **DSM** | Bühnenmonitore, Backstage-TV – nur Anzeige, kein Touch | Timer, Uhr, Nächster Punkt, Ablaufplan, Einblendung |
| **Moderation** | Handy oder Tablet der Moderation | alle: zusätzlich Hinweis, Von der Regie, An die Regie (die Einblendung erscheint hier als Spiegel „Steht auf dem DSM“) |

- **Anlegen:** *Neue DSM-Seite* / *Neue Moderationsseite* oder eine eingebaute Seite **kopieren**.
- **Bearbeiten:** Layout wählen (DSM: Vollbild, Haupt + Seite, Haupt + Leiste unten; Moderation: zwei Spalten oder eine), mit **+ Modul** Module hinzufügen, mit ↑ ↓ sortieren, ⚙ für Einstellungen (welcher Timer, Darstellung, Sekunden), 🗑 entfernen. Rechts siehst du eine Live-Vorschau (Bildschirm, iPad quer/hoch, Handy).
- **Übernehmen:** Bis dahin ist alles nur ein Entwurf. Erst danach geht die Seite live; geöffnete Geräte wechseln von selbst, ohne Neuladen.
- **Adresse:** jede Seite hat `/p/<name>` und einen QR-Code. Mit **„Als Standard für“** ersetzt sie `/moderation` bzw. `/1` … `/8` – Lesezeichen und Kiosk-Browser bleiben, wie sie sind.
- Bis zu 16 eigene Seiten, bis zu 8 Module pro Bereich. `/cues` bleibt eine feste Seite.

Auf dem Handy steht offenes Talkback immer ganz oben und das Programm ganz unten; im iPad-Querformat stehen die Spalten nebeneinander, ohne dass die Seite scrollt.

## Talkback und Meldungen (Regie ↔ Moderation)

Die Moderation öffnet **`/moderation`** (oder ihre eigene Seite) auf dem Handy oder iPad. Die eingebaute Seite zeigt links Restzeit, Hinweis und Programm, rechts „Von der Regie“ und „An die Regie“. Hinweise trägst du in der Regie beim Bearbeiten eines Programmpunkts ein (Feld „Hinweis für die Moderation“). DSM-Einblendungen sieht die Moderation nur, wenn ihre Seite das Modul „Einblendung“ hat.

**Regie → Moderation (Talkback)**
- Im Panel *An Moderation* per Preset („Noch 5 Minuten“, „Bitte strecken“, „Einspieler kommt“ …) oder Freitext senden.
- Auf dem Handy erscheint die Nachricht groß und blau (mit Vibration) und dem Knopf **Verstanden**.
- In der Regie steht danach „verstanden ✓ 14:32“. „Verstanden“ braucht keine PIN.

**Bühne → Regie (Meldungen)**
- Große Knöpfe (Schnellmeldungen) wie „Brauche 2 Minuten mehr“ oder „Mikrofon-Problem“, dazu Freitext.
- In der Regie steht die Meldung rot pulsierend in der Alarmzone, mit Intercom-Signalton (3× „di-da“); bis zur Bestätigung erinnert alle 15 s ein kurzer Ton. Der Tab-Titel zeigt die Anzahl.
- Browser spielen erst nach einem Klick Ton ab. Solange der Ton gesperrt ist, zeigt die Regie oben „🔇 Ton aus – klicken“.
- **Bestätigen** quittiert die Meldung. Auf dem Handy steht dann „bestätigt ✓“.
- Es braucht **keine PIN**, aber pro Gerät höchstens eine Meldung alle 1,5 Sekunden.

Alle drei Listen (Schnellnachrichten an den DSM, Talkback-Presets, Schnellmeldungen) bearbeitest du unter *Menü → Schnellnachrichten*. Signalton, Lautstärke (Normal/Laut/Sehr laut), Erinnerung und „Ton testen“ findest du unter *System*.

## Bitfocus Companion

Modul **Generic HTTP**, GET-Requests (bei gesetzter PIN `?pin=…` anhängen):

```
/api/companion/timer1/{start|pause|toggle|reset}
/api/companion/timer1/add/60          /api/companion/timer1/subtract/30
/api/companion/timer1/preset/10       (?start=1 startet sofort)
/api/companion/timer1/message?text=Bitte%20zum%20Ende&flash=1   (Einblendung auf dem DSM hinter /1)
/api/companion/timer1/{clear-message|flash}
/api/companion/agenda/{next|prev|reset}   /api/companion/agenda/go/3
/api/companion/blackout/{on|off|toggle}
/api/companion/status                 → JSON inkl. timers[].display ("04:59"), phase, agenda.current, agenda.drift,
                                        openRequests, lastRequest (Meldungen von der Bühne), openTalkback
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

Es gibt keine Abhängigkeiten, deshalb klappt der Build auch offline. Ins eigene GitHub-Repo gepusht, baut `.github/workflows/build.yml` automatisch alle Plattformen (Windows-Icon und Versionsinfos erzeugt `build.rs` selbst, die Mac-App und die Linux-Pakete der Workflow).

**Versionen:** Semantic Versioning (MAJOR.MINOR.PATCH), die Nummer steht nur in `Cargo.toml`. Änderungen pro Version stehen in [`CHANGELOG.md`](CHANGELOG.md). Ein Tag `vX.Y.Z` erzeugt ein GitHub-Release mit allen Dateien; der Text kommt aus dem CHANGELOG. Tags mit Bindestrich (`v1.6.0-beta.1`) werden als Vorabversion markiert.

## Aufbau

```
src/engine.rs   Timer-Logik (Rust)          web/js/engine.js   dieselbe Logik (JS, für Standalone)
src/server.rs   HTTP, WebSocket, PIN, API   tests/scenarios.json  gemeinsame Tests für beide Engines
src/json.rs     JSON ohne Crates            web/js/control.js  Regie
src/http.rs     HTTP/WebSocket-Protokoll    web/js/display.js  Display-Renderer (auch für die Kacheln)
src/store.rs    Speichern                   web/js/qr.js       QR-Code-Encoder
                                            web/js/pages.js    Seiten aus Modulen (DSM, Moderation)
                                            web/js/pageeditor.js  Menü → Seiten, Seiten-Editor
```

Die Web-Oberfläche wird beim Kompilieren ins Programm eingebettet.

Icons: `packaging/icon/` (Vorlage `event-timer.svg`, daraus `.ico`, `.icns`, PNG). Mac-App: `packaging/macos/`, Linux-Menüeintrag: `packaging/linux/`.

## Lizenz

Copyright © 2026 Felix Spindler &lt;f-spindler@pm.me&gt;

Event Timer ist freie Software: Du darfst sie unter den Bedingungen der **GNU General Public License, Version 3 oder (nach deiner Wahl) jeder späteren Version**, nutzen, weitergeben und verändern. Wer sie weitergibt – verändert oder nicht –, muss den Quellcode unter derselben Lizenz mitliefern und diesen Hinweis erhalten.

Event Timer wird ohne jede Gewährleistung bereitgestellt. Der vollständige Lizenztext steht in [`LICENSE`](LICENSE).
