#!/bin/sh
# Restarts OpenLite on the USB-connected phone and forwards its WebView's
# DevTools to localhost:9223 (node ../HighLite-RE/tools/cdp.js with CDP_PORT=9223).
export MSYS_NO_PATHCONV=1
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$ADB" shell am force-stop dev.openlite.mobile
"$ADB" shell am start -n dev.openlite.mobile/.MainActivity >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do
  PID=$("$ADB" shell pidof dev.openlite.mobile)
  [ -n "$PID" ] && "$ADB" shell cat /proc/net/unix | grep -q "webview_devtools_remote_$PID" && break
  ping -n 2 127.0.0.1 >/dev/null
done
"$ADB" forward tcp:9223 localabstract:webview_devtools_remote_$PID >/dev/null && echo "forwarded pid $PID"
