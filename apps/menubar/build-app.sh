#!/bin/bash
# 构建 Agentosity.app(menu bar 应用,LSUIElement 无 Dock 图标)
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release

APP=dist/Agentosity.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/AgentosityBar "$APP/Contents/MacOS/Agentosity"
[ -f AppIcon.icns ] && cp AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

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
  <key>CFBundleIconFile</key><string>AppIcon</string>
</dict>
</plist>
PLIST

# 有 Developer ID 证书就正式签名(硬化运行时 + 时间戳,公证的前提),否则 ad-hoc
DEV_ID="Developer ID Application: Ethan Yang (UTR5A48B54)"
if security find-identity -p codesigning -v 2>/dev/null | grep -q "$DEV_ID"; then
  # Apple 时间戳服务偶发不可用:重试,绝不落一个未签名产物
  ok=0
  for i in 1 2 3 4 5; do
    if codesign --force --options runtime --timestamp --sign "$DEV_ID" "$APP"; then ok=1; break; fi
    echo "codesign attempt $i failed (timestamp service?), retrying…"; sleep 15
  done
  [ "$ok" = "1" ] || { echo "❌ signing failed after retries"; exit 1; }
  echo "signed: Developer ID"
  # --notarize:上传 Apple 公证 + 钉票(凭证在钥匙串 profile agentosity-notary)
  if [ "${1:-}" = "--notarize" ]; then
    ditto -c -k --keepParent "$APP" "$APP.zip"
    NOUT=$(xcrun notarytool submit "$APP.zip" --keychain-profile agentosity-notary --wait)
    echo "$NOUT" | grep -q "status: Accepted" || { echo "❌ notarization not accepted"; echo "$NOUT" | tail -3; exit 1; }
    xcrun stapler staple "$APP"
    ditto -c -k --keepParent "$APP" "$APP.zip"  # 重打包含票版本
    # DMG:mac 标准分发形态(拖进 Applications 的那个框)
    DMGDIR=$(mktemp -d)
    cp -R "$APP" "$DMGDIR/"
    ln -s /Applications "$DMGDIR/Applications"
    rm -f dist/Agentosity.dmg
    hdiutil create -volname "Agentosity" -srcfolder "$DMGDIR" -ov -format UDZO dist/Agentosity.dmg -quiet
    codesign --force --sign "$DEV_ID" dist/Agentosity.dmg || echo "(dmg 签名失败,不致命:内容物已签,公证以下面为准)"
    DOUT=$(xcrun notarytool submit dist/Agentosity.dmg --keychain-profile agentosity-notary --wait)
    echo "$DOUT" | grep -q "status: Accepted" || { echo "❌ dmg notarization not accepted"; echo "$DOUT" | tail -3; exit 1; }
    xcrun stapler staple dist/Agentosity.dmg
    rm -rf "$DMGDIR"
    echo "notarized + stapled: $APP.zip + dist/Agentosity.dmg"
  fi
else
  codesign --force --sign - "$APP" 2>/dev/null || true
  echo "signed: ad-hoc"
fi
echo "✅ built: apps/menubar/$APP"
