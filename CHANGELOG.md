# Changelog

Alle Änderungen an Event Timer, neueste zuerst. Versionen nach [Semantic Versioning](https://semver.org/lang/de/): PATCH = Fehlerbehebung, MINOR = neue Funktionen (Bestehendes läuft weiter), MAJOR = etwas Bestehendes ändert sich.

## 0.7.0 – 2026-11-05

Neues Aussehen, gleiche Funktionen. Gespeicherte Shows, Designs, PIN und Companion-Befehle aus 0.6 laufen unverändert weiter.

### Geändert
- **Design nach Show-UI:** ruhiger, flacher, klarere Zustände. Rote Linie unter der Kopfzeile, kleines rotes Quadrat vor dem Namen, Beschriftungen über Gruppen in schmalen Großbuchstaben wie auf einem Pult, kaum gerundete Ecken.
- **Schriften eingebettet:** IBM Plex Sans für Text, D-DIN für alle Zeiten. Ziffern stehen in festen Zellen, damit nichts zappelt, wenn eine 1 zur 8 wird. Kein Download aus dem Internet, auch nicht in der Einzeldatei.
- **Helles Theme:** Menü → System → Darstellung: *Dunkel* (Standard), *Hell* oder *Wie System*, merkt sich der Browser. Screens bleiben immer dunkel.
- **Icons:** einheitlich Phosphor, keine Emojis mehr. Das Menü öffnet sich über das Zahnrad oben rechts.
- **Farben mit fester Bedeutung:** Grün = läuft, Gelb = Vorwarnung, Rot = Kritisch, Überzeit, Fehler und *live*. Eine **Einblendung**, die gerade auf Screens steht, ist in der Regie jetzt rot markiert (on air) statt gelb; **Talkback** ist Cyan. Auswahl und Fokus sind immer Cyan.
- **Start, Senden und GO** sind hell auf dunkel (invertiert) statt grün, damit Grün nur „läuft“ heißt.
- Die eingebauten Designs (Bühne, Daylight, Overlay, Nur Ziffern) nutzen die gedämpften Show-UI-Farben. Eigene Designs behalten ihre Farben. Schriftwahl im Design: *D-DIN (Standard)*, *IBM Plex Sans*, *IBM Plex Mono*, *Serif (System)*, *Rounded (System)*.
- **fs-Logo:** Schriftzug „fs Event Timer“ auf der Startseite und im neuen Abschnitt *Über Event Timer* (Menü → System, mit Version, Commit und Lizenzen).
- **Neues App-Icon** für Windows, macOS, Linux und Home-Bildschirm: die rote fs-Kachel mit einem weißen Restzeit-Ring. So bleibt Event Timer als fs-App erkennbar und ist in der Taskleiste trotzdem von anderen fs-Apps zu unterscheiden.
- `--version`, Startbanner und *Über* zeigen den Commit mit an (`0.7.0+a1b2c3d`).

### Intern
- Repo nach Projektstandard: `scripts/` (Build, Standalone, Icons), `tests/`, `deploy/systemd/`, Issue- und PR-Vorlagen, `.gitattributes`, `.editorconfig`, `docs/` mit Architektur, Testcheckliste und Entscheidungen (ADRs), `CLAUDE.md`.
- Ein Befehl für alles: `scripts/build.sh` bzw. `scripts\build.ps1` (Format, Clippy, Tests, Release-Build, Standalone, Prüfsummen).
- `app.css` ist in Tokens, Schriften, Basis, Komponenten und je Ansicht aufgeteilt.

## 0.6.0 – 2026-10-25

Erste Version mit der neuen Nummerierung: Bis 1.0 zählt Event Timer als 0.x, weil sich Datenformat und Companion-Schnittstelle noch ändern dürfen. Die bisherigen Versionen 1.0 bis 1.6 heißen jetzt 0.0 bis 0.6 (1.5.3 → 0.5.3). 0.6.0 ersetzt eine laufende 1.6 wie gewohnt, gespeicherte Shows bleiben erhalten.

### Neu
- **Regie als Cockpit** (ab 1600 px Breite): Zeitleiste „Plan gegen Ist“ ganz oben, darunter drei Spalten – Agenda links, Timer in der Mitte, Kontrollseite rechts (Screens als kleine Kacheln, Talkback, Einblendung, Cues).
- **Zeitleiste** über die ganze Breite: geplante und tatsächliche bzw. vorausgesagte Programmpunkte, Jetzt-Linie, geplantes Ende, dazu Zeitkonto, Show-Ende und Gesamtdauer. Mit **T** oder Klick zuklappen (merkt sich der Browser), ohne Agenda ausgeblendet.
- **Zeitkonto mit Vorschlägen:** Die Zeitleiste zeigt, wie viel die Show vor oder hinter dem Plan liegt (geplantes gegen vorausgesagtes Show-Ende), und schlägt passende Ausgleiche vor: hinten dran einen **Puffer** kürzen (bis 5 Min. bleiben) oder den nächsten Punkt kürzen, vorne dran dem laufenden Punkt Zeit geben oder sie in den Puffer schieben. *So lassen* blendet die Vorschläge aus, bis sich das Konto um eine Minute ändert.
- **Puffer:** Programmpunkte lassen sich als Puffer markieren („darf zum Ausgleich gekürzt werden“), in der Agenda mit Etikett, in der Zeitleiste schraffiert. Die geplante Länge jedes Punkts wird beim Start der Agenda festgehalten, damit Kürzungen während der Show das Konto ausgleichen statt den Plan zu verschieben; *Agenda zurücksetzen* übernimmt die gespielten Längen als neuen Plan.
- **Nächster Punkt in der Timer-Kachel:** Trägt der gewählte Timer die Agenda, sitzt GO direkt unter den Zeit-Knöpfen, Start/Pause und Zurücksetzen als Symbol daneben, darunter „Danach“ mit Titel, Dauer, voraussichtlichem Beginn und Cues.
- **Endzeit** neben dem laufenden Countdown: „Ende 14:32“ in der Regie, auf der Moderation und auf den Screens unter den Ziffern. Pausiert „Ende ~14:35“, bei Überzeit „Ende war 14:32“ (nicht auf den Screens). Gilt für Countdowns und Hochzählen mit Limit. Pro Design abschaltbar (*Endzeit anzeigen*, Standard an).
- **Blinken bei Überzeit** in drei Stufen: *Aus*, *Sanft* und *Stark* (das bisherige harte Blinken).

### Geändert
- Regie: Uhrzeiten tragen „Uhr“ („Ende 18:34 Uhr“, „Show-Ende 19:44 Uhr“), damit sie nicht wie Dauern aussehen. Gilt auch für die Moderation; die Screens bleiben kurz.
- Regie: **+5:00** als fünfter Zeit-Knopf.
- Agenda: Ein Klick auf einen Programmpunkt öffnet ihn zum Bearbeiten. Planbeginn, verknüpfter Timer und Autostart stehen unter *Einstellungen* (zugeklappt, mit Zusammenfassung). Laden und Verschieben erscheinen im Cockpit beim Überfahren mit der Maus.
- Tastenhilfe: „Blackout alle“ statt „All Blackout“, neu **T** für die Zeitleiste.
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

### Sicherheit
- **Fremde Webseiten können die Show nicht mehr steuern.** Bisher konnte jede Webseite, die im Browser des Regie-Rechners offen war, über `localhost` Timer bedienen, Einblendungen setzen und das Programm beenden. Jetzt lehnt Event Timer Anfragen ab, die ein Browser im Auftrag einer anderen Website schickt (`Sec-Fetch-Site`, `Origin`), auch beim WebSocket.
- Die PIN-Freiheit am Rechner selbst gilt nur noch unter einem lokalen Namen (`localhost`, IP-Adresse, `*.local`, Rechnername). Das schützt vor DNS-Rebinding.
- **PIN-Sperre:** Nach 5 falschen PINs ist das Gerät 1 Minute gesperrt, über WebSocket und HTTP.
- Höchstens 32 gleichzeitige Verbindungen pro Gerät und 256 insgesamt.
- CORS (`Access-Control-Allow-Origin: *`) nur noch für lesende Endpunkte: `/api/status`, `/api/state`, `/api/companion`, `/api/companion/status`.

### Für Companion
- Keine Änderung: Companion, curl und andere Programme ohne Browser senden die geprüften Header nicht und funktionieren wie bisher, auch mit `?pin=`.

### Intern
- CI prüft `cargo fmt`, Clippy und die JavaScript-Syntax; Dependabot hält die GitHub Actions aktuell.
- Neue Tests für die Zugriffsregeln, darunter Ende-zu-Ende-Tests gegen das laufende Programm.

## 0.6.0-beta.2 – 2026-10-11 (früher 1.6.0-beta.2)

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

## 0.6.0-beta.1 – 2026-10-11 (früher 1.6.0-beta.1)

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

## 0.5.3 – 2026-10-11 (früher 1.5.3)

### Geändert
- **Cues ruhiger:** Cues stehen nicht mehr in der Alarmzone, sondern in ihrem eigenen Panel mit festem Platz. Fällige Cues sind gelb statt rot, nichts blinkt – auch nicht auf `/cues`. Cues haben keinen Ton. Die Alarmzone gehört allein den Meldungen von der Bühne.
- **Neue Talkback-Presets:** Noch 5 Minuten · Noch 1 Minute · Bitte zum Ende kommen · Bitte strecken · Keine Fragen mehr · Einspieler kommt · Mikrofon ist aus · Technisches Problem – bitte überbrücken. Eine unveränderte alte Liste wird automatisch ersetzt, eigene Listen bleiben.
- Die Timer-Art **„Ablaufplan“** und `/plan` folgen jetzt dem laufenden Ablauf (GO für GO) inklusive Pause und ± am verknüpften Timer.

### Entfernt
- Ablauf-Modus **„Automatisch nach Uhrzeit“** samt Hold, ±-Korrekturen und „Punkt jetzt beenden“. Der Ablauf läuft immer per GO; Beginn/Ende-Zeiten bleiben als Planzeiten. Gespeicherte Shows im alten Modus laufen beim ersten Start einfach manuell weiter.

## 0.5.2 – 2026-10-11 (früher 1.5.2)

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

## 0.5.1 – 2026-10-10 (früher 1.5.1)

### Neu
- `/moderation`: ganzes Programm mit laufendem Punkt, Abweichung vom Plan und **Hinweisen**; iPad im Querformat zweispaltig ohne Scrollen.
- Feld **„Hinweis für die Moderation“** pro Programmpunkt.
- **Signalton** als kräftiges Intercom-Signal mit Lautstärke, Erinnerung alle 15 s bis zur Bestätigung und Hinweis „Ton aus – klicken“.
- *Display-Link erstellen* mit Erklärung je Ansicht und Live-Vorschau.

## 0.5.0 – 2026-10-10 (früher 1.5.0)

### Neu
- **Talkback** Regie → Moderation mit Presets, Freitext und „Verstanden“.
- **Alarmzone** für Meldungen von der Bühne und fällige GO-Cues, große Uhrzeit in der Kopfzeile.
- DSM-Einblendung mit Status „LIVE auf DSM“.

### Geändert
- Neues Regie-Layout (Menü ☰, aufklappbare Optionen, Tastenkürzel auf den Knöpfen, drei Spalten ab 1600 px, Touch-Ziele ≥ 44 px), weniger runde Ecken, einheitliche professionelle Begriffe.

## 0.4.0 – 2026-10-10 (früher 1.4.0)

### Neu
- **Cue-Liste** pro Programmpunkt mit Standby/GO und Cue-Display `/cues`.
- **Rückkanal** Bühne → Regie: `/moderation` mit Schnellmeldungen und Freitext.

## 0.3.0 – 2026-10-10 (früher 1.3.0)

### Neu
- **Ablaufplan nach Uhrzeit** mit Fortschrittsbalken, `/plan` für die Moderation und Eingriffen aus der Regie (Hold, ± Minuten, Punkt jetzt beenden, ganzen Plan verschieben).

## 0.2.0 – 2026-10-10 (früher 1.2.0)

### Neu
- **Kurze Adressen** per Netzwerkname `event-timer.local`, optional ohne Portnummer (Port 80), Kurzpfade `/1`–`/8` und `/uhr`.

## 0.1.0 – 2026-10-10 (früher 1.1.0)

### Neu
- Uhrzeit-Modus und **Blinken bei Überzeit**.

## 0.0.0 – 2026-10-10 (früher 1.0.0)

- Kompletter Neubau als ein Programm in Rust mit Weboberfläche: Regie, Displays, Ablaufplan, Designs, PIN, Companion-Schnittstelle, Standalone-HTML.
