# 0002 – Release-Builds per GitHub Actions

- Status: angenommen
- Datum: 2026-10-25

## Kontext
Der Projektstandard sieht lokale Builds vor. Event Timer erscheint aber für Windows, macOS (Apple Silicon und Intel), Linux x64, Raspberry Pi (arm64, armv7) und als Einzeldatei. Das lokal zu bauen, braucht mehrere Rechner bzw. Cross-Toolchains.

## Entscheidung
`.github/workflows/build.yml` baut die Release-Artefakte. PRs bauen nur Linux x64 (schnelle Kontrolle), `main` und Tags bauen alle Plattformen. Ein Tag `vX.Y.Z` erzeugt ein GitHub-Release mit dem Text aus dem CHANGELOG.

## Folgen
- Die exe kommt nicht mehr vom eigenen Rechner, sondern als Artefakt bzw. Release.
- Lokal reicht `scripts/build.sh --check` vor jedem Commit.
- Vor einem Release läuft das fertige Artefakt einmal auf einem sauberen System (siehe `docs/TESTING.md`).
