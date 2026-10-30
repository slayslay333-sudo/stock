#!/bin/bash
# 맥미니 매주 화요일 0시 5분(한국 시간 · 미국 월요일 장 중): 가상계좌 '목표 보유'대로 한투 계좌에 주문
# 안전장치: ~/.kis/kis.json 에 "auto": true 가 있어야만 실제 주문. 없으면 확인만.
set -u
cd "$(dirname "$0")"; LOG="$(pwd)/logs"; mkdir -p "$LOG"; L="$LOG/order_$(date +%Y%m%d_%H%M).log"
exec > >(tee -a "$L") 2>&1
echo "== 주문 실행 $(date '+%Y-%m-%d %H:%M')"
CFG="${KIS_CONFIG:-$HOME/.kis/kis.json}"
[ -f "$CFG" ] || { echo "한투 설정 파일이 아직 없습니다 ($CFG) — 주문 건너뜀"; exit 0; }
# 이번 주 점검이 통과했는지, 자료가 오래되지 않았는지 확인
tail -1 "$LOG/status.txt" 2>/dev/null | grep -q "성공" || { echo "!! 이번 주 주간 실행이 성공하지 않아 주문하지 않습니다"; osascript -e 'display notification "주간 실행 실패로 주문 중단" with title "자동매매"' 2>/dev/null; exit 1; }
AGE=$(node -e "const s=require('../paper/state.json');console.log(Math.floor((Date.now()-new Date(s.dataUntil))/864e5))")
[ "$AGE" -le 10 ] || { echo "!! 자료가 ${AGE}일 전 것이라 주문하지 않습니다"; exit 1; }
if node -e "process.exit(require('$CFG').auto===true?0:1)"; then node kis_trade.js --live; else echo "(auto 설정이 꺼져 있어 확인만 합니다)"; node kis_trade.js; fi
echo "== 끝"
