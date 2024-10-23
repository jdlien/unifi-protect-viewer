#! /bin/bash

# This script generates the icons for the app.

# Create the iconset directory if it doesn't exist
mkdir -p ../src/img/icon.iconset

# Make a copy of your original
cp ../src/img/512.png ../src/img/icon.iconset/icon_512x512@2x.png

# Generate all other sizes
sips -z 16 16     ../src/img/512.png --out ../src/img/icon.iconset/icon_16x16.png
sips -z 32 32     ../src/img/512.png --out ../src/img/icon.iconset/icon_16x16@2x.png
sips -z 32 32     ../src/img/512.png --out ../src/img/icon.iconset/icon_32x32.png
sips -z 64 64     ../src/img/512.png --out ../src/img/icon.iconset/icon_32x32@2x.png
sips -z 128 128   ../src/img/512.png --out ../src/img/icon.iconset/icon_128x128.png
sips -z 256 256   ../src/img/512.png --out ../src/img/icon.iconset/icon_128x128@2x.png
sips -z 256 256   ../src/img/512.png --out ../src/img/icon.iconset/icon_256x256.png
sips -z 512 512   ../src/img/512.png --out ../src/img/icon.iconset/icon_256x256@2x.png
sips -z 512 512   ../src/img/512.png --out ../src/img/icon.iconset/icon_512x512.png

# Convert to icns
iconutil -c icns ../src/img/icon.iconset

# Optional: remove the iconset directory after creating the icns file
rm -rf ../src/img/icon.iconset