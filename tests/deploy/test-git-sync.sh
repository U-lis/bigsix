#!/usr/bin/env bash
# deploy/remote.sh 의 sync 모드 — 서버가 어느 커밋에 서는가.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tests/deploy/helpers.sh
. "$HERE/helpers.sh"

sync() { # sync <ref>
	REF="$1" REPO="$SERVER" bash "$ROOT/deploy/remote.sh" sync 2>&1
}
server_head() { git -C "$SERVER" rev-parse HEAD; }

echo "deploy/remote.sh sync"

# --- 브랜치 ---
setup_sandbox
(cd "$DEV" && commit "두번째" && git push -q origin HEAD:main)
sync main >/dev/null
eq "브랜치를 origin 의 최신 커밋으로 맞춘다" "$(git -C "$DEV" rev-parse HEAD)" "$(server_head)"
teardown_sandbox

# --- annotated 태그 ---
setup_sandbox
(cd "$DEV" && git tag -a v1 -m v1 && git push -q origin v1)
sync v1 >/dev/null
eq "annotated 태그는 태그 객체가 아니라 커밋에 선다" "$(git -C "$DEV" rev-parse 'v1^{commit}')" "$(server_head)"
teardown_sandbox

# --- 옮겨간 태그 (오늘 실제로 겪은 것) ---
#
# 롤백하느라 태그를 지웠다 다시 만들면 서버에는 옛 태그가 남는다. --force 없는
# fetch 는 "would clobber existing tag" 로 갱신을 건너뛰면서 종료 코드 0 을 준다.
# 그러면 서버는 옛 커밋을 배포하고도 성공한 척한다.
setup_sandbox
(cd "$DEV" && git tag -a v1 -m v1 && git push -q origin v1)
sync v1 >/dev/null                                   # 서버가 옛 v1 을 캐시하게 만든다
OLD=$(server_head)
(cd "$DEV" && git push -q origin :refs/tags/v1 && git tag -d v1 >/dev/null \
	&& commit "태그 이후" && git tag -a v1 -m v1 && git push -q origin v1)
NEW=$(git -C "$DEV" rev-parse 'v1^{commit}')
sync v1 >/dev/null
eq "지웠다 다시 만든 태그를 따라간다" "$NEW" "$(server_head)"
assert_true "테스트 자체가 유효하다 (옛 커밋과 새 커밋이 다르다)" [ "$OLD" != "$NEW" ]
teardown_sandbox

# --- 로컬 오염 ---
setup_sandbox
(cd "$DEV" && git push -q origin HEAD:main)
sync main >/dev/null
echo "손댐" >> "$SERVER/file.txt"
echo "쓰레기" > "$SERVER/junk.txt"
sync main >/dev/null
eq "서버에서 손댄 파일을 되돌린다" "" "$(git -C "$SERVER" status --porcelain)"
assert_false "추적되지 않는 파일을 치운다" [ -f "$SERVER/junk.txt" ]
teardown_sandbox

# --- node_modules 보존 ---
setup_sandbox
sync main >/dev/null
mkdir -p "$SERVER/node_modules" && echo x > "$SERVER/node_modules/keep"
sync main >/dev/null
assert_true "node_modules 는 지우지 않는다 (매 배포마다 전체 재설치를 막는다)" \
	[ -f "$SERVER/node_modules/keep" ]
teardown_sandbox

summary
