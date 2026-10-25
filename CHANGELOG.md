# Changelog

Alle Änderungen an Event Timer, neueste zuerst. Versionen nach [Semantic Versioning](https://semver.org/lang/de/): PATCH = Fehlerbehebung, MINOR = neue Funktionen (Bestehendes läuft weiter), MAJOR = etwas Bestehendes ändert sich.

## Unveröffentlicht

### Neu
- **Endzeit** neben dem laufenden Countdown: „Ende 14:32“ in der Regie, auf der Moderation und auf den Screens unter den Ziffern. Pausiert „Ende ~14:35“, bei Überzeit „Ende war 14:32“ (nicht auf den Screens). Gilt für Countdowns und Hochzählen mit Limit. Pro Design abschaltbar (*Endzeit anzeigen*, Standard an).
- **Blinken bei Überzeit** in drei Stufen: *Aus*, *Sanft* und *Stark* (das bisherige harte Blinken).

### Geändert
- **Begriffe vereinheitlicht** (siehe README → Begriffe): Die Moderation zeigt die Agenda jetzt als „Agenda“ statt „Programm“, `/plan` heißt überall **Agenda-Monitor**, die Backstage-Ansicht **Agenda (Backstage)**, „Programm beendet“ wird zu **Agenda beendet**. „Feste Seiten“ heißen **Feste Screens**, „Display-Link erstellen“ heißt **Ansichts-Link erstellen**, Hilfetexte sprechen von Screens statt Displays.
- Knöpfe auf Deutsch: **Setzen**, **Setzen & Start**, **Zurücksetzen**, **Hochzählen**, **Blackout alle**; das eingebaute Design „Stage“ heißt **Bühne**.
- Design-Option „Text bei Ablauf“ heißt **Text bei Zeitende** (nicht zu verwechseln mit dem Text bei Überzeit). Layout „Haupt + Seite“ heißt **Haupt + Spalte rechts**.
- Auf dem Agenda-Display heißt die Prognose fürs Ende der ganzen Show **Show-Ende**, damit „Ende“ frei für die Endzeit eines Timers ist.
- Menü → System: Der Abschnitt zum Beenden heißt „Beenden“ statt „Programm“.
- **Kurze Timer:** Ist die Vorwarnung oder Kritisch-Schwelle so lang wie der ganze Timer (z. B. 1-Minuten-Timer mit „Kritisch 1“), war bisher alles sofort rot. Solche Schwellen greifen jetzt bei der Hälfte (Vorwarnung) bzw. einem Viertel (Kritisch) der Dauer.
- Regie: Das Status-Wort neben der Zeit („Läuft“) hat dieselbe Farbe wie die Ziffern, nicht mehr grün neben rot.
- Moderation: Der Fortschrittsbalken unter der Zeit wird bei Vorwarnung gelb und bei Kritisch/Überzeit rot.
- Multiviewer: Der Screen-Name steht als Leiste unter dem Bild und verdeckt keine Hinweise oder den Balken mehr.
- „Ton aus – klicken“ blinkt nur noch kurz und bleibt dann ruhig stehen.
- Moderation: Der eigene Name oben rechts trägt einen Stift, damit klar ist, dass man ihn antippen und ändern kann.
- Bestehende Designs mit „Blinken bei Überzeit“ blinken nach dem Update **sanft**. Wer das harte Blinken will, stellt im Design auf *Stark*.
- Ist am Gerät „Bewegung reduzieren“ eingestellt, blinkt bei Überzeit und bei Einblendungen nichts mehr.
- Alle Puls- und Blink-Effekte nutzen zwei gemeinsame Takte (sanft 2 s, hart 1 s).

### Behoben
- „Noch keine Agenda“ brach auf der Moderation und auf `/plan` nach jedem Wort um.

## 1.6.0-beta.2 – 2026-10-11

Zweite Testversion von 1.6 mit neuem Grundkonzept: **Screens sind die Ausgänge, Timer die Quellen.**

### Neu
- **Screens** mit Nummer (`/1` … `/16`) und Namen, Art **Anzeige** oder **Moderation**. Jeder Screen besteht aus Modulen. `/p/<name>` bleibt als zweite Adresse.
- **Gruppen**: Screens mit gemeinsamem Aufbau (z. B. zwei DSMs). Pro Screen kann **„Eigener Aufbau“** davon abweichen. Gruppe als Ganzes auswählen und ihr eine Einblendung schicken.
- **Vorlagen** für neue Screens: DSM (Vorschau-Monitor), Agenda-Monitor, Uhr, Moderation, leer.
- Regie: Die Kacheln oben sind jetzt die **Screens** (live gerendert, Gruppen im Rahmen). Ein Klick wählt den Screen und seinen Timer aus.
- **Timer als Quellen** mit Namen, auswählbar als Chips mit Live-Zeit; „läuft auf: 1 · DSM links, 2 · DSM rechts …“ zeigt, wo ein Timer überall zu sehen ist. Ein Timer auf mehreren Screens wird einmal gesteuert.
- Die Agenda zeigt, auf welchen Screens ihr verknüpfter Timer läuft.

### Geändert
- **Begriffe:** *Ablaufplan* heißt jetzt **Agenda**. Die drei Nachrichtenwege heißen **Einblendung → Screens**, **Talkback → Moderation**, **Meldung ← Moderation**.
- Einblendung: Ziel ist *Alle Screens* oder die Auswahl oben (ein Screen oder eine Gruppe).
- `/moderation` zeigt den ersten Moderations-Screen. „Als Standard für“ aus beta.1 entfällt – die Nummer ist die Adresse.
- Die Timer-Art **„Ablaufplan“** entfällt; bestehende Timer dieser Art werden zu Countdowns. Ein Screen mit Timer- und Agenda-Modul kann mehr.
- Lange Zeiten (z. B. `+1:02:16`) passen sich auf der Moderationsseite der Kartenbreite an.

### Umstellung beim ersten Start
- Aus jedem Timer N wird Screen N, der genau diesen Timer zeigt – `/1` sieht also aus wie vorher. Eigene Seiten aus beta.1 werden zu Screens (eine Seite, die „Standard für /1“ war, wird Screen 1). Gibt es keinen Moderations-Screen, wird einer angelegt. Einblendungen bleiben erhalten.

## 1.6.0-beta.1 – 2026-10-11

Erste Testversion von 1.6. Bitte in einem Probelauf testen, noch nicht bei einer echten Veranstaltung.

### Neu
- **Seiten aus Modulen** unter *Menü → Seiten*: eigene DSM- und Moderationsseiten mit Layout, Modulen, Live-Vorschau (Bildschirm, iPad, Handy) und **„Übernehmen“** – vorher geht nichts live. Jede Seite hat eine Adresse `/p/<name>` und einen QR-Code.
- **DSM-Seiten** sind reine Anzeige: Timer, Uhr, Nächster Punkt, Ablaufplan, Einblendung. **Moderationsseiten** bekommen alle Module, dazu Hinweis, Von der Regie und An die Regie.
- **„Als Standard für“**: eine eigene Seite ersetzt `/moderation` oder `/1` … `/8` – ohne neuen QR-Code.
- Modul **Ablaufplan** auf dem DSM: ganzer Ablauf mit Planzeiten, laufender Punkt mit Balken und Restzeit, gelb bei Vorwarnung, rot bei Kritisch.
- Regie: Panel **„An DSM“** (gelb) mit *Alle DSMs* oder gezielt einem DSM, Status „LIVE auf DSM“ pro Ziel.

### Geändert
- **Einblendungen gehören jetzt zum DSM, nicht mehr zum Timer.** Bestehende Einblendungen werden beim ersten Start übernommen (Timer N → DSM `/N`). Mit „Nächster Punkt“ verschwinden wie bisher alle Einblendungen.
- Das Timer-Panel regelt nur noch die Zeit. Talkback heißt jetzt **„An Moderation“** (blau), Meldungen stehen als **„Von Moderation“** (rot) in der Alarmzone.
- Die eingebaute Seite `/moderation` ist neu aufgebaut: links Restzeit, Hinweis und Programm, rechts „Von der Regie“ und „An die Regie“. DSM-Einblendungen zeigt sie nicht mehr.
- `/plan` ist jetzt eine Seite aus Timer und Ablaufplan.
- Große Ziffern werden verkleinert, wenn sie nicht in ihren Bereich passen (z. B. auf Rechnern ohne schmale Schrift).

### Für Companion
- `timerN/message`, `clear-message` und `flash` steuern die Einblendung auf dem DSM hinter `/N`.

## 1.5.3 – 2026-10-11

### Geändert
- **Cues ruhiger:** Cues stehen nicht mehr in der Alarmzone, sondern in ihrem eigenen Panel mit festem Platz. Fällige Cues sind gelb statt rot, nichts blinkt – auch nicht auf `/cues`. Cues haben keinen Ton. Die Alarmzone gehört allein den Meldungen von der Bühne.
- **Neue Talkback-Presets:** Noch 5 Minuten · Noch 1 Minute · Bitte zum Ende kommen · Bitte strecken · Keine Fragen mehr · Einspieler kommt · Mikrofon ist aus · Technisches Problem – bitte überbrücken. Eine unveränderte alte Liste wird automatisch ersetzt, eigene Listen bleiben.
- Die Timer-Art **„Ablaufplan“** und `/plan` folgen jetzt dem laufenden Ablauf (GO für GO) inklusive Pause und ± am verknüpften Timer.

### Entfernt
- Ablauf-Modus **„Automatisch nach Uhrzeit“** samt Hold, ±-Korrekturen und „Punkt jetzt beenden“. Der Ablauf läuft immer per GO; Beginn/Ende-Zeiten bleiben als Planzeiten. Gespeicherte Shows im alten Modus laufen beim ersten Start einfach manuell weiter.

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
