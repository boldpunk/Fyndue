# Fyndue — one-shot local setup for Windows (PowerShell 5+ or pwsh 7).
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
#
# Installs what is missing (Node.js LTS, pnpm, PostgreSQL 16) with winget,
# creates the fyndue / fyndue_test databases, writes .env, installs
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

# ── Node.js ───────────────────────────────────────────────────────────────────
Step "Checking Node.js (needs v22+)"
$nodeOk = $false
if (Has "node") { $nodeOk = ([int]((node -v).TrimStart("v").Split(".")[0]) -ge 22) }
if (-not $nodeOk) {
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
}
Write-Host "Node $(node -v)"

# ── pnpm ──────────────────────────────────────────────────────────────────────
Step "Checking pnpm"
if (-not (Has "pnpm")) {
  npm install -g pnpm
  Refresh-Path
}
Write-Host "pnpm $(pnpm -v)"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
Step "Checking PostgreSQL 16"
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$pgPassword = $null
if (-not (Test-Path "$pgBin\psql.exe")) {
  $pgPassword = "fyndue-local"
  Write-Host "Installing PostgreSQL 16 (password for user 'postgres' will be '$pgPassword')..."
  winget install --id PostgreSQL.PostgreSQL.16 -e --accept-source-agreements --accept-package-agreements `
    --override "--mode unattended --unattendedmodeui none --superpassword $pgPassword --serverport 5432"
  if (-not (Test-Path "$pgBin\psql.exe")) { throw "PostgreSQL install did not finish. Re-run the script." }
} else {
  $secure = Read-Host "PostgreSQL is already installed. Enter the password of the 'postgres' user" -AsSecureString
  $pgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$env:PGPASSWORD = $pgPassword
foreach ($db in @("fyndue", "fyndue_test")) {
  $exists = & "$pgBin\psql.exe" -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
  if ($LASTEXITCODE -ne 0) { throw "Could not connect to PostgreSQL — check the password and that the service is running." }
  if ($exists -ne "1") {
    & "$pgBin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE $db;" | Out-Null
    Write-Host "Created database $db"
  } else {
    Write-Host "Database $db already exists"
  }
}
Remove-Item Env:\PGPASSWORD

# ── .env ──────────────────────────────────────────────────────────────────────
Step "Writing .env"
$envFile = ".env"
$hasRealEnv = (Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^BETTER_AUTH_SECRET="[^"]{32,}"' -Quiet)
if ($hasRealEnv) {
  Write-Host ".env already configured — leaving it as is"
} else {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $encodedPw = [Uri]::EscapeDataString($pgPassword)
  @"
DATABASE_URL="postgresql://postgres:$encodedPw@localhost:5432/fyndue"
TEST_DATABASE_URL="postgresql://postgres:$encodedPw@localhost:5432/fyndue_test"
BETTER_AUTH_SECRET="$secret"
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ALLOW_REGISTRATION="true"
"@ | Set-Content -Path $envFile -Encoding ascii
  Write-Host ".env written"
}

# ── App ───────────────────────────────────────────────────────────────────────
Step "Installing dependencies"
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

Step "Applying database migrations"
pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "Migration failed" }

Step "Seeding demo data"
pnpm db:seed
if ($LASTEXITCODE -ne 0) { throw "Seeding failed" }

Step "Starting Fyndue at http://localhost:3000  (login: demo@fyndue.dev / fyndue-demo-2026, Ctrl+C to stop)"
Start-Job { Start-Sleep 8; Start-Process "http://localhost:3000" } | Out-Null
pnpm dev
