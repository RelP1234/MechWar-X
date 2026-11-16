$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeRuntime = Join-Path $projectRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodeRuntime)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js is missing. Use the complete Windows Run Kit.' }
    $nodeRuntime = $nodeCommand.Source
}
$appPort = 3080
$appUrl = "http://127.0.0.1:$appPort"
try {
    $existing = Invoke-RestMethod "$appUrl/api/state" -TimeoutSec 2
    if ($null -ne $existing.mechs) { Start-Process $appUrl; exit }
} catch { }
$logDirectory = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$entryFile = Join-Path $projectRoot 'server.mjs'
Start-Process -FilePath $nodeRuntime -ArgumentList ('"' + $entryFile + '"') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'server.log') `
    -RedirectStandardError (Join-Path $logDirectory 'server-error.log') | Out-Null
for ($attempt=0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod "$appUrl/api/state" -TimeoutSec 1
        if ($null -ne $health.mechs) { Start-Process $appUrl; exit }
    } catch { }
}
throw 'Startup did not complete. Open data\server-error.log for the error. Do not delete the data folder.'
