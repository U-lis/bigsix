#!/usr/bin/env bash
# server/scripts/vapid-init.mjs — 최초 생성 · 덮어쓰기 방지 · --rotate 백업.
#
# 실제 홈서버·ssh 없이 검증한다. 데이터 디렉터리를 BIGSIX_DATA_DIR 로 임시
# 디렉터리로 밀어넣어 저장소를 건드리지 않는다.
#
# web-push npm 패키지가 있어야 스크립트가 돈다. 저장소 최초 체크아웃 상태에서는
# server/node_modules 가 비어 있을 수 있어, 없으면 먼저 npm ci 를 돌린다.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tests/deploy/helpers.sh
. "$HERE/helpers.sh"

echo "server/scripts/vapid-init.mjs"

# web-push 가 이미 설치돼 있는지 확인. 없으면 이번 한 번만 설치.
if [ ! -d "$ROOT/server/node_modules/web-push" ]; then
	echo "  (server dep 없음 — 이번 한 번만 npm ci)"
	( cd "$ROOT/server" && npm ci --omit=dev --silent )
fi

SCRIPT="$ROOT/server/scripts/vapid-init.mjs"

# 매 케이스마다 새 임시 디렉터리. teardown 은 trap 으로.
TMPDIR=""
setup_tmp() { TMPDIR=$(mktemp -d); }
teardown_tmp() { [ -n "$TMPDIR" ] && rm -rf "$TMPDIR"; TMPDIR=""; }
trap teardown_tmp EXIT

run() { # run <추가인자...>
	BIGSIX_DATA_DIR="$TMPDIR/data" node "$SCRIPT" "$@" 2>"$TMPDIR/err" 1>"$TMPDIR/out"
}

# --- 최초 생성 ---
setup_tmp
run
RC=$?
OUT=$(cat "$TMPDIR/out")
ERR=$(cat "$TMPDIR/err")

eq "최초 생성 exit 0" "0" "$RC"
assert_true "stdout 이 비어 있지 않다 (공개키가 나온다)" [ -n "$OUT" ]
# 공개키는 base64url 인쇄 — 대략 87자. 최소 40자만 넘으면 통과.
assert_true "stdout 이 40자 이상 (공개키 길이)" [ ${#OUT} -ge 40 ]
contains "stderr 에 저장 안내" "비밀키 저장" "$ERR"
assert_true "vapid.private 파일 존재" [ -f "$TMPDIR/data/vapid.private" ]
# 파일 권한 600. stat 의 %a 는 8진수 3자리.
MODE=$(stat -c '%a' "$TMPDIR/data/vapid.private")
eq "파일 권한 600" "600" "$MODE"
teardown_tmp

# --- 재실행 (without --rotate) 은 거절 ---
setup_tmp
run   # 첫 생성
BEFORE=$(cat "$TMPDIR/data/vapid.private")
run   # 두 번째, 인자 없이
RC=$?
ERR=$(cat "$TMPDIR/err")

eq "덮어쓰기 방지 exit 2" "2" "$RC"
contains "stderr 에 이미 존재 안내" "이미 존재" "$ERR"
AFTER=$(cat "$TMPDIR/data/vapid.private")
eq "기존 비밀키가 그대로다" "$BEFORE" "$AFTER"
teardown_tmp

# --- --rotate 는 백업 남기고 새 키 생성 ---
setup_tmp
run
BEFORE=$(cat "$TMPDIR/data/vapid.private")
run --rotate
RC=$?
ERR=$(cat "$TMPDIR/err")

eq "회전 exit 0" "0" "$RC"
contains "stderr 에 백업 안내" "백업:" "$ERR"
# 백업 파일 하나 이상 존재. 파일명이 ISO 타임스탬프라 알파벳/숫자/`-` 만 있어
# glob 결과를 그대로 word-split 해도 안전하다. shellcheck 는 그래도 SC2086 을
# 걸어 놓으므로 array 로 받아 개수를 센다.
BAKS=("$TMPDIR/data"/vapid.private.bak.*)
eq "백업 파일 1개" "1" "${#BAKS[@]}"
BAK_PATH="${BAKS[0]}"
assert_true "백업 파일이 원래 비밀키를 담고 있다" [ "$(cat "$BAK_PATH")" = "$BEFORE" ]
# 새 비밀키가 다른 값
AFTER=$(cat "$TMPDIR/data/vapid.private")
assert_true "새 비밀키가 이전과 다르다" [ "$BEFORE" != "$AFTER" ]
teardown_tmp

# --- stdout 이 공개키만 (비밀키가 안 새는지) ---
setup_tmp
run
OUT=$(cat "$TMPDIR/out")
PRIV=$(cat "$TMPDIR/data/vapid.private")
# 안전 장치: stdout 에 비밀키 문자열이 통째로 나타나면 안 된다.
case "$OUT" in
	*"$PRIV"*) ng "stdout 에 비밀키가 새 나오지 않는다" "found in stdout" ;;
	*) ok "stdout 에 비밀키가 새 나오지 않는다" ;;
esac
teardown_tmp

summary
