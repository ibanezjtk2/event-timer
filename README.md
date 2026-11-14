<picture><source media="(prefers-color-scheme: dark)" srcset="web/brand/fs-event-timer-dunkel.svg"><img src="web/brand/fs-event-timer-hell.svg" alt="fs Event Timer" height="40"></picture>

Countdown, Redezeit und Agenda für Bühne und Regie. Ein einzelnes Programm ohne Installation und ohne Abhängigkeiten, bedient wird alles im Browser: am Rechner, auf dem Handy oder auf dem iPad.

- Läuft unter Windows, macOS, Linux und auf dem Raspberry Pi, oder als einzelne HTML-Datei direkt im Browser
- Bis zu 8 Timer und 16 Screens für beliebig viele Geräte im selben Netzwerk
- Agenda mit Zeitkonto, Endzeit und Cues
- Talkback zur Moderation und Meldungen von der Bühne
- Eigene Designs, Blackout, PIN für die Regie
- Steuerbar mit Bitfocus Companion

Die ausführliche Anleitung steht in [`docs/ANLEITUNG.md`](docs/ANLEITUNG.md).

## Download und Start

Die fertigen Dateien gibt es unter [Releases](https://github.com/ibanezjtk2/event-timer/releases).

| System | Datei | Start |
|---|---|---|
| Windows | `event-timer-<version>-windows-x64.exe` | Doppelklick |
| macOS | `event-timer-<version>-macos.zip` → *Event Timer.app* | Doppelklick, beim ersten Mal Rechtsklick → *Öffnen* |
| Linux / Raspberry Pi | `event-timer-<version>-linux-x64.tar.gz` (bzw. `-arm64`, `-armv7`) | `./event-timer` |
| Nur ein iPad oder Browser | `event-timer-standalone.html` | Datei öffnen |

Die Regie öffnet sich im Browser. Adressen und QR-Codes für die anderen Geräte stehen unter *Menü (Zahnrad) → Verbindung*. Die Show wird automatisch in `event-timer-data.json` neben dem Programm gespeichert.

Hinweise zu Firewall, SmartScreen, macOS und Raspberry Pi stehen in der [Anleitung](docs/ANLEITUNG.md#start-server).

## Wichtige Adressen

| Pfad | Zweck |
|---|---|
| `/control` | Regie |
| `/1` … `/16` | Screens, z. B. DSM oder Moderation |
| `/moderation` | Handy oder iPad der Moderation |
| `/plan` | Agenda-Monitor |
| `/uhr` | nur die Uhrzeit |

Statt der IP geht auch `event-timer.local:2468/1`. Alle Adressen und die Companion-Befehle stehen in der [Anleitung](docs/ANLEITUNG.md#adressen).

## Selbst bauen

Rust installieren (rustup.rs), dann `scripts/build.sh` (Windows: `scripts\build.ps1`). Das Ergebnis liegt in `dist/`. Es gibt keine Abhängigkeiten, deshalb klappt der Build auch offline. Mehr in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) und im [CHANGELOG](CHANGELOG.md).

## Lizenz

Copyright © 2026 Felix Spindler &lt;f-spindler@pm.me&gt;

Event Timer ist freie Software: Du darfst sie unter den Bedingungen der **GNU General Public License, Version 3 oder (nach deiner Wahl) jeder späteren Version**, nutzen, weitergeben und verändern. Wer sie weitergibt – verändert oder nicht –, muss den Quellcode unter derselben Lizenz mitliefern und diesen Hinweis erhalten.

Event Timer wird ohne jede Gewährleistung bereitgestellt. Der vollständige Lizenztext steht in [`LICENSE`](LICENSE).

### Drittanbieter-Lizenzen

Mitgeliefert und lokal ausgeliefert (nie aus dem Internet), die Lizenztexte liegen in `web/licenses/` und unter `/licenses/`:

| Was | Lizenz |
|---|---|
| IBM Plex Sans, Sans Condensed, Mono | SIL Open Font License 1.1 (reservierter Name „Plex“) |
| D-DIN | SIL Open Font License 1.1 (reservierter Name „D-DIN“) |
| Phosphor Icons 2.1.1 | MIT |
