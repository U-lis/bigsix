# Phase 4: ui-cards

## 목표

ExerciseCard 를 새 스토어 API 에 연결하고, FinishBar · FinishDialog 를 신설하며,
FreeExerciseForm 을 칸 열기 전용으로 수정하고, `+page.svelte` 에 연결한다.
FR-39.5~6, FR-40, FR-41.1/3/4, FR-42.1~3/7, FR-43, UI-17~19/21 구현.
Phase 2 의 `finalize`/`abandon` 임시 stub 을 제거한다.

## 선행 조건

Phase 3 완료.

## 지침

### 1. `ExerciseCard.svelte` 개선

- Props 변경: `plan: PlannedExercise` 를 받되, 칸 데이터를 `inProgress.getDraft(plan.progressionId, plan.kind)` 로 파생한다.
  카드는 `$derived(inProgress.drafts[draftKey(plan.progressionId, plan.kind)])` 에 바인딩한다.
- **「세션 완료 기록」 버튼 제거**: `data-finalize` 훅과 `finalize` 호출을 삭제한다.
- **「이 단계 중단」 토글**:
  - 「불가능」 → 「이 단계 중단」 / 「중단 취소」 토글 버튼. `data-abandon-mark` 값 `'on'|'off'`.
  - 클릭 시 `inProgress.markAbandoned(key, !draft.abandoned)`.
  - `markAbandoned(key, true)` 호출 후, 상위 페이지에 `onAbandonMark` 이벤트(또는 콜백 prop)로 알린다.
    페이지에서 `canConsolidate` 확인 후 다지기 제안 여부를 결정한다.
  - `markAbandoned(key, false)` 시, 연결된 다지기 칸(`linkedTo === key`)이 있으면 페이지가 확인 다이얼로그를 띄운다 (EC-94).
- **세트 행 (`data-set-row`)**:
  - 각 세트에 값, 편집(`data-set-edit`), 삭제(`data-set-delete`) 제공.
  - N 초과 세트에 `data-set-extra` 속성.
  - 세트 값 < 목표 시 `data-set-short` 속성과 「{값} / 목표 {목표} · 미달」 문구 (FR-40).
  - 색만으로 알리지 않는다 (CLAUDE.md).
- **다지기 카드**: `plan.kind === 'consolidation'` 인 경우, 칸의 `target` 에서 목표를 표시한다.
  work 카드 바로 아래 렌더링은 `+page.svelte` 가 담당한다.
- **중단 카드 CSS 접기**: `draft.abandoned === true` 이면 세트 입력 영역을 CSS 로 접는다 (`{#if}` 사용 금지).

### 2. `FinishBar.svelte` 신설 (`src/lib/ui/session/FinishBar.svelte`)

- 「오늘 운동 마치기」 버튼. `data-finish` 속성.
- 활성 조건: 세트가 하나 이상 있거나 `abandoned === true` 인 칸이 하나라도 있을 때 (FR-42.2).
- 비활성 시 `disabled` + opacity + cursor 로 표시 (CLAUDE.md).
- 클릭 시 부모에게 이벤트를 올려 FinishDialog 를 연다.
- 위치: `+page.svelte` 의 「자유 운동 기록」 폼 위. sticky 아님.

### 3. `FinishDialog.svelte` 신설 (`src/lib/ui/session/FinishDialog.svelte`)

- `data-finish-dialog` 루트 속성.
- `plan: FinishPlan` prop 을 받아 그룹별 요약 목록을 표시한다.
  각 행: `data-finish-row` 값 = draftKey.
- 「기록」 → 부모에 confirm 이벤트. 「취소」 → 닫힘 (EC-101).
- 요약 문구는 사실만. 백분율·격려 금지 (NFR-2 / R-4).
- 다이얼로그 접기는 CSS 로.

### 4. `FreeExerciseForm.svelte` 수정

- `applySession` 즉시 호출 코드 제거.
- `inProgress.beginFree(today, progressionId, step)` 만 호출해 자유 운동 칸을 연다.
- 세트·RPE 입력은 열린 칸의 ExerciseCard 가 담당한다.

### 5. `+page.svelte` 연결

- `FinishBar`, `FinishDialog` import 및 배치.
- 「오늘 운동 마치기」 흐름:
  1. FinishBar 클릭 → `planFinish(inProgress.drafts, agendaItems.map(p => draftKey(p.progressionId, p.kind)))` 호출.
  2. FinishDialog 에 plan 전달, 열기.
  3. Dialog confirm → `inProgress.finish(state, catalog, todayClock.nowIsoLocal())` 호출.
  4. 결과의 `nextState` 로 `state.apply(nextState)`.
  5. 성공 후 기존 승급·보류 결과 표시 (FR-42.7).
- 다지기 제안 연결:
  - `onAbandonMark(key)` 핸들러: `canConsolidate(state, catalog, id)` 확인, true 이면 다지기 제안 UI 표시.
  - 승인 시 `inProgress.beginConsolidation(today, state, catalog, id, key)`.
  - 중단 취소 시 연결된 다지기 칸이 있으면 확인 후 `inProgress.discardDraft(consolidationKey)`.
- work 카드 → 다지기 카드 순서 렌더링.
- 호환 래퍼(`finalize`, `abandon`) 제거.

### 6. `summarizeDraft` 레이블 모듈 신설

카드에서 종목명·단계명을 보여주는 문자열 조립 순수 함수를 `src/lib/ui/session/summarizeDraft.ts` 에 분리한다.
FinishDialog 의 칸별 요약 문구(FR-42.3, NFR-2)가 이 함수를 사용하므로 필수다. 단위 테스트 가능.
Phase 3 의 `planFinish` 가 생성한 ops 를 받아 사람이 읽을 수 있는 summary 문자열을 반환한다.
이 함수는 catalog 를 인자로 받아 종목명·단계명을 조회한다.

## 완료 체크리스트

- [x] `ExerciseCard` 가 `draftKey` 기반 칸에 바인딩됨 — `ExerciseCard.svelte:60`
- [x] 「세션 완료 기록」 버튼 및 `data-finalize` 훅 제거됨 — `ExerciseCard.svelte` 전체에 없음
- [x] 「이 단계 중단」 토글 구현, `data-abandon-mark` 훅 있음 — `ExerciseCard.svelte:292`
- [x] 미달 세트에 `data-set-short` 와 사실 문구 표시됨 (FR-40) — `ExerciseCard.svelte:220,237`
- [x] 추가 세트에 `data-set-extra` 표시됨 (FR-39.6) — `ExerciseCard.svelte:219`
- [x] 중단 카드 입력 영역이 CSS 로 접힘 (ADR-47) — `ExerciseCard.svelte:376`
- [x] `FinishBar` 구현, `data-finish` 훅 있음, 활성 조건 맞음 (FR-42.2) — `FinishBar.svelte:24`
- [x] `FinishDialog` 구현, `data-finish-dialog`, `data-finish-row` 훅 있음 (FR-42.3) — `FinishDialog.svelte:40,58`
- [x] `FreeExerciseForm` 이 `beginFree` 만 호출하도록 수정됨 (FR-43.1) — `FreeExerciseForm.svelte:60`
- [x] `+page.svelte` 에서 마치기 흐름 완성됨 (FR-42.4~7) — `+page.svelte:141-157`
- [x] 다지기 제안 흐름 완성됨 (FR-41.3~4) — `+page.svelte:98-138`
- [x] `summarizeDraft.ts` 구현됨, FinishDialog 가 이를 사용함 (FR-42.3, NFR-2) — `summarizeDraft.ts`, `FinishDialog.svelte:13`
- [x] `finalize`/`abandon` 임시 stub 제거됨 — `session.svelte.ts` 에 없음
- [x] `pnpm check` 오류 0
- [x] `pnpm test` 전부 통과 (972/972)

## 검증자 메모

- **FR-6.7a RPE 테스트 추가**: 삭제된 `inprogress.test.ts` 가 검증하던 `SessionRecord.rpe === max(setRpes)` 동작이 새 테스트 슈트에 없었음. `finish.test.ts` 에 `executeFinish — FR-6.7a` 블록 추가 (2 케이스).
- **EC-102 테스트 추가**: `finish` 후 같은 종목 `beginWork` 가 가능한지 확인하는 테스트를 `inprogress.test.ts` 에 추가.
- **Agenda order 수정**: `inProgress.finish()` 가 내부적으로 draft 삽입 순서로 agendaOrder 를 파생하고 있었음. `finish()` 에 선택적 `agendaOrder` 매개변수 추가, `+page.svelte` 의 `confirmFinish()` 에서 실제 화면 순서를 전달하도록 수정.
- **Phase 5 수동 체크리스트**: `data-*` 훅 존재 확인, 자유 운동 흐름, 잠긴 종목, write-blocked 배너는 Phase 6 폰 수동 확인 항목.
- **DocString/non-test 후보** (수동 검토): `finish.ts` 모듈·인터페이스 docstring 군(criterion #5), `summarizeDraft.ts` 모듈 docstring. 소스 파일이므로 이번 pruning 에서 미적용.

## 비고

- `data-set-row` 는 1-based 세트 번호를 값으로 가진다.
- `data-set-edit`, `data-set-delete` 는 세트 행 안 버튼에 붙인다.
- 편집 인터페이스는 기존 방식(인라인 편집 또는 모달)을 따른다 — 새 패턴을 도입하지 않는다.

### 6. 스테일 키 충돌 처리 (Phase 2 검증에서 추가)

`beginWork(today, plan)` 이 `false` 를 돌려주는 경우 — 같은 `progressionId:work` 키에 날 넘긴
스테일 칸이 이미 있을 때 — 카드는 세트 입력을 비활성화하고 사실 문구를 표시해야 한다:

> 「{startedAt} 미완료 기록이 있습니다 — 먼저 기록하거나 버리세요」

구체적으로:
- ExerciseCard 는 `beginWork` 반환값을 받는다 (또는 `getDraft(id, kind, today)` 가 `undefined`
  인데 `getDraft(id, kind)` 가 `defined` 임을 확인해 간접 감지한다).
- 입력 영역은 CSS `disabled` + `data-draft-blocked` 훅으로 잠근다 (CLAUDE.md 잠금 규칙 준수).
- 문구는 `StaleBanner` (Phase 5) 가 전역 안내를 제공하기 전까지 카드 수준에서도 표시한다.
- 입력을 묵시적으로 버리는 경로는 없어야 한다.
