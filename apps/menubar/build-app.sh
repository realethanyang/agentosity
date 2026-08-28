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

# 有 Developer ID 证书就正式签名(硬化运行时 + 时间戳,公证的前提),否则 ad-hoc
DEV_ID="Developer ID Application: Ethan Yang (UTR5A48B54)"
if security find-identity -p codesigning -v 2>/dev/null | grep -q "$DEV_ID"; then
  codesign --force --options runtime --timestamp --sign "$DEV_ID" "$APP"
  echo "signed: Developer ID"
  # --notarize:上传 Apple 公证 + 钉票(凭证在钥匙串 profile agentosity-notary)
  if [ "${1:-}" = "--notarize" ]; then
    ditto -c -k --keepParent "$APP" "$APP.zip"
    xcrun notarytool submit "$APP.zip" --keychain-profile agentosity-notary --wait
    xcrun stapler staple "$APP"
    ditto -c -k --keepParent "$APP" "$APP.zip"  # 重打包含票版本
    echo "notarized + stapled: $APP.zip"
  fi
else
  codesign --force --sign - "$APP" 2>/dev/null || true
  echo "signed: ad-hoc"
fi
echo "✅ built: apps/menubar/$APP"
