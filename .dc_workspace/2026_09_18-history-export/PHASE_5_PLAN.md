# Phase 5 — 종목별 추이

**목표**
FR-25. 종목 하나를 고르면 그 종목의 세션이 최근부터 표로 뜬다.

## SPEC 참조

- FR-25.1: 빅6 중 하나 선택. 기본은 기록 가장 최근인 종목.
- FR-25.2: 최근부터 한 줄씩. 날짜 · 수행 단계 · 세트 값 · 세트 합계 · 목표(있으면) · 목표 충족(있으면) · RPE · 성격 · 승급.
- FR-25.3: 저장된 목표로만 판정. 목표 없는 옛 기록은 "—".
- FR-25.4: 단계가 바뀌는 지점(승급 · 다지기)이 구분돼 보인다.
- FR-25.5: 그래프 없음, 표만.
- UI-4: `<table>` · `tabular-nums` + 오른쪽 정렬 · 강조·배지·추세선 없음.

## 변경 파일

- `src/lib/ui/history/progression.ts`:
  - `interface ProgressionRow { date; step; performedStep; sets; total; goal?; meetsGoal?; rpe?; kind; outcome?; promotedTo?; stepBoundary: boolean; }`
  - `buildProgressionRows(state, catalog, id): ProgressionRow[]` — `state.history.filter(r => r.progressionId === id)` 를 시간순으로 훑으면서 이전 세션의 `performedStep` 과 다르면 `stepBoundary: true`. `input.target` 있으면 `meetsStandard(sets, standard)` 로 `meetsGoal`. 결과는 최근부터로 뒤집는다.
  - `defaultProgressionId(state): ProgressionId` — 마지막 세션의 progressionId, 없으면 `'pushup'`.
- `src/lib/ui/history/ProgressionTable.svelte`:
  - 종목 선택 `ChipGroup` (빅6, 6개 옵션) — `data-history-progression={id}`.
  - `<table>` — 열: 날짜 · 단계 · 세트 값 · 합계 · 목표 · 충족 · RPE · 성격 · 승급.
  - 각 행 `data-prog-row="{date}:{idx}"`, `data-prog-meets="{yes|no|}"`.
  - 숫자 열은 `tabular-nums` 클래스 + `text-align: right`.
  - `stepBoundary === true` 행 앞에 시각적 구분 (얇은 구분선 `<tr class="boundary">` 또는 CSS border-top). 문구도 함께 ("승급 → N단계" 또는 "다지기 → M단계").
  - 최고 강조/배지/추세선 없음.
- `src/lib/ui/history/HistoryView.svelte`:
  - SegToggle 값이 `'progression'` 이면 `<ProgressionTable />` 를 그린다.
  - 종목 선택 ChipGroup 은 ProgressionTable 안에 두거나 HistoryView 에 둔다 — Phase 5 구현 시 위치 결정 (UI-1 순서 유지).
- `tests/unit/history-progression.test.ts` (신규).

## 커밋 경계 (2개)

1. `feat(history): 종목별 추이 순수 함수` — progression.ts + tests.
2. `feat(history): 종목별 추이 표` — ProgressionTable + HistoryView 통합.

## 완료 기준

- 종목을 고르면 그 종목의 세션이 최근순으로 표에 나온다.
- `input.target` 없는 옛 세션은 목표/충족 열이 "—".
- 승급 · 다지기 지점이 시각적으로 구분된다.
- 숫자 열이 오른쪽 정렬 · tabular-nums.
- 그래프/강조/배지 없음.
- `pnpm check` 0/0, `pnpm test` 전부 통과.

## 임시 배포

이 페이즈에 포함하지 않는다.

## Completion Checklist

- [x] `ProgressionRow` 인터페이스 — `date; step; performedStep; sets; total; goal?; meetsGoal?; rpe?; kind; outcome?; promotedTo?; stepBoundary: boolean` 전부 구현 (`progression.ts:18-40`)
- [x] `buildProgressionRows(state, id)` — `state.history.filter(r => r.progressionId === id)` 시간순 순회, `stepBoundary` 계산 후 뒤집기 (`progression.ts:57-88`)
  - Note: PLAN 서명은 `(state, catalog, id)` 였으나 구현은 `(state, id)`. catalog 는 표시용 레이블 전용으로 컴포넌트 층에서 처리 — ADR-20 순수 함수 원칙에 더 부합하는 결정으로 승인.
- [x] `defaultProgressionId(state)` — 마지막 세션의 progressionId, 없으면 `'pushup'` (`progression.ts:46-49`)
- [x] `input.target` 있으면 `meetsStandard(sets, standard)` 로 `meetsGoal` 계산 (`progression.ts:77-80`)
- [x] `input.target` 없는 옛 세션은 `meetsGoal === undefined` (`progression.ts:77` — 블록 건너뜀)
- [x] `rpe` 는 `target` 과 독립적으로 처리 (`progression.ts:81`) — target 없어도 rpe 값이 있으면 표에 표시됨 (FR-25.2 RPE 독립 열 요건 충족)
- [x] FR-25.3 / EC-57: 저장된 `r.target` 으로만 판정, 재계산 없음 (`progression.ts:77-80`)
- [x] `ChipGroup` 종목 선택 6개, `data-history-progression={selected}` (`ProgressionTable.svelte:101-109`)
- [x] `<table>` — 열: 날짜 · 단계 · 세트 값 · 합계 · 목표 · 충족 · RPE · 성격 · 승급 (`ProgressionTable.svelte:116-127`)
- [x] 각 행 `data-prog-row="{date}:{idx}"`, `data-prog-meets="{yes|no|}"` (`ProgressionTable.svelte:137-138`)
- [x] 숫자 열 `tabular-nums` + `text-align: right` (`ProgressionTable.svelte:205-208`)
- [x] `stepBoundary === true` 행 앞 `<tr class="boundary">` + 문구 (`ProgressionTable.svelte:131-134`)
  - Note: 단계 이름은 표 밖 `<p data-prog-legend>` 한 줄로 뺌. "수행 단계" 열은 숫자로 충족 — FR-25.2 요건 만족.
- [x] 강조/배지/추세선 없음 (UI-4)
- [x] `svelte-ignore state_referenced_locally` — `appState` 변경 시에도 사용자 선택 유지 목적의 의도적 캡처. `rows` 는 `$derived` 로 `appState` 반응형 갱신됨 (`ProgressionTable.svelte:31-36`)
- [x] HistoryView — `view === 'progression'` 일 때 `<ProgressionTable />` 렌더 (`HistoryView.svelte:92`)
- [x] UI-1 세로 순서 유지 — h1 → SegToggle → 본문 → 내보내기 슬롯 (`HistoryView.svelte:52-98`)
- [x] `tests/unit/history-progression.test.ts` 신규 — 11개 케이스 (TEST.md 9개 항목 전부 포함)
- [x] `pnpm check` 0/0 (2026-09-21 실측)
- [x] `pnpm test` 737 passed (기준선 725 → 737, +12) (2026-09-21 실측)
