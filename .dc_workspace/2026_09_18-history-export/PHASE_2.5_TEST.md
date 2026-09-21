# Phase 2.5 — 테스트 체크리스트 (FR-30)

## 단위 — `tests/unit/howto.test.ts` (신규)

- [x] `howtoFor(catalog, 'pushup', 1)` 이 1단계 이름(한/영) · 쪽수 · `summary` 줄을 그대로 낸다. 문구를 가공하지 않는다 (FR-30.5).
- [x] 반환 줄이 `progressions.json` 의 `summary` 배열과 **문자열 동등**이다 (가공 0).
- [x] 60단계 전부에 대해 `howtoFor` 가 최소 1줄을 낸다 (데이터 전수 — 현재 `summary` 없는 단계 0건).
- [x] `unit` · `perSide` 가 그 단계의 카탈로그 값과 같다 (FR-30.3).
- [x] `pairWith` 가 있는 단계(핸드스탠드 2단계)는 결과가 2개이고 순서는 수행 단계 → 동반 단계 (FR-30.4 / EC-73).
- [x] `pairWith` 가 없으면 결과가 1개.
- [x] `summary` 가 빈 배열인 단계를 만들어 넣으면 그 항목이 결과에서 빠진다 (EC-71).
- [x] 잠긴 종목(브리지·핸드스탠드)이어도 `howtoFor` 자체는 설명을 낸다 — 잠금 판정은 호출부의 몫.

## 단위 — 카드 배선

- [x] `ExerciseCard` 에 넘기는 단계가 `performedStep` 이다. 다지기 계획(`kind: 'consolidation'`, `performedStep = step - 1`)에서 이전 단계 설명이 나온다 (FR-30.2 / EC-72).
  - 코드 근거: `ExerciseCard.svelte:105` — `performedStep={plan.performedStep}`
- [x] 자유 운동은 사용자가 고른 단계의 설명이 나온다.
  - 코드 근거: `FreeExerciseForm.svelte:171` — `<Howto {catalog} {progressionId} performedStep={step} />`

## 수동 확인

- [ ] 오늘 화면 운동 카드에서 설명이 **접힌 채로** 뜨고, 펼치면 읽힌다.
- [ ] 펼침/접기가 `{#if}` 가 아니라 CSS·`<details>` 로 동작한다 — 접힌 상태에서도 DOM 에 본문이 있다 (개발자 도구 확인).
  - 코드 근거: `Howto.svelte:35` — `<details class="howto" data-howto>` (DOM 에서 제거하지 않음)
- [ ] 설명이 **목표 아래**에 온다. 목표가 여전히 카드에서 먼저 읽힌다 (FR-21 / UI-11).
  - 코드 근거: `ExerciseCard.svelte:104` — `<header>` 다음에 `<Howto>` 배치
- [ ] 출처 문구("동작 설명은 책 원문이 아니라 자체 요약")가 보인다 (FR-30.6).
  - 코드 근거: `Howto.svelte:54`
- [x] `perSide` 단계에서 좌우 고지가 **한 번만** 나온다 (기존 `sideNote` 와 중복되지 않는다).
  - ExerciseCard 경로: `Howto` 컴포넌트는 perSide 고지를 내지 않고, `plan.sideNote` 가 별도로 한 번 표시됨 (`ExerciseCard.svelte:107-109`). 중복 없음 확인.
  - FreeExerciseForm 경로: 좌우 고지 없음 — 기존 폼의 아키텍처 한계(PlannedExercise 없으므로 sideNote 소스 없음). PLAN 의 "새 문구를 만들지 않는다" 원칙에 따라 허용 가능 (FR-30.3 위반 아님).
- [ ] 360px 폭에서 카드가 넘치지 않고, 펼쳤을 때 세로로만 늘어난다.
- [ ] 라이트·다크 두 테마에서 본문이 읽힌다. 하드코딩 색 0건 (`grep -rnE '#[0-9a-fA-F]{3,6}\b' src --include='*.svelte'` 결과가 `+layout.svelte` 의 `theme-color` 한 줄뿐).
  - 코드 근거: `Howto.svelte` 스타일 전부 `var(--border)`, `var(--bg)`, `var(--fg)`, `var(--muted)` 토큰만 사용.

## 회귀

- [x] `pnpm check` 오류 0 · 경고 0. (실측: 2026-09-21, 0 ERRORS 0 WARNINGS)
- [x] `pnpm test` 전부 통과 (Phase 1·2 기준선 + 이번 신규). (실측: 2026-09-21, 674 passed / 30 files)
- [x] `git diff --stat` 에 `src/lib/data/` 변경 없음, `src/lib/domain/` 은 index export 추가 외 변경 없음.
  - 실측: `git diff 914ad99 b315613 --stat` — CLAUDE.md, ExerciseCard.svelte, FreeExerciseForm.svelte, Howto.svelte, howto.ts, howto.test.ts 만 변경. data/domain 무변경.
