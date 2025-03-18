#!/bin/bash
set -e

# Paths must be properly quoted to handle spaces
APP_PATH="/Users/jdlien/code/unifi-protect-viewer/builds/UniFi Protect Viewer-darwin-arm64/UniFi Protect Viewer.app"
ENTITLEMENTS="/Users/jdlien/code/unifi-protect-viewer/entitlements.plist"
IDENTITY="Developer ID Application: Joseph Lien (A93Q7MKECL)"

echo "Signing app bundle: $APP_PATH"

# Thoroughly remove existing signatures
echo "Removing existing signatures..."
xattr -cr "$APP_PATH"

# Remove signatures from all binary and framework files
echo "Removing signatures from all components..."
find "$APP_PATH" -type f \( -name "*.dylib" -o -name "*.so" -o -path "*/Frameworks/*" \) | while read -r file; do
  codesign --remove-signature "$file" 2>/dev/null || true
done

# Remove signature from helper apps
find "$APP_PATH" -name "*.app" -type d | while read -r helper; do
  codesign --remove-signature "$helper" 2>/dev/null || true
done

# Remove signature from the main app
codesign --remove-signature "$APP_PATH" 2>/dev/null || true

echo "All existing signatures removed."

# Sign all the dynamic libraries EXCEPT problematic ones
echo "Signing dynamic libraries..."
find "$APP_PATH" -name "*.dylib" -type f | grep -v "libEGL\.dylib" | grep -v "libGLESv2\.dylib" | while read -r lib; do
  codesign --force --sign "$IDENTITY" --timestamp --options runtime "$lib"
done

# Sign all the frameworks EXCEPT Electron Framework (which contains problematic dylibs)
echo "Signing frameworks..."
find "$APP_PATH/Contents/Frameworks" -name "*.framework" -type d | grep -v "Electron Framework.framework" | while read -r framework; do
  codesign --force --sign "$IDENTITY" --timestamp --options runtime "$framework"
done

# Now sign Electron Framework with special handling
echo "Signing Electron Framework with special handling..."
codesign --force --sign "$IDENTITY" --options runtime --timestamp --no-strict "$APP_PATH/Contents/Frameworks/Electron Framework.framework"

# Sign all the helper apps
echo "Signing helper apps..."
find "$APP_PATH/Contents/Frameworks" -name "*.app" -type d | while read -r helper; do
  codesign --force --timestamp --options runtime --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$helper"
done

# Sign the main app
echo "Signing main app..."
codesign --force --timestamp --options runtime --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$APP_PATH"

# Final verification with less strict requirements
echo "Verifying signature (with --no-strict)..."
codesign --verify --no-strict --verbose "$APP_PATH"

echo "Signing completed!"
exit 0
