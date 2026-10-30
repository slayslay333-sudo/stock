#!/bin/bash
# 맥미니 설치: 이 저장소를 받은 뒤 bot/mac/install.sh 실행
# 하는 일: 노드 확인 → 비밀값 폴더 만들기 → 알파 밴티지 키 저장 → 자동 실행 2개 등록 → 시험 실행
set -e
BOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "프로그램 위치: $BOT"
command -v node >/dev/null || { echo "노드가 없습니다. https://nodejs.org 에서 맥용 설치 파일(LTS)을 받아 설치한 뒤 다시 실행하세요."; exit 1; }
NV=$(node -p "process.versions.node.split('.')[0]"); [ "$NV" -ge 18 ] || { echo "노드 18 이상이 필요합니다 (지금 $NV)"; exit 1; }
mkdir -p "$HOME/.kis" "$BOT/logs"; chmod 700 "$HOME/.kis"
if [ ! -s "$HOME/.kis/alphavantage.txt" ]; then
  read -r -p "알파 밴티지 무료 키를 붙여 넣고 엔터: " K; printf '%s' "$K" > "$HOME/.kis/alphavantage.txt"; chmod 600 "$HOME/.kis/alphavantage.txt"; fi
NODEDIR="$(dirname "$(command -v node)")"; P="$NODEDIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for n in weekly order; do
  DST="$HOME/Library/LaunchAgents/com.nawa.stock.$n.plist"
  sed -e "s#__BOT__#$BOT#g" -e "s#__PATH__#$P#g" "$BOT/mac/$n.plist" > "$DST"
  plutil -lint "$DST" >/dev/null
  launchctl bootout "gui/$(id -u)" "$DST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$DST"
  echo "자동 실행 등록: $n"; done
readlink /etc/localtime | grep -q Seoul || echo "※ 맥 시간대가 서울이 아닙니다. 시스템 설정 → 일반 → 날짜 및 시간에서 서울로 바꾸세요 (예약 시간이 틀어짐)"
echo "시험 실행(사이트에는 올리지 않음)…"
NO_GIT=1 "$BOT/run_weekly.sh" && echo "설치 완료. 매주 토 08:43 주간 실행, 화 00:05 주문 확인." || echo "시험 실행 실패 — logs 폴더를 확인하세요"
