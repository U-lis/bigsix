#!/usr/bin/env bash
# deploy/lib.sh 의 resolve_commit — 배포 대상 SHA 를 무엇으로 보는가.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tests/deploy/helpers.sh
. "$HERE/helpers.sh"
# shellcheck source=deploy/lib.sh
. "$ROOT/deploy/lib.sh"

echo "deploy/lib.sh resolve_commit"

setup_sandbox
cd "$DEV" || exit 1
commit "대상"
TARGET=$(git rev-parse HEAD)

git tag -a vA -m vA
TAGOBJ=$(git rev-parse vA)
eq "annotated 태그에서 커밋을 준다" "$TARGET" "$(resolve_commit vA)"
assert_true "테스트 자체가 유효하다 (태그 객체 SHA 가 커밋과 다르다)" [ "$TAGOBJ" != "$TARGET" ]

git tag vL
eq "lightweight 태그에서도 커밋을 준다" "$TARGET" "$(resolve_commit vL)"
eq "브랜치에서도 커밋을 준다" "$TARGET" "$(resolve_commit main)"
eq "커밋 SHA 를 줘도 그대로다" "$TARGET" "$(resolve_commit "$TARGET")"

cd / || exit 1
teardown_sandbox
summary
