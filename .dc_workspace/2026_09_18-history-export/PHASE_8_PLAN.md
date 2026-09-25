# Phase 8 — 문서 갱신

**목표**
`CLAUDE.md` · `README.md` · `CHANGELOG.md` 를 이번 개정에 맞춘다. 배포·태그는 하지 않는다.

## SPEC 참조

- Constraints: 「하단 네비가 3 → 4탭이 된다. `nav.ts` 주석의 "3개 고정" 서술과 `CLAUDE.md` 의 "하단 3탭" 서술을 함께 고친다.」
- FR-23.1: 「기록」 탭 등재.
- UI-7 · UI-10: `data-*` 훅 목록 · 아이콘 라이선스 표기.

## 변경 파일

- `CLAUDE.md`:
  - 「문서 지도」 표에 `.dc_workspace/2026_09_18-history-export/` 을 이번 개정 자리로 추가하고, `2026_09_05-ui-2/` 는 이력으로 남긴다.
  - 「화면을 만들거나 고칠 때」 절의 `data-*` 훅 목록에 이번 개정 훅 15개 + 동작 설명 훅 2개(`data-howto`, `data-howto-toggle`, Phase 2.5 에서 이미 추가했으면 확인만) 반영:
    - `data-history-view`, `data-history-empty`, `data-history-toggle`, `data-day-row`, `data-day-status`, `data-day-session`, `data-day-more`, `data-history-progression`, `data-prog-row`, `data-prog-meets`, `data-export-json`, `data-export-csv`, `data-import`, `data-export-status`, `data-import-dialog`, `data-import-error`, `data-import-block`.
  - 「하단 3탭」 · 「3탭」 관련 서술 → 「하단 4탭」 · 「4탭」 으로 정정 (Phase 2 에서 이미 nav.ts 는 4탭이 됨).
  - Phase 1 이 이미 갱신한 「코드」 절 규칙은 그대로 유지.
- `README.md`:
  - 「기록 보기 · 내보내기 · 가져오기」 문단 추가:
    - 기록 탭 사용법 (날짜별 / 종목별).
    - 내보내기 파일 형식 요약 — JSON 스키마 요지 (`meta` · `appState` · `catalog`) 와 CSV 22열 이름.
    - 가져오기 절차 요약 (덮어쓰기, 진행 중 세션 있으면 막힘, 되돌리기 없음).
  - 「데이터 출처」 · 「도메인 사용 예」 아래에 배치.
- `CHANGELOG.md` — `[Unreleased]`:
  - **Added**: 기록 탭(날짜별/종목별), JSON·CSV 내보내기, JSON 가져오기, 세션 기록 보강(target · setRpes · completedAt).
  - **Changed**: 하단 네비 3→4탭. 저장 스키마 v3 → v4 (마이그레이션 no-op). `src/lib/ui/` 를 역할별 하위 폴더로 재배치.
  - **Refactored**: 도메인 참조를 `$lib/domain` 경유로 통일 (R-1). Import 표기 통일 (R-2).
  - **Testing**: 구조 규약 재발 방지 단위 테스트 (`tests/unit/structure.test.ts`).
  - **Known limitations**: RISK-4 (`completedAt` 로컬 오프셋 · 세션 도중 타임존 이동 시 표기 어긋남).
  - 태그·버전 올림 없음. 릴리스 시점에 확정.
- (선택) About.svelte — Phase 6 에서 이미 FA 채택 시 CC BY 4.0 표기가 등재됐다면 여기서는 손대지 않는다.

## 커밋 경계 (1개)

`docs: SPEC3 기록 개정 반영 — 4탭 · data-* 훅 · 스키마 v4 · 폴더 재배치`

## 완료 기준

- `grep -n "하단 3탭\\|3탭" CLAUDE.md` — 결과 0건 (또는 "3탭이었다" 같은 이력 문구만).
- `grep -n "data-history-view\\|data-day-row\\|data-export-json\\|data-import" CLAUDE.md` — 훅 목록 등재.
- `grep -n "기록 탭\\|내보내기\\|가져오기\\|.json\\|.csv" README.md` — 기능 설명 등재.
- `grep -n "\\[Unreleased\\]" CHANGELOG.md` — Added · Changed · Refactored · Testing · Known limitations 각 항목 등재.
- 코드 변경 없음 → `pnpm test` · `pnpm check` 결과 이전 페이즈와 동일.

## 임시 배포

이 페이즈에도 포함하지 않는다. 사용자가 별도 지시로 `deploy/README.md` 「이번 작업의 임시 배포」 절차를 수행한다.
