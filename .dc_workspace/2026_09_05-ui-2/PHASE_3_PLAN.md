# Phase 3 — 자유 운동 (FR-18)

**목표**: `SessionRecord.kind` 에 `'free'` 를 추가하고, 판정 진입점 네 곳에서 이를 걸러 낸다 (ADR-16). 자유 운동은 언제든 기록할 수 있으며 진행 판정 어디에도 영향을 주지 않는다. 잠긴 종목은 자유 운동으로도 할 수 없다. UI 로 진입 화면 하나를 만든다.

**Dependencies**: Phase 2 완료 (`judgingHistory` 필터가 재작성된 판정 위에 얹혀야 함)
**커밋 수**: 2
**예상 테스트 변화**: 540~555 → 약 555~575 (신규 케이스 중심)
**스키마**: 판별 유니온 확장뿐. 봉투 버전 그대로 v3 (ADR-15).

---

## Commit 1 — 도메인: `kind: 'free'` + `judgingHistory` + 판정 진입점 4곳 필터 (FR-18.4~9 / ADR-16)

### types.ts

- [ ] `SessionInput.kind` 를 `'work' | 'consolidation'` → `'work' | 'consolidation' | 'free'` (FR-18)
- [ ] `SessionRecord.kind` 도 확장 (extends 로 자동 상속)
- [ ] JSDoc 추가:
  - `'free' = 사용자가 계획 밖에서 임의로 기록한 운동. 승급·유지·강등·다음 목표 계산 어디에도 영향을 주지 않는다 (FR-18.6, ADR-16)`
- [ ] `PlannedExercise.kind` 는 `'work' | 'consolidation'` 그대로 유지 — 자유 운동은 계획을 만들지 않는다 (SPEC2 Out of Scope 명시)

### history.ts

- [ ] 신규 export:
  ```ts
  /**
   * 판정용 히스토리 뷰 (FR-18.7 / ADR-16).
   *
   * 자유 운동(`kind === 'free'`)은 승급·유지·강등·다음 목표 계산 어디에도 영향을
   * 주지 않는다. 그 필터는 이 함수 하나에 집중한다. 판정하는 코드는 이 함수를
   * 통해서만 히스토리를 본다.
   *
   * 조회(`reviewDay` 의 `performed`, `sessionsAt` 자체)는 이 필터를 쓰지 않는다 —
   * 자유 운동 기록도 이력이므로 조회 결과에는 남아야 한다 (FR-18.8).
   */
  export function judgingHistory(history: SessionRecord[]): SessionRecord[] {
    return history.filter((r) => r.kind !== 'free');
  }

  export function judgingState(state: AppState): AppState {
    return { ...state, history: judgingHistory(state.history) };
  }
  ```

### 판정 진입점 4곳 (ADR-16 표)

- [ ] **evaluate.ts / applySession** — `input.kind === 'free'` 이면 `state.steps` 를 손대지 않고 조기 반환:
  ```ts
  if (input.kind === 'free') {
    // 값 없는 undefined 를 명시 대입하지 않는다 (기존 방식 유지)
    const record: SessionRecord = { ...input };
    const evaluation: Evaluation = {
      metBeginner: false, metIntermediate: false, metTop: false,
      topLabel: topLabel(step),   // step 은 record.step 기준의 카탈로그 조회
      promote: false, nextStep: input.step,
      notes: ['자유 운동 — 승급·유지 판정 대상이 아니다.'],
    };
    return {
      state: { ...state, history: [...state.history, record] },   // steps 를 손대지 않는다 (FR-18.4)
      evaluation, record,
    };
  }
  ```
  - **주의**: 자유 운동은 사용자가 단계를 고르므로 `input.step` 이 `state.steps[id]` 와 다를 수 있다. `state.steps` 를 어느 방향으로도 움직이지 않는다 (FR-18.4 / EC-40).
  - `input.kind === 'free'` 이면 `evaluateSession` 은 호출조차 되지 않는다 (경로 우회) — RPE 거부권 검사도 없음.

- [ ] **plan.ts / stepStreak (Phase 2 Commit 1 산출)** — 자유 운동 필터 적용:
  - `stepStreak` 안에서 `judgingHistory(state.history)` 로 좁힌 시퀀스만 순회
  - 또는 `stepStreak` 시작에 `const jState = judgingState(state)` 하고 그 위에서 계산

- [ ] **plan.ts / planExercise** — `sessionsAt(state, id, step)` / `lastSession(state, id, step)` 호출부에 `judgingState` 적용:
  ```ts
  const jState = judgingState(state);
  // 이하 sessionsAt(jState, ...) / lastSession(jState, ...) / stepStreak(jState, ...) 사용
  ```

- [ ] **evaluate.ts / rpeVeto** — 최근 3회 RPE 평균 계산에서 free 제외:
  ```ts
  function rpeVeto(state: AppState, record: SessionInput) {
    const jState = judgingState(state);
    const recent = [...sessionsAt(jState, record.progressionId, record.step), record]
      .filter((r) => r.kind === 'work' && r.rpe !== undefined)
      .slice(-RULES.rpeVetoWindow);
    // ...
  }
  ```

- [ ] **proposal.ts / sessionIndices** — 반복문 안에서 `r.kind === 'free'` 건너뛰기:
  ```ts
  function sessionIndices(history, progressionId, floorDate, fromIndex = 0) {
    const out = [];
    for (let i = fromIndex; i < history.length; i += 1) {
      const r = history[i];
      if (r.kind === 'free') continue;   // ADR-16
      if (r.progressionId === progressionId && onOrAfter(r.date, floorDate)) out.push(i);
    }
    return out;
  }
  ```
  - 이 하나만으로 `lastSetbackIndex` / `promotionBaselineIndex` / `maintenanceCount` 가 모두 free 를 배제한다 (판정 진입점 4번은 자동 처리됨)

- [ ] **plan.ts / consolidationCount** — 다지기 카운트에도 필터 적용:
  ```ts
  export function consolidationCount(state, id, step) {
    return sessionsAt(judgingState(state), id, step)
      .filter((r) => r.kind === 'consolidation').length;
  }
  ```

### calendar.ts / reviewDay

- [ ] `reviewDay` 의 `performed` 필터는 그대로 유지 (`kind` 무관). 자유 운동 기록도 그날 `performed` 에 노출됨 (FR-18.8)
- [ ] `reviewDay` 의 `planned` / `doneCount` 계산은 **`planned` 에 자유 운동이 없으므로 자동 배제** (계획된 것이 없으니 done 판정에 영향 없음, FR-18.8)

### index.ts

- [ ] `judgingHistory` / `judgingState` export 추가
- [ ] 필요하다면 `stepStreak` 는 이미 Phase 2 에서 export 됨 확인

### 검사

- [ ] `pnpm test` — 신규 실패 0. Free 필터가 판정 진입점 4곳에 걸린 것을 회귀 케이스로 검증.
- [ ] `pnpm run check` 0/0
- [ ] `grep -n "r.kind === 'free'\|kind !== 'free'\|judgingHistory\|judgingState" src/lib/domain/` — 판정 진입점 4곳 + 헬퍼에만 나타나는지 확인
- [ ] 판정 진입점 검증 grep: `sessionsAt\|lastSession\|sessionIndices` 결과에서 free 필터를 우회하는 판정 경로가 없는지 확인

---

## Commit 2 — UI: 자유 운동 입력 화면 + 카드 조정 + 저장 스키마 kind 확장 (FR-18.1~3 / FR-18.5 / FR-18.9 / EC-42)

### storage.ts

- [ ] `InProgressSession.kind` 를 `'work' | 'consolidation'` → `'work' | 'consolidation' | 'free'` (FR-18.1)
- [ ] `isInProgressShape` 는 kind 검증이 이미 문자열 검사만 하므로 변경 없음. 필요하면 `'free'` 포함 명시 추가.

### session.svelte.ts

- [ ] `beginFree(startedAt, plan)` 또는 `begin(startedAt, plan)` 이 free kind 를 받도록 확장:
  - `plan` 이 `kind: 'free'` 이면 그대로 담는다
  - 별도 인자 방식보다 `PlannedExercise` 유사 구조를 UI 층에서 만들어 `begin()` 에 넘기는 것이 코드 재사용 큼
- [ ] 완료(`finalize`) 로직: `applySession` 에 `input.kind === 'free'` 로 넘겨 조기 반환 경로를 탄다. RPE 최댓값 규칙은 유지 (FR-18.9 / D-11)
- [ ] `abandon` 은 free 세션에는 호출하지 않는다 (자유 운동은 abandon 개념이 없음). UI 에서 취소 버튼으로 진행 중 세션만 삭제 (`clearInProgress`)
  - FR-18.6 표의 (4) "free 도중 중단이 강등으로 잡히면 안 됨" 은 애초에 free 는 abandon 을 안 만드므로 자동 충족

### UI 컴포넌트

- [ ] **FreeExerciseForm.svelte** (신규): 자유 운동 입력 폼
  - 종목 선택 (드롭다운, 6종)
  - 단계 선택 (1~10)
  - 난이도(기준) 선택 (초보자 / 중급자 / 상급자 · 10단계는 최상급자)
  - 선택된 (종목, 단계, 난이도) 로 카탈로그에서 기준 수치 가져와 세트별 입력란 초기값으로 (FR-18.2, FR-6.2a 방식)
  - RPE 선택 입력 (세트별)
  - 잠긴 종목(`checkGate`) 은 종목 드롭다운에서 선택 시 거절 (FR-18.3 / EC-42): 잠긴 종목을 선택 시 잠금 사유 표시 · "저장" 비활성
  - **saveFree()**: `applySession(state, catalog, input)` 을 kind='free' 로 호출. 성공 시 `appState.apply(next)` · `clearInProgress()`
  - **cancel()**: `clearInProgress()` (강등 아님, FR-18.6 (4))

- [ ] **+page.svelte**: 자유 운동 진입점 추가
  - 오늘 화면 하단에 「자유 운동 기록」 버튼 (FR-18.1 언제든 가능하므로 휴식일·운동일 무관 노출)
  - 클릭 시 FreeExerciseForm 모달 표시
  - GLOBAL 「SPEC 과의 불일치 #5」 결정 근거: 오늘 화면이 진입점의 자연스러운 자리

- [ ] **ExerciseCard.svelte**: free 세션이 진행 중일 때의 표시 검토
  - free 세션은 `PlannedExercise` 없이 `InProgressSession` 만 만들어지므로 오늘 화면 카드에 자연스럽게 나타나지 않음
  - 진행 중 free 세션은 하단 배너 형태로 노출 (예: "자유 운동 진행 중 — {종목} {단계}단계 · {sets 진행}") — 오늘 화면 상단이나 카드 위에 표시

### 테스트

- [ ] `tests/unit/free.test.ts` (신규) — Phase 3 TEST 참조
- [ ] `tests/unit/inprogress.test.ts` 확장 — free 세션 진행 중 저장·복원

### 검사

- [ ] `pnpm test` 전부 통과 (예상 555~575개)
- [ ] `pnpm run check` 0/0
- [ ] EC-40~46 회귀 케이스가 각각 테스트 파일에 존재
- [ ] 잠긴 종목에서 자유 운동 시도 시 UI 상 거절 확인 (수동)

---

## Out of Scope (이 페이즈)

- FR-17 오늘 화면 4상태 → Phase 4
- FR-16 상단 바 → Phase 5

## Traceability

| SPEC 항목 | 처리 |
|---|---|
| FR-18.1 | Commit 2 (UI 진입, 언제든 노출) · Commit 1 (kind='free' 판별 유니온) |
| FR-18.2 | Commit 2 (FreeExerciseForm 종목·단계·난이도·세트) |
| FR-18.3 | Commit 2 (checkGate 로 잠긴 종목 거절, EC-42) |
| FR-18.4 | Commit 1 (evaluate.ts / applySession 조기 반환, state.steps 불변, EC-40) |
| FR-18.5 | Commit 1 · Commit 2 (history 에 남음, 조회 노출) |
| FR-18.6 | Commit 1 (판정 진입점 4곳 필터) — leak 표 4행 |
| FR-18.7 | Commit 1 (judgingHistory / judgingState 헬퍼 하나에 집중, ADR-16) |
| FR-18.8 | Commit 1 (reviewDay 의 planned 는 free 무관 · performed 에 노출) |
| FR-18.9 | Commit 2 (session.svelte.ts finalize 에서 RPE 최댓값 규칙 유지) |
| EC-40 | Commit 1 신규 테스트 (state.steps 불변) |
| EC-41 | Commit 1 신규 테스트 (승급 판정 leak 회귀 방지) |
| EC-42 | Commit 2 (UI 상 잠긴 종목 거절) |
| EC-44 | Commit 1 신규 테스트 (다음 목표 계산 leak 회귀 방지) |
| EC-45 | Commit 1 신규 테스트 (강등 판정 leak 회귀 방지) |
| EC-46 | Commit 1 신규 테스트 (유지 카운트 leak 회귀 방지) |
