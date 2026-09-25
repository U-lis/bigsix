# Phase 8 — TEST 체크리스트

## CLAUDE.md

- [x] `grep -nE "하단 3탭|^.*3탭.*고정" CLAUDE.md` — 결과 0건 (이력 서술 예외는 허용, 규약 문장은 없어야).
- [x] `grep -n "4탭\\|하단 네비" CLAUDE.md` — 4탭 서술 등재.
- [x] `grep -n "data-history-view" CLAUDE.md` — 훅 목록에 등재.
- [x] `grep -n "data-export-json\\|data-export-csv\\|data-import" CLAUDE.md` — 세 훅 등재.
- [x] `grep -n "data-import-error\\|data-import-block\\|data-import-dialog" CLAUDE.md` — 등재.
- [x] 「문서 지도」 표에 `.dc_workspace/2026_09_18-history-export/` 등재.

## README.md

- [x] 「기록 보기」 관련 문단 존재.
- [x] JSON 파일 스키마 요약 (`meta`, `appState`, `catalog`) 언급.
- [x] CSV 22열 이름 언급 또는 링크.
- [x] 가져오기 절차 요약 (덮어쓰기, 진행 중 세션 시 차단, 되돌리기 없음).

## CHANGELOG.md

- [x] `[Unreleased]` 아래 다음 5개 절 존재:
  - Added
  - Changed
  - Refactored
  - Testing
  - Known limitations
- [x] 각 절에 이번 개정의 항목 등재 (기록 탭 · 내보내기 · 가져오기 · 스키마 v4 · 폴더 재배치 · 구조 규약 검사 · RISK-4).

## 코드 무변경

- [x] `git diff` 결과가 세 문서 파일 편집뿐.
- [x] `pnpm check` 오류/경고 0.
- [x] `pnpm test` 전부 통과, 테스트 수는 Phase 7 종료 시점과 정확히 동일.

## 임시 배포

- [x] 페이즈에 배포 명령이 없다.
- [x] `deploy/README.md` 는 손대지 않는다.

---

## 검증 결과 (2026-09-22, 오케스트레이터 직접 검증)

Phase 8 검증 에이전트가 API 세션 한도로 중단되어 오케스트레이터가 직접 대조했다.

| 확인 항목 | 방법 | 결과 |
|---|---|---|
| `data-*` 훅 목록이 실제 코드와 일치 | `grep -rhoE 'data-[a-z0-9-]+' src/ --include='*.svelte'` 로 수집해 양방향 대조 | 문서에만 있는 훅(허위) 0건. 누락 9건 발견 → 이 커밋에서 보완 (`data-howto-step`, `data-day-status-label`, `data-day-note`, `data-day-planned`, `data-day-sets`, `data-day-target`, `data-day-rpe`, `data-day-promoted`, `data-day-blocked`) |
| 「하단 3탭」 잔존 서술 | `grep "3탭\|3개 고정\|하단 3" CLAUDE.md README.md CHANGELOG.md` | 0건 |
| CSV 22열 이름·순서 | README 목록 ↔ `exportCsv.ts:25-48` `CSV_HEADERS` | 완전 일치 |
| JSON 스키마 요약 | README ↔ `exportJson.ts` `ExportMeta`/`ExportFile` | 일치 (`meta`·`appState`·`catalog`) |
| CHANGELOG 가 실제 변경만 담는가 | Phase 1~7 산출물과 대조 | 일치. FR-30.7(사진 자료) 언급 0건 |
| FA 라이선스 허위 표기 | `grep -niE "font awesome|CC BY"` | 문서 0건. 코드 주석 1건은 「직접 그려서 표기 의무 없음」 설명으로 정확 |
| 회귀 | `pnpm check` / `pnpm test` | 0 errors / 0 warnings, 797 passed (38 files) — 문서만 바뀌어 변동 없음 |

**계획과 다른 점**: PLAN 은 README 의 「도메인 사용 예」 절 아래에 배치하라고 적었으나 그 절이 실재하지 않았다.
Phase 8 에서 해당 절을 새로 쓰고 그 아래에 기록 문단을 배치했다 (중복 아님 — `git show 9f69255:README.md` 로 부재 확인).
