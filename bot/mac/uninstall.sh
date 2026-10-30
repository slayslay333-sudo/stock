#!/bin/bash
# 자동 실행 끄기 (프로그램과 비밀값은 그대로 둠)
for n in weekly order; do F="$HOME/Library/LaunchAgents/com.nawa.stock.$n.plist"; launchctl bootout "gui/$(id -u)" "$F" 2>/dev/null; rm -f "$F"; echo "해제: $n"; done
