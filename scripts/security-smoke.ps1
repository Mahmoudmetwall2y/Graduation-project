$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [bool] $Condition,
    [string] $Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Read-Text {
  param([string] $Path)
  return Get-Content -LiteralPath $Path -Raw
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

Assert-True -Condition (-not (Test-Path -LiteralPath 'env')) -Message 'A root env file exists. Use .env and keep it untracked.'

$gitignore = Read-Text '.gitignore'
Assert-True -Condition ($gitignore -match '(?m)^env$') -Message '.gitignore must ignore a root env file.'

$sessionStart = Read-Text 'frontend/src/app/api/sessions/[id]/start/route.ts'
Assert-True -Condition ($sessionStart -notmatch 'asculticor-demo-pass|fallback.*password') -Message 'Session start route contains an unsafe MQTT fallback password.'
Assert-True -Condition ($sessionStart -match 'MQTT command credentials are missing') -Message 'Session start route must fail closed when MQTT command credentials are missing.'

$healthRoute = Read-Text 'frontend/src/app/api/health/route.ts'
Assert-True -Condition ($healthRoute -match 'isDetailedHealthAuthorized') -Message 'Health route must gate detailed diagnostics.'
Assert-True -Condition ($healthRoute -match "searchParams\.get\('details'\)") -Message 'Health route must require an explicit details query.'

$devicesById = Read-Text 'frontend/src/app/api/devices/[id]/route.ts'
Assert-True -Condition ($devicesById -notmatch "allowedUpdates\s*=\s*\[[^\]]*'status'") -Message 'Device PATCH must not accept user-controlled status.'
Assert-True -Condition ($devicesById -match 'cannot be deleted') -Message 'Device DELETE must guard devices with historical sessions.'

$bootstrapRoute = Read-Text 'frontend/src/app/api/device/bootstrap/route.ts'
Assert-True -Condition ($bootstrapRoute -match 'RATE_LIMIT_WINDOW_MS') -Message 'Bootstrap endpoint must include brute-force rate limiting.'

$nginxTemplate = Read-Text 'nginx/default.cloud.conf.template'
Assert-True -Condition ($nginxTemplate -match 'location /api/inference/' -and $nginxTemplate -match 'return 404') -Message 'NGINX must not publicly proxy inference API routes.'
$nginxDefaultTemplate = Read-Text 'nginx/default.conf.template'
Assert-True -Condition ($nginxDefaultTemplate -match 'location /api/inference/' -and $nginxDefaultTemplate -match 'return 404') -Message 'Default NGINX template must not publicly proxy inference API routes.'

$deviceAuth = Read-Text 'supabase/functions/device-auth/index.ts'
Assert-True -Condition ($deviceAuth -notmatch 'device_token') -Message 'device-auth must not return unused random device tokens.'

$uploadFn = Read-Text 'supabase/functions/signed-upload-url/index.ts'
Assert-True -Condition ($uploadFn -match "\.from\('sessions'\)") -Message 'Signed upload URL function must verify session ownership.'

$downloadFn = Read-Text 'supabase/functions/signed-download-url/index.ts'
Assert-True -Condition ($downloadFn -match "\.from\('recordings'\)") -Message 'Signed download URL function must verify recording access.'

$llmRoute = Read-Text 'frontend/src/app/api/llm/route.ts'
Assert-True -Condition ($llmRoute -match 'N8N_EMAIL_PAYLOAD_EXPORT_ENABLED') -Message 'LLM queue must gate email payload export.'
Assert-True -Condition ($llmRoute -match 'email_count') -Message 'LLM queue should report counts without exposing body payloads by default.'

$navbar = Read-Text 'frontend/src/app/components/Navbar.tsx'
Assert-True -Condition ($navbar -notmatch 'href:\s*''/debug''|href:\s*"/debug"') -Message 'Navbar must not link to missing /debug route.'

$workflowGenerator = Read-Text 'n8n/generate_workflows.py'
Assert-True -Condition ($workflowGenerator -notmatch 'srv1621744\.hstgr\.cloud') -Message 'n8n generator must not hardcode the Hostinger hostname.'

$workflowFiles = Get-ChildItem -LiteralPath 'n8n/workflows' -Filter '*.json'
foreach ($file in $workflowFiles) {
  $content = Read-Text $file.FullName
  Assert-True -Condition ($content -notmatch 'srv1621744\.hstgr\.cloud') -Message "Workflow $($file.Name) must not hardcode the Hostinger hostname."
}

$migrationNames = Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{3}_' } |
  ForEach-Object { $_.Name.Substring(0, 3) }
$duplicates = $migrationNames | Group-Object | Where-Object { $_.Count -gt 1 }
Assert-True -Condition ($duplicates.Count -eq 0) -Message "Duplicate numbered migrations found: $($duplicates.Name -join ', ')"

Write-Host 'Security smoke checks passed.'
