$ErrorActionPreference = 'Stop'
$dataDirectory = Join-Path $PSScriptRoot 'data'
if (Test-Path -LiteralPath $dataDirectory) {
    New-Item -ItemType File -Path (Join-Path $dataDirectory 'stop-request') -Force | Out-Null
    Write-Host 'Shutdown requested. Wait five seconds before moving the project folder.'
}
