# 0001 – Keine Abhängigkeiten

- Status: angenommen
- Datum: 2026-11-05 (hält fest, was seit der ersten Version gilt)

## Kontext
Event Timer läuft auf Rechnern, die Fremde einrichten, oft offline und im fremden Netz. Ein Update darf nicht an einer Bibliothek scheitern, und der Download soll klein bleiben.

## Entscheidung
Der Server nutzt nur die Rust-Standardbibliothek (kein Crate, `Cargo.lock` ohne Fremdpakete). HTTP, WebSocket, JSON, SHA-1, mDNS und QR-Code sind selbst geschrieben. Die Oberfläche ist reines JavaScript ohne Framework und ohne Build-Schritt.

## Folgen
- Der Build klappt offline, es gibt kein Abhängigkeits-Audit und keine Lizenzfragen bei Bibliotheken.
- Selbst geschriebene Parser brauchen eigene Robustheitstests (kaputte, zu große, unvollständige Eingaben).
- Kein Logging-Crate (`tracing`): `logx.rs` schreibt das Log selbst. Das weicht vom Projektstandard ab und ist bewusst so.
- Ausnahmen (Schriften, Icons) sind Daten, kein Code. Sie werden unverändert eingebettet, ihre Lizenzen liegen in `web/licenses/`.
