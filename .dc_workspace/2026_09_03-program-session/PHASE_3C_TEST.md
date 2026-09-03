# Phase 3C: Test Cases

## Test Coverage Target

**Minimum**: 70%. `src/session.ts` 3함수 전 경로 커버.

**픽스처 규칙**: `test/helpers.ts` 수정 금지. 고유 픽스처는 `test/session.test.ts` 안에 로컬로.

---

## Unit Tests

### `abandonChallenge` (FR-7.1, FR-7.2, FR-7.4)

#### 기록 (FR-7.1)
- [ ] Test case: `outcome: 'abandoned'` 로 기록된다
  - Input: `pushup` 5단계에서 `abandonChallenge(..., sets: [3, 2])`
  - Expected: `record.outcome === 'abandoned'`, `record.kind === 'work'`
- [ ] Test case: `history` 에 1건 추가된다
- [ ] Test case: 단계가 유지된다 (승급도 강등도 없다)
  - Expected: `state.steps.pushup` 이 호출 전과 동일
- [ ] Test case: `record.promotedTo` 가 `undefined`
  - Verify: `abandoned` 는 승급하지 않는다 (Phase 2 동작 재확인)
- [ ] Test case: `record.date` 가 인자로 준 날짜다
- [ ] Test case: `rpe` 를 넘기면 기록에 남는다
- [ ] Test case: `rpe` 를 생략하면 `record.rpe === undefined`
- [ ] Test case: **NFR-2** 원본 `state` 불변

#### 다지기 계획 (FR-7.2, FR-7.3)
- [ ] Test case: 2단계 이상에서 `canConsolidate === true`
  - Input: `pushup` 5단계
  - Expected: `canConsolidate === true`, `consolidation !== null`
- [ ] Test case: `consolidation.kind === 'consolidation'`
- [ ] Test case: `consolidation.performedStep === step - 1`
  - Input: `pushup` 5단계
  - Expected: `performedStep === 4`
- [ ] Test case: `consolidation.step === state.steps[id]` (훈련 중인 단계 유지)
  - Expected: `5`
- [ ] Test case: **FR-7.3** 다지기 목표가 `planConsolidation` 직접 호출 결과와 **완전히 동일**하다
  - Setup: 같은 상태에서 `planConsolidation` 을 직접 호출
  - Verify: `work` / `goal` / `warmup` / `reason` 전 필드 일치
  - **재구현이 아니라 위임임이 증명된다**
- [ ] Test case: **FR-7.3** 다지기 증량 30 → 33 → 36 → 39 가 그대로 작동한다
  - Setup: 같은 단계에서 다지기 3회 누적된 `history`
  - Action: `abandonChallenge`
  - Verify: `consolidation.work[0].target` 이 10% 증량된 값
  - **동작 보존 사양이 이 경로에서도 유지됨을 확인**

#### 다지기 자동 기록 금지 (FR-7.2)
- [ ] Test case: `abandonChallenge` 는 다지기 세션을 `history` 에 넣지 않는다
  - Verify: `history` 길이가 정확히 +1 (`abandoned` 1건). `consolidation` 기록이 없다
- [ ] Test case: 반환된 `consolidation` 은 계획일 뿐 기록이 아니다
  - Verify: `PlannedExercise` 타입이지 `SessionRecord` 가 아니다

#### EC-9 / FR-7.4 — 1단계에서 '불가능'
- [ ] Test case: **EC-9** 1단계에서 `canConsolidate === false`
  - Input: `pushup` 1단계에서 `abandonChallenge`
  - Expected: `canConsolidate === false`
- [ ] Test case: **EC-9** `consolidation === null`
  - Verify: `planConsolidation` 이 호출되지 않아 예외가 나지 않는다
- [ ] Test case: **EC-9 / FR-7.4** 단계가 그대로 유지된다
  - Expected: `state.steps.pushup === 1`. **0 이나 음수가 되지 않는다**
- [ ] Test case: **EC-9** `abandoned` 기록 자체는 남는다
  - Verify: 다지기가 불가능해도 포기 사실은 기록된다 (EC-5 판정에 필요)
- [ ] Test case: 6종목 전부 1단계에서 동일하게 동작한다

### `recordSession` (FR-7.5, EC-4)

- [ ] Test case: `applySession` 과 동일한 결과를 반환한다
  - Verify: `state` / `evaluation` / `record` 세 필드 모두 일치
- [ ] Test case: **EC-4 / FR-7.5** 같은 날 같은 종목을 두 번 기록할 수 있다
  - Action: `2026-09-07` 에 `pushup` 세션 2건 연속 기록
  - Verify: `history` 길이 +2. 중복 오류가 발생하지 않는다
- [ ] Test case: **EC-4 / FR-7.5** 두 기록이 **각각** 승급 판정된다
  - Setup: 첫 세션은 상급자 기준 미달, 두 번째는 충족
  - Verify: 첫 `record.promotedTo === undefined`, 두 번째 `promotedTo === step + 1`
  - **판정이 독립적임이 증명된다 (A-1)**
- [ ] Test case: **EC-4** 첫 세션에서 승급하면 두 번째 세션의 `step` 이 새 단계다
  - Setup: 첫 세션 승급 후 두 번째 세션을 새 `state.steps` 기준으로 구성
  - Verify: 두 기록의 `step` 이 다르다
- [ ] Test case: **EC-4** 같은 날 3회 이상도 허용된다
- [ ] Test case: 날짜 역순 기록도 거부되지 않는다
  - Action: `09-10` 기록 후 `09-07` 기록
  - Verify: 예외 없음. **검증 로직이 없음이 사양**
- [ ] Test case: **NFR-2** 원본 `state` 불변

### `recordConsolidation` (FR-7.2)

- [ ] Test case: `kind: 'consolidation'` 으로 기록된다
- [ ] Test case: `performedStep === step - 1`
  - Input: `pushup` 5단계
  - Expected: `record.step === 5`, `record.performedStep === 4`
- [ ] Test case: 단계가 유지된다 (다지기는 승급 대상이 아니다)
  - Expected: `state.steps.pushup === 5`
- [ ] Test case: `record.promotedTo === undefined`
- [ ] Test case: `outcome` 이 설정되지 않는다
  - Expected: `record.outcome === undefined`
- [ ] Test case: 1단계에서 호출하면 예외
  - Verify: 조용히 `performedStep: 0` 을 기록하지 않는다
- [ ] Test case: 기록된 다지기가 `consolidationCount` 에 반영된다
  - Verify: 다음 `planConsolidation` 의 증량 계산에 쓰인다

---

## Integration Tests

### FR-7 전체 흐름 — 포기 → 확인 → 승인 → 다지기
- [ ] Test case: 3단계 흐름이 이어진다
  - Setup: `pushup` 5단계, 초보자 기준 미달 상태
  - Action 1: `abandonChallenge(..., '2026-09-07', [3, 2])`
  - Verify 1: `history` 1건, `canConsolidate === true`, `consolidation` 존재
  - Action 2: 사용자가 승인 → `recordConsolidation(newState, ..., '2026-09-07', sets)`
  - Verify 2: `history` 2건. 첫 건 `abandoned`/`work`, 둘째 건 `consolidation`
  - Verify 3: `state.steps.pushup` 이 여전히 `5`
- [ ] Test case: 사용자가 거절하는 흐름
  - Action: `abandonChallenge` 만 하고 `recordConsolidation` 을 호출하지 않는다
  - Verify: `history` 1건, 단계 유지. **정상 상태다**

### Phase 3B 의 EC-5 판정에 필요한 데이터 형태
- [ ] Test case: 포기만 한 경우에도 `outcome: 'abandoned'` 가 남는다
  - Verify: 다지기를 거절해도 강등 판정 근거가 `history` 에 존재한다 (FR-4.3)
- [ ] Test case: 포기 + 다지기 수행 시 두 근거가 모두 남는다
  - Verify: `abandoned` 1건 + `consolidation` 1건

### 다지기 누적 증량 (동작 보존 사양)
- [ ] Test case: 포기 → 다지기 를 4회 반복하면 목표가 30 → 30 → 30 → 33 로 간다
  - Verify: `RULES.consolidationBumpEvery` 회마다 10% 증량.
    **`session.ts` 를 경유해도 증량 규칙이 동일하다**

---

## Edge Cases

### Input Validation
- [ ] `sets: []` 로 포기: 기록은 남고 미승급. 예외 없음
- [ ] 존재하지 않는 종목 id: `getStep`/`getProgression` 의 기존 예외가 전파된다
- [ ] `rpe` 범위 밖 값: 검증하지 않는다 (Phase 2 결정과 일관)

### Boundary Conditions
- [ ] 1단계 (EC-9) → `canConsolidate === false`
- [ ] 2단계 → `canConsolidate === true`, `performedStep === 1` (최소 유효값)
- [ ] 10단계 → `canConsolidate === true`, `performedStep === 9`
- [ ] 빈 `history` 상태에서 첫 포기 → 정상 동작

### Error Handling
- [ ] `recordConsolidation` 을 1단계에서 호출 → 예외. 메시지에 종목과 단계가 드러난다
- [ ] `abandonChallenge` 는 1단계에서도 예외를 던지지 않는다
  - **`canConsolidate` 로 걸러 `planConsolidation` 호출을 회피하기 때문**

---

## Mock/Stub Requirements

**없음.** 순수 함수.

**로컬 픽스처** (이 파일 안에 정의):
```
atStep(id, n): AppState                  // 특정 종목만 n단계인 상태
withConsolidations(state, id, step, n)   // 다지기 n회가 누적된 history
```

---

## Test File Structure

```
test/
├── session.test.ts     # 신규 — 이 Phase 의 유일한 테스트 파일
│   ├── abandonChallenge — 기록        (FR-7.1)
│   ├── abandonChallenge — 다지기 계획 (FR-7.2, FR-7.3)
│   ├── abandonChallenge — 1단계       (EC-9, FR-7.4)
│   ├── recordSession                  (FR-7.5, EC-4)
│   ├── recordConsolidation            (FR-7.2)
│   └── 전체 흐름 통합
└── helpers.ts          # 수정 금지
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3C

node --experimental-strip-types --test test/session.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/session.test.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (abandonChallenge) | - | - | - | -% |
| Unit (recordSession) | - | - | - | -% |
| Unit (recordConsolidation) | - | - | - | -% |
| Edge Cases (EC-4/9) | - | - | - | -% |
| Integration (흐름) | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
