# Fyndue - one-shot local setup for Windows (PowerShell 5+ or pwsh 7).
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
#
# Installs what is missing (Node.js LTS, pnpm) with winget, uses an existing
# PostgreSQL 16 or a bundled one from npm, creates the fyndue / fyndue_test databases, writes .env, installs
# dependencies, migrates, seeds demo data and starts the dev server.
# Safe to re-run: every step skips work that is already done.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Has "winget")) {
  throw "winget is not available. Install 'App Installer' from the Microsoft Store, then re-run this script."
}

# -- Node.js -------------------------------------------------------------------
Step "Checking Node.js (needs v22+)"
$nodeOk = $false
if (Has "node") { $nodeOk = ([int]((node -v).TrimStart("v").Split(".")[0]) -ge 22) }
if (-not $nodeOk) {
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
}
Write-Host "Node $(node -v)"

# -- pnpm ----------------------------------------------------------------------
Step "Checking pnpm"
if (-not (Has "pnpm")) {
  npm install -g pnpm
  Refresh-Path
}
Write-Host "pnpm $(pnpm -v)"

# -- PostgreSQL -----------------------------------------
# Uses an existing PostgreSQL 16 install if there is one; otherwise runs a
# private PostgreSQL shipped through npm (no installer download needed).
Step "Checking PostgreSQL"
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$useSystemPg = Test-Path "$pgBin\psql.exe"

Step "Installing dependencies"
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

if ($useSystemPg) {
  $secure = Read-Host "PostgreSQL 16 is installed. Enter the password of the 'postgres' user" -AsSecureString
  $pgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $pgPort = 5432
  $env:PGPASSWORD = $pgPassword
  foreach ($db in @("fyndue", "fyndue_test")) {
    $exists = & "$pgBin\psql.exe" -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
    if ($LASTEXITCODE -ne 0) { throw "Could not connect to PostgreSQL - check the password and that the service is running." }
    if ($exists -ne "1") { & "$pgBin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE $db;" | Out-Null }
  }
  Remove-Item Env:\PGPASSWORD
} else {
  $pgPassword = "fyndue-local"
  $pgPort = 5433
  Write-Host "No system PostgreSQL found - starting the bundled one in a separate window (keep it open)."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title Fyndue database && pnpm db:local" -WorkingDirectory (Get-Location)
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $tcp = New-Object Net.Sockets.TcpClient
      $tcp.Connect("127.0.0.1", $pgPort)
      $tcp.Close(); $ready = $true; break
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $ready) { throw "The database window did not start. Look at the 'Fyndue database' window for the error." }
  Start-Sleep -Seconds 3  # let it finish creating the databases
}

# -- .env -----------------------------------------------
Step "Writing .env"
$encodedPw = [Uri]::EscapeDataString($pgPassword)
$dbUrl = "postgresql://postgres:$encodedPw@localhost:$pgPort/fyndue"
$current = if (Test-Path ".env") { Get-Content ".env" -Raw } else { "" }
$secretMatch = [regex]::Match($current, 'BETTER_AUTH_SECRET="([^"]{32,})"')
if ($secretMatch.Success) {
  $secret = $secretMatch.Groups[1].Value
} else {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
}
@"
DATABASE_URL="$dbUrl"
TEST_DATABASE_URL="postgresql://postgres:$encodedPw@localhost:$pgPort/fyndue_test"
BETTER_AUTH_SECRET="$secret"
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ALLOW_REGISTRATION="true"
"@ | Set-Content -Path ".env" -Encoding ascii
Write-Host ".env written (database on port $pgPort)"

# -- App -----------------------------------------------------------------------
Step "Applying database migrations"
pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "Migration failed" }

Step "Seeding demo data"
pnpm db:seed
if ($LASTEXITCODE -ne 0) { throw "Seeding failed" }

Step "Starting Fyndue at http://localhost:3000  (login: demo@fyndue.dev / fyndue-demo-2026, Ctrl+C to stop)"
Start-Job { Start-Sleep 8; Start-Process "http://localhost:3000" } | Out-Null
pnpm dev
