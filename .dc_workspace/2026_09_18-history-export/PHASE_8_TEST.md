# Phase 8 — TEST 체크리스트

## CLAUDE.md

- [ ] `grep -nE "하단 3탭|^.*3탭.*고정" CLAUDE.md` — 결과 0건 (이력 서술 예외는 허용, 규약 문장은 없어야).
- [ ] `grep -n "4탭\\|하단 네비" CLAUDE.md` — 4탭 서술 등재.
- [ ] `grep -n "data-history-view" CLAUDE.md` — 훅 목록에 등재.
- [ ] `grep -n "data-export-json\\|data-export-csv\\|data-import" CLAUDE.md` — 세 훅 등재.
- [ ] `grep -n "data-import-error\\|data-import-block\\|data-import-dialog" CLAUDE.md` — 등재.
- [ ] 「문서 지도」 표에 `.dc_workspace/2026_09_18-history-export/` 등재.

## README.md

- [ ] 「기록 보기」 관련 문단 존재.
- [ ] JSON 파일 스키마 요약 (`meta`, `appState`, `catalog`) 언급.
- [ ] CSV 22열 이름 언급 또는 링크.
- [ ] 가져오기 절차 요약 (덮어쓰기, 진행 중 세션 시 차단, 되돌리기 없음).

## CHANGELOG.md

- [ ] `[Unreleased]` 아래 다음 5개 절 존재:
  - Added
  - Changed
  - Refactored
  - Testing
  - Known limitations
- [ ] 각 절에 이번 개정의 항목 등재 (기록 탭 · 내보내기 · 가져오기 · 스키마 v4 · 폴더 재배치 · 구조 규약 검사 · RISK-4).

## 코드 무변경

- [ ] `git diff` 결과가 세 문서 파일 편집뿐.
- [ ] `pnpm check` 오류/경고 0.
- [ ] `pnpm test` 전부 통과, 테스트 수는 Phase 7 종료 시점과 정확히 동일.

## 임시 배포

- [ ] 페이즈에 배포 명령이 없다.
- [ ] `deploy/README.md` 는 손대지 않는다.
