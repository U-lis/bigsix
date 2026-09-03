# Phase 2: Test Cases

## Test Coverage Target

**Minimum**: 70%
`src/evaluate.ts` 와 `src/plan.ts` 의 신규/변경 경로는 전부 커버한다.

---

## Unit Tests

### `src/evaluate.ts`

#### `applySession` — 반환 형태 (ADR-3, FR-8)
- [ ] Test case: 반환 객체에 `state`, `evaluation`, `record` 세 키가 있다
  - Input: 임의의 유효한 `SessionInput`
  - Expected: 세 키 모두 존재
- [ ] Test case: `state.history` 마지막 원소가 반환된 `record` 와 같다
  - Verify: `result.state.history.at(-1)` 이 `result.record` 와 동일 내용
- [ ] Test case: 원본 `state` 가 변형되지 않는다 (NFR-2)
  - Setup: `state.history.length` 를 미리 기록
  - Action: `applySession`
  - Verify: 원본 `state.history.length` 불변, `state.steps` 불변

#### 필드 보존 (C-2) — 타입 검사가 없으므로 테스트가 유일한 방어선
- [ ] Test case: **`applySession` 후 `stints` 가 입력과 동일하다**
  - Setup: `stints` 에 구간 2개가 담긴 `AppState`
  - Action: `applySession`
  - Verify: `result.state.stints` 가 입력과 **같은 길이·같은 내용**.
    `undefined` 가 아니다
- [ ] Test case: **`applySession` 후 `proposals` 가 입력과 동일하다**
  - Setup: `proposals` 에 `pending` 1건 + `declined` 2건
  - Verify: `result.state.proposals.length === 3`, 각 `status` 보존
- [ ] Test case: 반환 상태가 `AppState` 의 4필드를 모두 가진다
  - Verify: `steps` / `history` / `stints` / `proposals` 전부 존재
- [ ] Test case: `applySession` 을 10회 연속 적용해도 `stints` / `proposals` 가 살아 있다
  - Verify: 누적 호출에서도 소실되지 않는다.
    **한 번만 검사하면 "첫 호출만 보존" 같은 부분 구현을 놓친다**

#### `promotedTo` (FR-8)
- [ ] Test case: 승급 시 `promotedTo` 가 채워진다
  - Input: 상급자 기준을 충족하는 세션 (RPE 미입력)
  - Expected: `record.promotedTo === evaluation.nextStep`, `evaluation.promote === true`
- [ ] Test case: 미승급 시 `promotedTo` 가 `undefined`
  - Input: 상급자 기준 미달 세션
  - Expected: `record.promotedTo === undefined`
- [ ] Test case: `promotedTo` 는 `applySession` 만 채운다
  - Input: `SessionInput` 에는 `promotedTo` 필드가 존재하지 않는다
  - Verify: 입력 타입에 그 필드가 없음 (타입 레벨)

#### `blockedBy` (EC-11)
- [ ] Test case: **EC-11** RPE 거부권으로 보류된 세션은 `promotedTo` 가 없고 `blockedBy === 'rpe'`
  - Setup: 같은 종목·단계에서 RPE 8 이상인 `work` 세션 2개를 history 에 넣는다
  - Action: 상급자 기준을 충족하면서 RPE 8 인 세 번째 세션을 `applySession`
  - Verify: `evaluation.promote === false`, `record.promotedTo === undefined`, `record.blockedBy === 'rpe'`
  - **이 케이스가 Phase 3B 의 EC-11 카운트 검증의 전제다**
- [ ] Test case: 마스터 단계에서 기준 충족 시 `blockedBy === 'master'`
  - Input: 10단계에서 최상급자 기준 충족
  - Expected: `record.promotedTo === undefined`, `record.blockedBy === 'master'`
- [ ] Test case: 기준 미달일 때는 `blockedBy` 도 `undefined`
  - Verify: `blockedBy` 는 "기준은 채웠으나 막혔다" 를 뜻하지, 단순 미달을 뜻하지 않는다

#### 동작 보존 회귀 (NFR-3 단서 — 기존 `evaluate.test.ts` 에서 이관)
- [ ] Test case: 승급은 **수행 횟수로만** 판정한다
  - Verify: 심박수 입력 자체가 타입에 없고, RPE 외의 주관 지표가 판정에 쓰이지 않음
- [ ] Test case: RPE 거부권 임계 — 최근 3회 평균 RPE ≥ 8 이면 보류
  - Input: 평균 8.0 정확히
  - Expected: 보류 (`>=` 이므로 경계 포함)
- [ ] Test case: 최근 3회가 채워지지 않으면 거부권이 작동하지 않는다
  - Input: RPE 가 있는 `work` 세션이 2개뿐
  - Expected: 승급 진행
- [ ] Test case: RPE 미입력 세션은 거부권 계산에서 제외된다
  - Verify: `rpe === undefined` 인 세션이 창(window)에 들어가지 않음
- [ ] Test case: `outcome: 'abandoned'` 는 승급하지 않는다
  - Expected: `promote === false`, `nextStep === record.step`, `promotedTo === undefined`
- [ ] Test case: `kind: 'consolidation'` 은 현재 단계의 승급 판정 대상이 아니다
  - Expected: `promote === false`, `metTop === false`, `promotedTo === undefined`
- [ ] Test case: 10단계는 더 올라갈 단계가 없다
  - Expected: `nextStep === 10`

### `src/plan.ts` — `sideNote` (FR-1)

#### `planExercise`
- [ ] Test case: **FR-1.3** `squat` 의 `perSide` 단계 → 문구에 "다리" 포함
  - Input: `squat` 7단계 (`perSide: true`)
  - Expected: `sideNote` 가 "다리" 를 포함하고 "적게 한 쪽" 을 포함
- [ ] Test case: **FR-1.3** `pushup` 의 `perSide` 단계 → "팔"
  - Input: `pushup` 7단계
  - Expected: `sideNote` 에 "팔" 포함
- [ ] Test case: **FR-1.3** `pullup` 의 `perSide` 단계 → "팔"
- [ ] Test case: **FR-1.3** `hspu` 의 `perSide` 단계 → "팔"
- [ ] Test case: **FR-1.4** `perSide` 가 아닌 단계는 `sideNote === undefined`
  - Input: `pushup` 1~6단계 각각
  - Expected: 전부 `undefined`
- [ ] Test case: `legraise` 는 모든 단계에서 `sideNote === undefined`
  - 근거: 데이터에 `perSide` 가 없다 (FR-1 확정: 총 16개 = 4종목 × 4단계)
- [ ] Test case: `bridge` 는 모든 단계에서 `sideNote === undefined`
- [ ] Test case: `perSide` 단계 수가 정확히 16개다
  - Setup: 카탈로그 전 종목 × 전 단계 순회
  - Verify: `sideNote !== undefined` 인 (종목, 단계) 조합이 16개
  - Verify: 그 16개가 `pushup`/`squat`/`pullup`/`hspu` × 7~10단계와 정확히 일치
- [ ] Test case: `unit === 'seconds'` 단계의 문구는 "유지 시간" 을 쓴다
  - Input: `hspu` 의 `perSide` + `seconds` 단계 (있는 경우)
  - Expected: 문구에 "횟수" 가 아닌 "유지 시간"

#### `planConsolidation`
- [ ] Test case: 다지기의 `sideNote` 는 **이전 단계** 기준이다
  - Input: `pushup` 8단계에서 다지기 (실제 수행은 7단계)
  - Expected: `sideNote` 가 7단계의 `perSide` 를 따르고, `perSide` 필드와 일관
- [ ] Test case: 이전 단계가 `perSide` 가 아니면 `sideNote === undefined`
  - Input: `pushup` 7단계에서 다지기 (실제 수행은 6단계, `perSide` 없음)
  - Expected: `undefined`

#### `withPair`
- [ ] Test case: 동반 단계에도 `sideNote` 가 채워진다
  - Input: `hspu` 2단계 (`pairWith: 1`)
  - Verify: `paired.sideNote` 가 1단계의 `perSide` 를 따름

#### FR-1.5 — 계산 무영향 검증 (이 Phase 의 핵심 회귀)
- [ ] Test case: `sideNote` 추가 전후로 `work` 배열이 동일하다
  - Setup: `perSide` 단계와 비-`perSide` 단계 각각에 대해 `work` 타깃 값 스냅샷
  - Verify: 값과 `mode` 가 Phase 1 시점과 동일
- [ ] Test case: `goal` 의 `label`/`sets`/`value` 가 동일하다
- [ ] Test case: `warmup` 세트 수와 값이 동일하다
- [ ] Test case: `reason` 문자열이 동일하다 (`sideNote` 내용이 `reason` 에 섞이지 않음)
- [ ] Test case: `sideNoteFor` 는 `state`/`sets` 를 인자로 받지 않는다
  - Verify: 시그니처가 `(id, perSide)` 뿐이라 구조적으로 수치에 영향 불가

### 동작 보존 회귀 — `test/plan.test.ts` 기존 케이스 전량 유지
- [ ] Test case: 90% 규칙 — 직전 평균이 목표의 90% 이상이면 기준 직접 도전
- [ ] Test case: 유지세트 = 직전 평균 (내림)
- [ ] Test case: 상급자 기준 세트 수에 따른 2세트/3세트 분기
- [ ] Test case: 워밍업 최대 2세트
- [ ] Test case: 다지기 증량 30 → 33 → 36 → 39 (3회 누적마다 10%)
- [ ] Test case: 직전 RPE ≥ 9 이면 유지세트 −1
- [ ] Test case: 초보자 기준 미통과 구간에서는 매번 초보자 기준에 도전

---

## Integration Tests

### `applySession` → `history` → 재평가 없는 판정
- [ ] Test case: 연속 세션에서 승급이 정확히 한 번만 기록된다
  - Setup: 초기 상태
  - Action: 상급자 기준 충족 세션 1회 → 이후 같은 종목 세션 2회
  - Verify: `history` 에서 `promotedTo` 를 가진 레코드가 정확히 1개
  - **이것이 Phase 3B ADR-7 카운트의 입력 형태다**
- [ ] Test case: 승급 후 단계가 오르면 이후 세션의 `step` 이 새 단계다
  - Verify: `state.steps[id]` 와 이후 `planExercise` 의 `step` 이 일치

### `planDay` 경유 — `DayPlan` 구조 무손상
- [ ] Test case: `planDay` 결과의 `exercises` 원소에 `sideNote` 가 존재/부재한다
  - Setup: `perSide` 단계에 도달한 상태 + `good_behavior` 프로그램
  - Action: `planDay(state, catalog, 'good_behavior', '월')`
  - Verify: `exercises[].sideNote` 가 종목별로 올바름
- [ ] Test case: `test/schedule.test.ts` 무수정 통과 (ADR-1 시그니처 불변 재확인)

---

## Edge Cases

### Input Validation
- [ ] `sets: []` 인 세션: 기존 `meetsStandard` 가 `false` 를 반환 → 미승급, `promotedTo` 없음
- [ ] `rpe` 범위 밖 값(0 또는 11): 판정 로직은 그대로 통과시킨다. 검증은 호출자 책임임을 테스트로 고정
- [ ] `performedStep` 미지정 다지기: 기존대로 `step - 1` 로 해석

### Boundary Conditions
- [ ] RPE 평균 정확히 8.0 → 보류 (경계 포함)
- [ ] RPE 평균 7.99 → 승급 진행
- [ ] 1단계에서 상급자 기준 충족 → `promotedTo === 2`
- [ ] 9단계에서 충족 → `promotedTo === 10`
- [ ] 10단계에서 충족 → `promotedTo === undefined`, `blockedBy === 'master'`

### Error Handling
- [ ] 존재하지 않는 단계 번호(`step: 11`): 기존 `getStep` 이 던지는 예외가 그대로 전파된다.
      **`applySession` 이 이 예외를 삼키지 않음을 확인** (조용한 실패 금지)

---

## Mock/Stub Requirements

**없음.** 순수 함수이며 외부 의존이 없다. `test/helpers.ts` 의 `catalog` 와 `stateAt` / `rec` 만 쓴다.

---

## Test File Structure

```
test/
├── evaluate.test.ts    # 재작성 — applySession 반환 형태 + promotedTo/blockedBy + 동작 보존 이관
├── plan.test.ts        # 기존 149줄 전량 유지 + sideNote 블록 추가
├── schedule.test.ts    # 무수정 (회귀 확인용)
├── gate.test.ts        # 무수정
└── data.test.ts        # 무수정
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

node --experimental-strip-types --test test/evaluate.test.ts
node --experimental-strip-types --test test/plan.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (evaluate) | - | - | - | -% |
| Unit (plan / sideNote) | - | - | - | -% |
| 동작 보존 회귀 | - | - | - | -% |
| Integration | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
