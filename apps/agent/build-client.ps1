# Build GSDesk client - browser UI (no WebView2 required)
$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $AgentDir "..\..")
Set-Location $RootDir

$gcc = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $gcc) {
    $candidates = @(
        "$env:USERPROFILE\scoop\apps\mingw\current\bin\gcc.exe",
        "C:\msys64\mingw64\bin\gcc.exe",
        "C:\TDM-GCC-64\bin\gcc.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) {
            $env:Path = (Split-Path $path) + ";" + $env:Path
            $gcc = Get-Command gcc -ErrorAction SilentlyContinue
            break
        }
    }
}
if (-not $gcc) {
    Write-Host "GCC (MinGW) not found. Install MSYS2 and add mingw64/bin to PATH (needed for system tray)." -ForegroundColor Red
    exit 1
}

Write-Host "Building shared UI..." -ForegroundColor Cyan
$env:VITE_EMBED = "1"
npm run build -w @gsdesk/web

$UiDest = Join-Path $AgentDir "internal\appui\ui\dist"
Write-Host "Sync UI to $UiDest" -ForegroundColor Cyan
if (Test-Path $UiDest) { Remove-Item -Recurse -Force $UiDest }
New-Item -ItemType Directory -Force -Path $UiDest | Out-Null
Copy-Item -Recurse -Force (Join-Path $RootDir "apps\web\dist\*") $UiDest

Set-Location $AgentDir
$rsrc = Join-Path (go env GOPATH) "bin\rsrc.exe"
if (-not (Test-Path $rsrc)) {
    go install github.com/akavel/rsrc@latest
}
& $rsrc -manifest app.manifest -o rsrc.syso

$env:CGO_ENABLED = "1"
go build -ldflags "-H windowsgui" -o gsdesk-client.exe .
Write-Host "Built: $AgentDir\gsdesk-client.exe" -ForegroundColor Green
Write-Host "UI: system browser at http://127.0.0.1:19527 (no WebView2 install)" -ForegroundColor Cyan
Write-Host "First run: open http://127.0.0.1:19527 and configure API/token in Settings" -ForegroundColor Cyan
