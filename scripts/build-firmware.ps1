param(
  [string]$Sketch = "firmware/asculticor_esp32/AscultiCor_esp32/AscultiCor_esp32.ino",
  [string]$Fqbn = "esp32:esp32:esp32:PartitionScheme=custom",
  [string]$Version = "3.1.2"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildDir = Join-Path $root "firmware/build"
$releaseDir = Join-Path $root "firmware/releases"
$publicDir = Join-Path $root "frontend/public/firmware"

New-Item -ItemType Directory -Force -Path $buildDir, $releaseDir, $publicDir | Out-Null

if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  Write-Host "arduino-cli not found locally — falling back to Docker firmware-builder."
  Write-Host "Running: docker compose run --rm firmware-builder"
  Push-Location $root
  try {
    docker compose run --rm firmware-builder
  } finally {
    Pop-Location
  }
  Write-Host "Done. Binaries are in the firmware_public Docker volume and served by the frontend."
  exit 0
}

Push-Location $root
try {
  arduino-cli compile --fqbn $Fqbn --export-binaries --output-dir $buildDir $Sketch

  $appBin = Get-ChildItem -Path $buildDir -Filter "*.bin" -Recurse |
    Where-Object { $_.Name -notmatch "bootloader|partitions|merged" } |
    Select-Object -First 1
  $bootloader = Get-ChildItem -Path $buildDir -Filter "*bootloader*.bin" -Recurse | Select-Object -First 1
  $partitions = Get-ChildItem -Path $buildDir -Filter "*partitions*.bin" -Recurse | Select-Object -First 1

  if (-not $appBin -or -not $bootloader -or -not $partitions) {
    throw "Compile succeeded, but one or more required binaries were not found in $buildDir."
  }

  Copy-Item $appBin.FullName (Join-Path $releaseDir "asculticor_esp32_v$Version.bin") -Force
  Copy-Item $bootloader.FullName (Join-Path $releaseDir "bootloader.bin") -Force
  Copy-Item $partitions.FullName (Join-Path $releaseDir "partitions.bin") -Force

  Copy-Item (Join-Path $releaseDir "asculticor_esp32_v$Version.bin") $publicDir -Force
  Copy-Item (Join-Path $releaseDir "bootloader.bin") $publicDir -Force
  Copy-Item (Join-Path $releaseDir "partitions.bin") $publicDir -Force

  Write-Host "Firmware release binaries copied to firmware/releases and frontend/public/firmware."
}
finally {
  Pop-Location
}
