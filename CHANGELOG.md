# Changelog

Alle Änderungen an Event Timer, neueste zuerst. Versionen nach [Semantic Versioning](https://semver.org/lang/de/): PATCH = Fehlerbehebung, MINOR = neue Funktionen (Bestehendes läuft weiter), MAJOR = etwas Bestehendes ändert sich.

## 1.5.2 – 2026-10-11

### Neu
- **Eigenes App-Icon** (Stoppuhr mit grün-gelbem Ablaufring) – gleich auf Windows, macOS, Linux und im Browser.
- **macOS: „Event Timer.app“** statt einer nackten Datei, die das Terminal öffnet. Läuft im Hintergrund ohne Dock-Symbol.
- **Linux: Paket mit Icon** und `install-desktop.sh` für einen Eintrag im Anwendungsmenü.
- **„Event Timer beenden“** unter *Menü → System* – nur am Rechner selbst, mit Sicherheitsabfrage, speichert vorher.
- **Log-Datei** `event-timer.log` neben der Daten-Datei mit Startinfos und Fehlern.
- **Lizenz: GPL-3.0-or-later**, © Felix Spindler – steht in `LICENSE`, im README und unter *Menü → System*.
- Windows: Versionsinfos und Copyright in den Dateieigenschaften der .exe.

### Geändert
- **Windows: kein Konsolenfenster mehr.** Fehler beim Start erscheinen als Meldungsfenster; aus einem Terminal gestartet, kommen die Ausgaben weiterhin dort an.
- **Speichern:** erst nach 2 s ohne Änderung, im Dauerbetrieb spätestens alle 10 s, beim Beenden immer. Die Daten-Datei bleibt portabel neben dem Programm (auf dem Mac neben der .app).
- Dateinamen enthalten die Version, z. B. `event-timer-1.5.2-windows-x64.exe`.
- Release-Texte kommen aus diesem CHANGELOG.

### Behoben
- Windows: Browser wird über die normale Windows-Funktion geöffnet statt über `rundll32` – das sah für Virenscanner und Chromes Download-Prüfung verdächtig aus.
- Strg+C, Schließen des Terminals oder Herunterfahren (macOS/Linux) speichern jetzt noch, bevor das Programm endet.

## 1.5.1 – 2026-10-10

### Neu
- `/moderation`: ganzes Programm mit laufendem Punkt, Abweichung vom Plan und **Hinweisen**; iPad im Querformat zweispaltig ohne Scrollen.
- Feld **„Hinweis für die Moderation“** pro Programmpunkt.
- **Signalton** als kräftiges Intercom-Signal mit Lautstärke, Erinnerung alle 15 s bis zur Bestätigung und Hinweis „Ton aus – klicken“.
- *Display-Link erstellen* mit Erklärung je Ansicht und Live-Vorschau.

## 1.5.0 – 2026-10-10

### Neu
- **Talkback** Regie → Moderation mit Presets, Freitext und „Verstanden“.
- **Alarmzone** für Meldungen von der Bühne und fällige GO-Cues, große Uhrzeit in der Kopfzeile.
- DSM-Einblendung mit Status „LIVE auf DSM“.

### Geändert
- Neues Regie-Layout (Menü ☰, aufklappbare Optionen, Tastenkürzel auf den Knöpfen, drei Spalten ab 1600 px, Touch-Ziele ≥ 44 px), weniger runde Ecken, einheitliche professionelle Begriffe.

## 1.4.0 – 2026-10-10

### Neu
- **Cue-Liste** pro Programmpunkt mit Standby/GO und Cue-Display `/cues`.
- **Rückkanal** Bühne → Regie: `/moderation` mit Schnellmeldungen und Freitext.

## 1.3.0 – 2026-10-10

### Neu
- **Ablaufplan nach Uhrzeit** mit Fortschrittsbalken, `/plan` für die Moderation und Eingriffen aus der Regie (Hold, ± Minuten, Punkt jetzt beenden, ganzen Plan verschieben).

## 1.2.0 – 2026-10-10

### Neu
- **Kurze Adressen** per Netzwerkname `event-timer.local`, optional ohne Portnummer (Port 80), Kurzpfade `/1`–`/8` und `/uhr`.

## 1.1.0 – 2026-10-10

### Neu
- Uhrzeit-Modus und **Blinken bei Überzeit**.

## 1.0.0 – 2026-10-10

- Kompletter Neubau als ein Programm in Rust mit Weboberfläche: Regie, Displays, Ablaufplan, Designs, PIN, Companion-Schnittstelle, Standalone-HTML.
