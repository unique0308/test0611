$ErrorActionPreference = "Stop"

Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

if (-not $env:HTTPS_PROXY -and -not $env:https_proxy) {
  $proxyPortOpen = Test-NetConnection -ComputerName 127.0.0.1 -Port 7890 -InformationLevel Quiet
  if ($proxyPortOpen) {
    $env:HTTPS_PROXY = "http://127.0.0.1:7890"
    $env:HTTP_PROXY = "http://127.0.0.1:7890"
  }
}

npm run dev
