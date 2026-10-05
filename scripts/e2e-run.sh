#!/usr/bin/env bash
# Runs the Maestro suite against the already-booted emulator/device and ALWAYS leaves a logcat dump
# behind (also when a flow fails). Used by .github/workflows/e2e.yml; handy locally too.
# Usage: scripts/e2e-run.sh path/to/app.apk
set -u
APK="${1:?usage: e2e-run.sh <apk>}"
export PATH="$HOME/.maestro/bin:$PATH"

mkdir -p screenshots
adb wait-for-device
adb install -r "$APK" || { echo "APK install failed"; exit 1; }
adb logcat -c || true

maestro test .maestro/ --format junit --output report.xml
status=$?

adb logcat -d -v threadtime > logcat.txt || true
adb shell screencap -p /sdcard/final.png >/dev/null 2>&1 && adb pull /sdcard/final.png screenshots/zz-final-screen.png >/dev/null 2>&1 || true
exit $status
