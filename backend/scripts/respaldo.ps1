param(
  [string]$Destino = "$PSScriptRoot\..\respaldos",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [int]$DiasRetencion = 30
)

$ErrorActionPreference = "Stop"
$raiz = Resolve-Path "$PSScriptRoot\.."
$linea = Get-Content "$raiz\.env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $linea) { throw "No se encontró DATABASE_URL en .env" }
$url = $linea -replace '^DATABASE_URL=', ''

$sello = Get-Date -Format "yyyyMMdd-HHmmss"
$carpeta = Join-Path $Destino $sello
New-Item -ItemType Directory -Path $carpeta -Force | Out-Null

& "$PgBin\pg_dump.exe" --dbname="$url" --format=custom --file="$carpeta\base.dump"
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló" }

foreach ($sub in @("evidencias", "miniaturas")) {
  $origen = Join-Path $raiz "storage\$sub"
  if (Test-Path $origen) { Copy-Item -Recurse $origen (Join-Path $carpeta $sub) }
}

Get-ChildItem $Destino -Directory |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$DiasRetencion) } |
  Remove-Item -Recurse -Force

Write-Host "Respaldo creado en $carpeta"