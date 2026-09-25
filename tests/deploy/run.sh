#!/usr/bin/env bash
# 배포 스크립트 셸 테스트 전부. 홈서버·ssh·네트워크를 쓰지 않는다.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
rc=0
for t in "$HERE"/test-*.sh; do
	bash "$t" || rc=1
	echo
done
exit $rc
