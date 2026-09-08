#!/usr/bin/env bash
#
# 서버에서 도는 부분. deploy.sh 가 ssh 로 흘려보낸다.
#
#   REF=... REPO=... DOCROOT=... bash -s        전체 (동기화 + 빌드 + 반영)
#   REF=... REPO=... bash -s sync               동기화까지만
#
# sync 모드가 있는 이유는 CI 때문이다. 여기 담긴 git 동작은 서버 없이도 검증할 수
# 있어야 한다 — 가짜 저장소를 만들어 이 모드로 돌리면 홈서버도 ssh 도 필요 없다.
set -euo pipefail

MODE="${1:-full}"
: "${REF:?REF 가 필요하다}"
: "${REPO:?REPO 가 필요하다}"

sync_repo() {
	cd "$REPO"
	echo "==> fetch"
	# --force 가 핵심이다. 태그가 옮겨가면 따라가야 한다.
	#
	# 없으면 git 이 "would clobber existing tag" 로 갱신을 거부하는데, 종료 코드는
	# 0 이라 스크립트는 성공한 줄 안다. 그리고 서버에 남아 있는 옛 태그를 체크아웃해
	# 엉뚱한 커밋을 배포한다. 롤백으로 태그를 지웠다 다시 만들면 실제로 이 상황이
	# 되고, v0.2.0 에서 겪었다.
	git fetch --all --prune --tags --force -q
	# 브랜치는 origin/<이름> 으로, 태그는 이름 그대로 잡힌다.
	git checkout -q --detach "origin/$REF" 2>/dev/null || git checkout -q --detach "$REF"
	git reset --hard -q
	git clean -fdq -e node_modules -e .pnpm-store
	echo "    $(git rev-parse --short HEAD) $(git log -1 --format=%s)"
}

if [ "$MODE" = 'sync' ]; then
	sync_repo
	exit 0
fi

: "${DOCROOT:?DOCROOT 가 필요하다}"

export NVM_DIR="$HOME/.nvm"
# 비대화형 셸이라 프로필이 안 읽힌다. nvm 을 직접 로드한다.
# nvm 은 리포에 없다. 서버에만 있는 파일이라 shellcheck 가 따라갈 수 없다.
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null
# packageManager 필드에 적힌 pnpm 버전을 corepack 이 맞춰준다.
corepack enable >/dev/null 2>&1 || true

sync_repo

echo "==> 의존성"
pnpm install --frozen-lockfile --reporter=silent

echo "==> 빌드"
pnpm run build >/dev/null

# 해시 붙은 자산을 먼저 올리고 HTML·서비스워커를 마지막에 올린다. 반대로 하면
# 새 HTML 이 아직 없는 청크를 가리키는 순간이 생기고, 그 사이에 들어온 클라이언트는
# 프리캐시가 통째로 실패한다 (bad-precaching-response).
echo "==> docroot 반영"
rsync -a --exclude='*.html' --exclude='sw.js' "$REPO/build/" "$DOCROOT/"
rsync -a --delete "$REPO/build/" "$DOCROOT/"

echo "==> 배포된 커밋: $(git rev-parse HEAD)"
