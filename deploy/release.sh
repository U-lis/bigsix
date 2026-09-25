#!/usr/bin/env bash
#
# 릴리스. 버전을 올리고 태그를 달고 배포까지 한 번에 한다.
#
#   ./deploy/release.sh 0.2.0
#
# 왜 GitHub Actions 가 아닌가: 홈서버는 tailnet 안에 있고 공유기에 열어둔 포트가
# 없다. GitHub 러너는 서버에 닿지 못한다. 서버에 self-hosted 러너를 두면 되지만
# (아웃바운드로 붙으므로 NAT 뒤에서도 돈다), 그러면 배포 검증 결과를 GitHub 로그로
# 보러 가야 한다. deploy.sh 의 값어치는 프리캐시 전수 대조를 배포한 사람이 그
# 자리에서 보는 것이라 그 피드백을 잃을 이유가 없다.
#
# 태그와 package.json 버전이 어긋나는 것을 막는 것도 이 스크립트의 일이다.
# 앱은 package.json 을 정본으로 버전을 표시하므로, 태그만 올리면 화면에는
# 옛 버전이 뜬다.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
	echo "사용법: ./deploy/release.sh <버전>   예) ./deploy/release.sh 0.2.0" >&2
	exit 1
fi
if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
	echo "버전은 x.y.z 형식이어야 한다: '$VERSION'" >&2
	exit 1
fi
TAG="v$VERSION"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
	echo "릴리스는 main 에서 한다. 지금은 '$BRANCH' 다." >&2
	echo "먼저 머지하고 main 을 최신으로 맞출 것." >&2
	exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
	echo "커밋되지 않은 변경이 있다. 정리하고 다시 돌릴 것." >&2
	git status --short >&2
	exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
	echo "'$TAG' 태그가 이미 있다." >&2
	exit 1
fi

# CHANGELOG 에 이 버전 항목이 있어야 한다. 없이 태그부터 다는 것을 막는다.
if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
	echo "CHANGELOG.md 에 '## [$VERSION]' 항목이 없다. 먼저 적을 것." >&2
	exit 1
fi

echo "==> 검사"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
	echo "로컬 main 과 origin/main 이 다르다. 맞추고 다시 돌릴 것." >&2
	exit 1
fi

echo "==> 테스트"
pnpm install --frozen-lockfile --reporter=silent
pnpm run check >/dev/null
pnpm test --reporter=dot 2>&1 | tail -3

echo "==> 버전 $VERSION"
node -e '
	const fs = require("fs");
	const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
	p.version = process.argv[1];
	// 탭 들여쓰기와 끝 개행을 유지한다. 안 그러면 릴리스마다 포맷 diff 가 섞인다.
	fs.writeFileSync("package.json", JSON.stringify(p, null, "\t") + "\n");
' "$VERSION"
git add package.json
git commit -qm "chore(release): $VERSION"

echo "==> 태그 $TAG"
git tag -a "$TAG" -m "$VERSION"

echo "==> push"
git push -q origin main
git push -q origin "$TAG"

echo "==> 배포"
./deploy/deploy.sh "$TAG"
