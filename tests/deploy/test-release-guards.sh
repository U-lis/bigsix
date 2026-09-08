#!/usr/bin/env bash
# deploy/release.sh 가 언제 멈추는가.
#
# 릴리스는 되돌리기 비싼 동작이다 (태그 push, 실서버 배포). 가드가 하나라도
# 새면 반쯤 나간 릴리스가 되므로, 무엇을 거절하는지 못박아 둔다.
# 실제로 push 하거나 배포하는 지점까지 가지 않는 것만 검증한다.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tests/deploy/helpers.sh
. "$HERE/helpers.sh"

echo "deploy/release.sh 가드"

# release.sh 가 자기 리포라고 믿을 가짜 저장소를 세운다.
setup_repo() {
	setup_sandbox
	REPO="$SANDBOX/repo"
	git clone -q "$ORIGIN" "$REPO"
	git -C "$REPO" config user.email t@t
	git -C "$REPO" config user.name t
	mkdir -p "$REPO/deploy"
	cp "$ROOT/deploy/release.sh" "$ROOT/deploy/deploy.sh" "$ROOT/deploy/lib.sh" "$REPO/deploy/"
	printf '# 변경 이력\n\n## [9.9.9] - 2026-01-01\n\n- 있음\n' > "$REPO/CHANGELOG.md"
	printf '{\n\t"version": "0.0.1"\n}\n' > "$REPO/package.json"
	git -C "$REPO" add -A
	git -C "$REPO" commit -qm "세팅"
	git -C "$REPO" push -q origin main
}

# 결과를 OUT / RC 에 담는다. 명령 치환을 쓰면 서브셸이라 RC 가 밖으로 안 나온다.
run_release() { # run_release <인자...>
	(cd "$REPO" && bash deploy/release.sh "$@") > "$SANDBOX/out" 2>&1
	RC=$?
	OUT=$(cat "$SANDBOX/out")
}

# --- 버전 인자 ---
setup_repo
run_release; contains "인자가 없으면 사용법을 알려준다" "사용법" "$OUT"
eq "  종료코드 0 이 아니다" "1" "$RC"
run_release 1.2; contains "x.y.z 가 아니면 거절한다" "형식" "$OUT"
run_release v1.2.3; contains "앞에 v 가 붙으면 거절한다" "형식" "$OUT"

# --- CHANGELOG ---
run_release 1.2.3
contains "CHANGELOG 에 항목이 없으면 거절한다" "CHANGELOG" "$OUT"

# --- 브랜치 ---
git -C "$REPO" checkout -q -b feature/x
run_release 9.9.9
contains "main 이 아니면 거절한다" "main" "$OUT"
git -C "$REPO" checkout -q main

# --- 워킹트리 ---
echo "손댐" >> "$REPO/CHANGELOG.md"
run_release 9.9.9
contains "커밋 안 된 변경이 있으면 거절한다" "커밋되지 않은" "$OUT"
git -C "$REPO" checkout -q -- CHANGELOG.md

# --- 이미 있는 태그 ---
git -C "$REPO" tag -a v9.9.9 -m x
run_release 9.9.9
contains "이미 있는 태그면 거절한다" "이미" "$OUT"
git -C "$REPO" tag -d v9.9.9 >/dev/null

# --- origin 과 어긋남 ---
(cd "$REPO" && commit "로컬에만 있는 커밋")
run_release 9.9.9
contains "origin/main 과 다르면 거절한다" "origin/main" "$OUT"

# --- 어느 경우에도 태그를 만들지 않았다 ---
eq "거절된 실행은 태그를 남기지 않는다" "" "$(git -C "$REPO" tag -l)"

teardown_sandbox
summary
