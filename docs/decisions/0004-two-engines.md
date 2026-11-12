# 0004 – Zwei Engines mit gemeinsamen Tests

- Status: angenommen
- Datum: 2026-11-05 (hält fest, was seit der ersten Version gilt)

## Kontext
Der Server muss die Show führen (mehrere Geräte, Companion, Speichern). Die Einzeldatei-Version soll aber ganz ohne Server im Browser laufen, und alle Browser sollen die Zeit selbst flüssig anzeigen.

## Entscheidung
Die Timer-Logik gibt es in Rust (`src/engine.rs`) und in JavaScript (`web/js/engine.js`). Beide werden gegen dieselben Szenarien in `tests/scenarios.json` getestet. Jede Änderung an der Logik passiert in beiden Dateien im selben Commit.

## Folgen
- Kein WebAssembly und kein Build-Schritt für die Oberfläche.
- Doppelter Pflegeaufwand, abgesichert durch die gemeinsamen Szenarien. Ein neues Verhalten bekommt zuerst ein Szenario.
