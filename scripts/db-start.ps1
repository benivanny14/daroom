# Starts the local DarRoom PostgreSQL cluster (not registered as a Windows service).
$ErrorActionPreference = "Stop"

function Find-PgCtl {
  $candidates = @()
  $command = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }
  if ($env:DARROOM_PG_BIN) { $candidates += (Join-Path $env:DARROOM_PG_BIN "pg_ctl.exe") }
  $candidates += @(
    "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe",
    "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  throw "pg_ctl.exe not found. Install PostgreSQL or set DARROOM_PG_BIN to its bin folder."
}

$dataDir = if ($env:DARROOM_PGDATA) { $env:DARROOM_PGDATA } else { Join-Path $env:LOCALAPPDATA "DarRoom\pgdata" }
$logFile = Join-Path (Split-Path -Parent $dataDir) "postgres.log"

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  throw "No PostgreSQL cluster found at $dataDir. Create one with initdb before running this script."
}

$pgCtl = Find-PgCtl
& $pgCtl -D $dataDir status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "DarRoom database is already running."
  exit 0
}

& $pgCtl -D $dataDir -l $logFile start
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start the DarRoom database. See $logFile"
}

$port = (Select-String -Path (Join-Path $dataDir "postgresql.conf") -Pattern '^\s*port\s*=\s*(\d+)' |
  Select-Object -Last 1).Matches.Groups[1].Value
Write-Host "DarRoom database started on 127.0.0.1:$port."
