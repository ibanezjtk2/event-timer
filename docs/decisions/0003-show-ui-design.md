# 0003 – Design nach Show-UI

- Status: angenommen
- Datum: 2026-11-05

## Kontext
Bis 0.6 hatte Event Timer ein eigenes Aussehen mit Systemschriften und eigenen Icons. Felix nutzt für alle Show-Werkzeuge ein gemeinsames Design-System, Show-UI.

## Entscheidung
Ab 0.7.0 folgt die Oberfläche Show-UI:
- Tokens in `web/css/tokens.css` (Version `show-ui tokens v1`), dunkles und helles Theme, Wechsel nur über `data-theme`. Komponenten-CSS enthält keine Farbwerte.
- Schriften eingebettet: IBM Plex Sans (500/600/700), Plex Sans Condensed (600), Plex Mono (500) und D-DIN Bold nur für Ziffern. Ziffern stehen in festen Zellen (0,54 em, Doppelpunkt 0,3 em).
- Icons: Phosphor (Bold, Fill für aktiv), inline aus `web/js/icons.js`.
- Signalfarben mit genau einer Bedeutung: Grün läuft, Gelb Vorwarnung, Rot Kritisch, Überzeit, Fehler und *live*. Cyan für Auswahl, Fokus, Info und Talkback.
- Aktiv = 14 % Tönung plus 3-px-Kante links, ausgewählt = 2-px-Cyan-Kontur. Primär-Buttons invertiert.
- Screens sind immer dunkel und nutzen eigene Display-Tokens, die ein Design überschreiben kann.
- Logo „fs“: Dateien aus Show-UI, kopiert und nie nachgezeichnet.

## Folgen
- Eine Einblendung, die *live* ist, wird in der Regie rot statt gelb markiert (Gelb bleibt der Vorwarnung).
- Das Programm wird um die Schriften größer (rund 1,5 MB statt unter 1 MB).
- Ändern sich Show-UI-Tokens, wird `tokens.css` nachgezogen.
