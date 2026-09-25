#!/usr/bin/env bash
# 서버 테스트 러너. tests/deploy/run.sh 스타일 답습.
# 홈서버 없이 로컬에서만 돌아야 한다 (Node.js 24 + --experimental-strip-types).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
rc=0
for t in "$HERE"/test-*.mjs; do
	echo "=== $(basename "$t") ==="
	node --experimental-strip-types "$t" || rc=1
	echo
done
exit $rc
