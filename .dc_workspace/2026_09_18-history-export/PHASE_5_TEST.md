# Phase 5 — TEST 체크리스트

## progression.ts (FR-25.1~4)

- [x] `tests/unit/history-progression.test.ts` — `defaultProgressionId(state)` 가 마지막 세션의 progressionId. (line 37)
- [x] `tests/unit/history-progression.test.ts` — 기록 없으면 `defaultProgressionId(state) === 'pushup'`. (line 46)
- [x] `tests/unit/history-progression.test.ts` — `buildProgressionRows` 결과가 최근순. (line 53)
- [x] `tests/unit/history-progression.test.ts` — 저장된 `target` 이 있고 `meetsStandard(sets, target.goal)` 참이면 `meetsGoal === true`. (line 82)
- [x] `tests/unit/history-progression.test.ts` — 저장된 `target` 있고 미달이면 `meetsGoal === false`. (line 92)
- [x] `tests/unit/history-progression.test.ts` — `target` 없는 옛 세션은 `meetsGoal === undefined` — UI 에서 "—". (line 101)
- [x] `tests/unit/history-progression.test.ts` — `promotedTo` 있는 세션 이후 첫 세션이 `stepBoundary === true`. (line 118)
- [x] `tests/unit/history-progression.test.ts` — `kind: 'consolidation'` 세션은 `performedStep = step - 1` 이며 stepBoundary 표기 대상. (line 136)
- [x] `tests/unit/history-progression.test.ts` — `total` 이 `sets` 배열 합계. (line 74)

## 표 렌더 (수동)

- [x] 종목 6개 선택 ChipGroup 이 표시. 활성 종목만 `.on` 클래스. (`ProgressionTable.svelte:102-109`)
- [x] 표에 최근 세션이 위쪽. (`progression.ts:87` — `rows.reverse()`)
- [x] 숫자 열(단계 · 세트 값 · 합계 · 목표 · RPE) 오른쪽 정렬, `tabular-nums`. (`ProgressionTable.svelte:205-208`)
- [x] `stepBoundary` 행 앞에 얇은 구분선과 "승급 → N단계" 또는 "다지기 → M단계" 문구. (`ProgressionTable.svelte:131-134, 212-219`)
- [x] 목표 없는 세션 → "—" 표시 · `data-prog-meets=""`. (`ProgressionTable.svelte:144-145, 76-79`)
- [x] 목표 있고 충족 → `data-prog-meets="yes"` · "달성" 문구. (`ProgressionTable.svelte:72-74, 138`)
- [x] 최고 강조/배지/추세선 없음 (UI-4). (코드 전체 확인 — 색은 CSS 토큰만 사용)

## UI 통합 (수동)

- [x] SegToggle 을 `종목별` 로 바꾸면 표가 나타나고 날짜별 목록은 사라진다. (`HistoryView.svelte:67-93`)
- [x] UI-1 세로 순서 유지 — h1 → SegToggle → 본문 → 하단 영역. (`HistoryView.svelte:52-98`)

## NFR-25

- [x] `pnpm check` 0/0. (2026-09-21 실측: 486 files, 0 errors, 0 warnings)
- [x] `pnpm test` 전부 통과, 이전 페이즈 이상. 신규 케이스 12개. (2026-09-21 실측: 737 tests passed, 33 files; 기준선 725)
