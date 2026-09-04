#!/usr/bin/env bash
# 배포 스크립트 셸 테스트용 최소 하네스.
#
# 홈서버도 ssh 도 네트워크도 쓰지 않는다. 임시 디렉터리에 베어 저장소를 만들어
# 가짜 origin 으로 쓰고, 서버 클론을 흉내낸다. 여기서 검증하는 것은 전부 순수한
# git 동작이라 그렇게 해도 실제와 다르지 않다.

PASS=0
FAIL=0

ok() {
	PASS=$((PASS + 1))
	printf '  \033[32m✓\033[0m %s\n' "$1"
}
ng() {
	FAIL=$((FAIL + 1))
	printf '  \033[31m✗\033[0m %s\n' "$1"
	[ $# -gt 1 ] && printf '      %s\n' "$2"
}
eq() { # eq <설명> <기대> <실제>
	if [ "$2" = "$3" ]; then ok "$1"; else ng "$1" "기대 '$2' / 실제 '$3'"; fi
}
contains() { # contains <설명> <찾을것> <문자열>
	case "$3" in *"$2"*) ok "$1" ;; *) ng "$1" "'$2' 가 출력에 없다: $3" ;; esac
}
# `A && ok || ng` 로 쓰면 ok 가 실패했을 때 ng 까지 돈다 (shellcheck SC2015).
# 판정은 전부 이 두 함수를 거친다.
assert_true() { # assert_true <설명> <조건 명령...>
	local desc="$1"; shift
	if "$@"; then ok "$desc"; else ng "$desc"; fi
}
assert_false() { # assert_false <설명> <조건 명령...>
	local desc="$1"; shift
	if "$@"; then ng "$desc"; else ok "$desc"; fi
}

summary() {
	echo
	echo "  $PASS 통과, $FAIL 실패"
	[ "$FAIL" -eq 0 ]
}

# 커밋 하나를 만든다. sandbox 안에서 부른다.
commit() { # commit <메시지>
	echo "$1 $(date +%s%N)" >> file.txt
	git add -A
	git commit -qm "$1"
}

# 가짜 origin + 서버 클론을 만들고 SANDBOX / ORIGIN / SERVER 를 채운다.
setup_sandbox() {
	SANDBOX=$(mktemp -d)
	ORIGIN="$SANDBOX/origin.git"
	SERVER="$SANDBOX/server"
	DEV="$SANDBOX/dev"

	# 기본 브랜치 이름을 명시한다. git 버전·전역 설정에 따라 master 가 되면
	# 테스트가 환경에 따라 갈린다.
	git init -q --bare -b main "$ORIGIN"
	git clone -q "$ORIGIN" "$DEV" 2>/dev/null
	git -C "$DEV" config user.email t@t
	git -C "$DEV" config user.name t
	git -C "$DEV" checkout -q -b main 2>/dev/null || true
	(cd "$DEV" && commit "첫 커밋" && git push -q origin main)
	git clone -q "$ORIGIN" "$SERVER"
	git -C "$SERVER" config user.email t@t
	git -C "$SERVER" config user.name t
}

teardown_sandbox() { [ -n "${SANDBOX:-}" ] && rm -rf "$SANDBOX"; }
