# Builds OpenLite Mobile: the PC client's plugins (scripts/sync-plugins.mjs)
# and the web bundle into the app's assets, then the APK
# (android\app\build\outputs\apk\debug\app-debug.apk). With -Install, puts
# it on the phone connected over USB (USB debugging on). With -Release,
# publishes it as OpenLite.apk on the GitHub release "latest", where new
# devices install it from:
# https://github.com/OblongNoodle/OpenLite-Mobile/releases/latest/download/OpenLite.apk
param([switch]$Install, [switch]$Release)
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
node "$PSScriptRoot\scripts\sync-plugins.mjs"
if ($LASTEXITCODE) { throw "plugin sync failed" }
Push-Location "$PSScriptRoot\web"
npx vite build
if ($LASTEXITCODE) { throw "web build failed" }
Pop-Location
Push-Location "$PSScriptRoot\android"
# Version codes count up with time, so each build installs over the last.
$versionCode = [int]((Get-Date).ToUniversalTime() - [datetime]"2026-10-01").TotalMinutes
.\gradlew.bat assembleDebug -q "-PopenliteVersionCode=$versionCode"
if ($LASTEXITCODE) { throw "app build failed" }
Pop-Location
$apk = "$PSScriptRoot\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "Built $apk"
if ($Install) {
    & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r $apk
}
if ($Release) {
    $notes = "Install OpenLite.apk on an Android phone or tablet. On first launch it downloads the OSRS cache; its plugins come from the PC client and update by themselves. Built $(Get-Date -Format 'yyyy-MM-dd HH:mm')."
    $published = Join-Path $env:TEMP "OpenLite.apk"
    Copy-Item $apk $published -Force
    gh release view latest -R OblongNoodle/OpenLite-Mobile *> $null
    if ($LASTEXITCODE) {
        gh release create latest $published -R OblongNoodle/OpenLite-Mobile --title "OpenLite Mobile" --notes $notes
    } else {
        gh release upload latest $published -R OblongNoodle/OpenLite-Mobile --clobber
        gh release edit latest -R OblongNoodle/OpenLite-Mobile --notes $notes
    }
    Write-Host "Published https://github.com/OblongNoodle/OpenLite-Mobile/releases/latest/download/OpenLite.apk"
}
