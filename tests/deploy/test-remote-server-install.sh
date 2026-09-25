#!/usr/bin/env bash
# deploy/remote.sh 의 server-install 모드 — 서버가 서버 코드의 dep 을 심는가.
#
# 실제 홈서버·ssh·네트워크 없이 검증한다. 가짜 origin 저장소를 만들고 그 안에
# 최소한의 server/package.json 을 넣은 뒤 remote.sh server-install 을 돌려
# `npm ci` 가 실행돼 node_modules 가 생기는지 본다.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tests/deploy/helpers.sh
. "$HERE/helpers.sh"

echo "deploy/remote.sh server-install"

server_install() { # server_install <ref>
	REF="$1" REPO="$SERVER" bash "$ROOT/deploy/remote.sh" server-install 2>&1
}

# --- 서버 코드가 있는 저장소 ---
#
# 실제 web-push 를 인터넷에서 받는 것은 오래 걸리고 네트워크에 의존한다. 이 테스트가
# 잡으려는 것은 "서버 dir 에서 npm ci 가 도는가 + node_modules 가 생기는가" 다.
# 로컬 file: 의존성 하나면 npm ci 가 링크 트리를 만들어 node_modules 를 만든다.
# 네트워크 없이도 확실히 재현된다.
setup_sandbox
(
	cd "$DEV" || exit 1
	mkdir -p server/local-dep
	cat > server/local-dep/package.json <<'EOF'
{ "name": "local-dep", "version": "1.0.0" }
EOF
	cat > server/package.json <<'EOF'
{
	"name": "test-server",
	"version": "0.0.0",
	"private": true,
	"dependencies": { "local-dep": "file:local-dep" }
}
EOF
	# npm ci 는 lockfile 을 요구한다. `npm install --package-lock-only` 로 만든
	# 로컬 dep 용 lockfile 을 손으로 넣는다 (테스트에서 npm install 을 부르지 않도록).
	cat > server/package-lock.json <<'EOF'
{
	"name": "test-server",
	"version": "0.0.0",
	"lockfileVersion": 3,
	"requires": true,
	"packages": {
		"": {
			"name": "test-server",
			"version": "0.0.0",
			"dependencies": { "local-dep": "file:local-dep" }
		},
		"local-dep": { "version": "1.0.0" },
		"node_modules/local-dep": { "resolved": "local-dep", "link": true }
	}
}
EOF
	git add -A
	commit "server dir"
	git push -q origin main
)

OUT=$(server_install main)
RC=$?

eq "종료 코드 0" "0" "$RC"
assert_true "server/node_modules 가 생겼다" [ -d "$SERVER/server/node_modules" ]
contains "sync 단계가 함께 돈다" "==> fetch" "$OUT"
contains "서버 의존성 설치 단계 로그" "==> 서버 의존성" "$OUT"
teardown_sandbox

# --- 서버 코드가 없는 옛 커밋 (server/package.json 없음) ---
#
# 브랜치를 옛 커밋으로 배포할 때 서버 코드가 없어도 조용히 넘어가야 한다.
# 그렇지 않으면 서버가 추가되기 전 커밋을 배포할 수 없다.
setup_sandbox
OUT=$(server_install main)
RC=$?
eq "server 없는 커밋도 종료 코드 0" "0" "$RC"
contains "server 없으면 건너뛰는 안내" "건너뛴다" "$OUT"
assert_false "node_modules 도 안 만든다" [ -d "$SERVER/server/node_modules" ]
teardown_sandbox

summary
