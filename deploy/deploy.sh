#!/usr/bin/env bash
#
# 홈서버 배포. 서버가 직접 git clone 해서 빌드하고, 산출물을 docroot 로 옮긴다.
#
#   ./deploy/deploy.sh                      현재 브랜치를 배포
#   ./deploy/deploy.sh main                 특정 ref 를 배포
#   DEPLOY_HOST=other ./deploy/deploy.sh    다른 서버로
#
# 접속은 Tailscale 을 탄다. 집이든 밖이든 같은 명령이고, 공유기에 열어둔 포트는 없다.
#
# 로컬 빌드를 올리지 않는 이유: 배포된 것이 리포의 어느 커밋인지 항상 확실해진다.
# 커밋되지 않은 로컬 수정이 서버로 새어 나갈 수 없다.
#
# root 권한은 쓰지 않는다. 최초 1회 설정(디렉터리 소유권·nginx vhost·sudoers)은
# deploy/README.md 에 있고, 그 뒤로는 전부 사용자 권한으로 돈다.
set -euo pipefail

HOST="${DEPLOY_HOST:-homeserver}"
REPO="${DEPLOY_REPO:-$HOME/apps/bigsix}"   # 서버상의 경로
DOCROOT="${DEPLOY_DOCROOT:-/var/www/bigsix}"
URL="${DEPLOY_URL:-https://bigsix.siot-ieung.duckdns.org}"

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
cd "$HERE/.."
REF="${1:-$(git rev-parse --abbrev-ref HEAD)}"

# 배포하려는 ref 가 원격에 올라가 있어야 서버가 받아갈 수 있다.
if ! git ls-remote --exit-code origin "$REF" >/dev/null 2>&1; then
	echo "origin 에 '$REF' 가 없다. 먼저 push 할 것." >&2
	exit 1
fi
LOCAL_SHA=$(resolve_commit "$REF")
echo "==> 배포 대상: $REF (${LOCAL_SHA:0:7})"

# Tailscale tailnet 으로 붙는다. 집/밖 구분이 없다 — 집에서는 LAN 다이렉트 경로를
# 잡고 밖에서는 터널로 간다. 여기서 안 걸러주면 ssh 타임아웃만 뱉고 이유를 알 수 없다.
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>/dev/null; then
	echo "'$HOST' 에 붙지 못했다. tailnet 을 먼저 볼 것:" >&2
	echo "    tailscale status      # 양쪽 다 떠 있어야 한다" >&2
	echo "노트북이 로그아웃됐으면 'sudo tailscale up'." >&2
	echo "서버가 안 보이면 머신 키 만료를 의심할 것 — admin 콘솔에서 key expiry 를 끈다." >&2
	echo "커밋은 이미 push 되어 있으므로, 연결만 살리고 이 스크립트를 다시 돌리면 된다." >&2
	exit 1
fi

ssh "$HOST" REF="$REF" REPO="$REPO" DOCROOT="$DOCROOT" 'bash -s' < "$HERE/remote.sh"

echo "==> 원격이 배포한 커밋 대조"
# $REPO 는 여기서 펼쳐져야 한다 — 서버 경로를 로컬이 정한다.
# shellcheck disable=SC2029
REMOTE_SHA=$(ssh "$HOST" "git -C '$REPO' rev-parse HEAD")
if [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
	echo "    로컬 $LOCAL_SHA / 서버 $REMOTE_SHA — 어긋남" >&2
	exit 1
fi
echo "    일치 ($REMOTE_SHA)"

echo "==> 응답 확인"
fail=0
for path in / /manifest.webmanifest /sw.js; do
	code=$(curl -sS -o /dev/null -w '%{http_code}' "$URL$path")
	printf '    %-24s %s\n' "$path" "$code"
	[ "$code" = "200" ] || fail=1
done

# 서비스워커가 프리캐시하겠다고 적어둔 파일이 전부 실제로 서빙되는지 본다.
# 하나라도 404 면 SW 설치가 실패해서 오프라인이 통째로 죽는다.
echo "==> 프리캐시 목록 대조"
missing=$(
	curl -sS "$URL/sw.js" | node -e '
		let s = "";
		process.stdin.on("data", (d) => (s += d));
		process.stdin.on("end", () => {
			const urls = [...s.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
			process.stdout.write(urls.join("\n"));
		});
	' | while read -r u; do
		case "$u" in /*) full="$URL$u" ;; *) full="$URL/$u" ;; esac
		code=$(curl -sS -o /dev/null -w '%{http_code}' "$full")
		[ "$code" = "200" ] || echo "    $code $u"
	done
)
if [ -n "$missing" ]; then
	echo "$missing"
	fail=1
else
	echo "    전부 200"
fi

[ "$fail" = 0 ] || { echo "실패"; exit 1; }
echo "==> 완료: $URL"
