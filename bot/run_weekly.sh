#!/bin/bash
# 맥미니 매주 토요일 아침: 시세 받기 → 가상계좌 진행 → 점검 → (통과하면) 사이트에 올리기
set -u
cd "$(dirname "$0")"; BOT="$(pwd)"; LOG="$BOT/logs"; mkdir -p "$LOG"
L="$LOG/weekly_$(date +%Y%m%d_%H%M).log"
exec > >(tee -a "$L") 2>&1
echo "== 주간 실행 $(date '+%Y-%m-%d %H:%M')"
fail(){ echo "!! 실패: $1"; echo "$(date '+%F %T') 실패: $1" >> "$LOG/status.txt"; [ "${NO_NOTIFY:-}" ] || osascript -e "display notification \"$1\" with title \"자동매매 주간 실행 실패\"" 2>/dev/null; exit 1; }
[ "${NO_GIT:-}" ] || git -C .. pull -q --rebase origin main || echo "(최신 코드 받기 실패 — 있는 코드로 계속)"
node fetch_data.js "$BOT/raw" || fail "시세 받기"
node update_data.js raw/QQQ.csv raw/SPY.csv raw/TLT.csv raw/GLD.csv ${NOW_ARG:-} || fail "시세 자료 점검"
node paper.js | tee "$LOG/last_paper.txt" || fail "가상계좌 계산"
node validate.js > "$LOG/last_validate.txt" || { cat "$LOG/last_validate.txt"; fail "실수 방지 점검"; }
node test_kis.js > "$LOG/last_test_kis.txt" || { cat "$LOG/last_test_kis.txt"; fail "한투 연결 시험"; }
echo "점검 전부 통과"
if [ -z "${NO_GIT:-}" ]; then
  CH=$(git -C .. status --porcelain | awk '{print $2}' | grep -v -E '^(bot/data/weekly.json|paper/state.json|bot/logs/|bot/raw/)' || true)
  if [ -n "$CH" ]; then fail "예상 밖 파일 변경: $CH"; fi
  git -C .. add bot/data/weekly.json paper/state.json
  git -C .. -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "가상계좌 주간 실행 (맥미니) $(date +%F)" && (git -C .. push -q origin main || echo "(사이트 올리기 실패 — 다음 주에 같이 올라감)")
fi
echo "$(date '+%F %T') 성공: $(tail -1 "$LOG/last_paper.txt")" >> "$LOG/status.txt"
[ "${NO_NOTIFY:-}" ] || osascript -e "display notification \"$(tail -1 "$LOG/last_paper.txt" | cut -c1-120)\" with title \"자동매매 주간 실행 완료\"" 2>/dev/null
echo "== 끝"
