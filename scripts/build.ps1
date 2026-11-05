# One command for everything on Windows: format check, lint, tests, release build.
#   scripts\build.ps1           check + build → dist\
#   scripts\build.ps1 -Check    only checks and tests
#   scripts\build.ps1 -Clean    cargo clean first
param([switch]$Check, [switch]$Clean)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Log($m) { Write-Host ("{0} INF [build] {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'), $m) }
function Run($cmd, $argList) {
  & $cmd @argList
  if ($LASTEXITCODE -ne 0) { throw "$cmd $($argList -join ' ') fehlgeschlagen (Exitcode $LASTEXITCODE)" }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'cargo fehlt – Rust installieren: https://rustup.rs' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node fehlt – Node.js 22 installieren' }
if ($Clean) { Log 'cargo clean'; Run cargo @('clean') }

$V = (Select-String -Path Cargo.toml -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1).Matches.Groups[1].Value
Log "Event Timer $V"

Log 'Format';     Run cargo @('fmt', '--check')
Log 'Clippy';     Run cargo @('clippy', '--all-targets', '--locked', '--', '-D', 'warnings')
Log 'JS-Syntax';  Get-ChildItem web\js\*.js, scripts\*.js, tests\*.js | ForEach-Object { Run node @('--check', $_.FullName) }
Log 'Rust-Tests'; Run cargo @('test', '--locked', '--quiet')
Log 'JS-Engine';  Run node @('tests\engine.test.js')
if ($Check) { Log 'Checks grün'; exit 0 }

Log 'Release-Build'; Run cargo @('build', '--release', '--locked')
New-Item -ItemType Directory -Force dist | Out-Null
$out = "dist\event-timer-$V-windows-x64.exe"
Copy-Item target\release\event-timer.exe $out -Force
Log 'Standalone'; Run node @('scripts\build-standalone.js')
Move-Item dist\event-timer-standalone.html "dist\event-timer-$V-standalone.html" -Force
Get-FileHash $out, "dist\event-timer-$V-standalone.html" -Algorithm SHA256 |
  ForEach-Object { '{0}  {1}' -f $_.Hash.ToLower(), (Split-Path $_.Path -Leaf) } |
  Set-Content dist\SHA256SUMS.txt -Encoding utf8
Log "fertig: $out"
