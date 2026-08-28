#!/bin/bash
# 构建 Agentosity.app(menu bar 应用,LSUIElement 无 Dock 图标)
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release

APP=dist/Agentosity.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp .build/release/AgentosityBar "$APP/Contents/MacOS/Agentosity"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Agentosity</string>
  <key>CFBundleIdentifier</key><string>com.agentosity.menubar</string>
  <key>CFBundleExecutable</key><string>Agentosity</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP" 2>/dev/null || true
echo "✅ built: apps/menubar/$APP"
