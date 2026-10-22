# Builds OpenLite Mobile: the PC client's plugins (scripts/sync-plugins.mjs)
# and the web bundle into the app's assets, then the APK
# (android\app\build\outputs\apk\debug\app-debug.apk). With -Install, puts
# it on the phone connected over USB (USB debugging on).
param([switch]$Install)
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
node "$PSScriptRoot\scripts\sync-plugins.mjs"
if ($LASTEXITCODE) { throw "plugin sync failed" }
Push-Location "$PSScriptRoot\web"
npx vite build
if ($LASTEXITCODE) { throw "web build failed" }
Pop-Location
Push-Location "$PSScriptRoot\android"
.\gradlew.bat assembleDebug -q
if ($LASTEXITCODE) { throw "app build failed" }
Pop-Location
$apk = "$PSScriptRoot\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "Built $apk"
if ($Install) {
    & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r $apk
}
