#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Adds Event Timer with its icon to the application menu (current user only).
# The program itself stays in this folder; its data file is saved next to it.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"
mkdir -p "$APPS" "$ICONS"
cp "$DIR/event-timer.png" "$ICONS/event-timer.png"
cat > "$APPS/event-timer.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Event Timer
Comment=Countdown, Ablaufplan und Talkback für Bühne und Regie
Exec="$DIR/event-timer"
Icon=event-timer
Terminal=false
Categories=AudioVideo;Utility;
DESKTOP
chmod +x "$DIR/event-timer"
echo "Event Timer ist jetzt im Anwendungsmenü."
