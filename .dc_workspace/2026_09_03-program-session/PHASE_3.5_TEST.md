# Phase 3.5: Test Cases

## Test Coverage Target

**Minimum**: 70% (전체 누적)
이 Phase 의 신규 코드는 `proposeSwitchForCurrent` 와 `acceptProposal` 두 함수뿐이며, 둘 다 100% 커버한다.

---

## Unit Tests

### `proposeSwitchForCurrent` (EC-7 배선)

- [ ] Test case: 프로그램 미선택 상태에서 `null`
  - Setup: `initialState()` (빈 `stints`)
  - Input: 월요일 날짜
  - Expected: `null` (예외 아님)
- [ ] Test case: `currentStint.programId` 가 `fromProgramId` 로 전달된다
  - Setup: `good_behavior` 진행 중, 조건 충족
  - Action: 월요일에 호출
  - Expected: `proposal.fromProgramId === 'good_behavior'`, `toProgramId === 'veterano'`
- [ ] Test case: `currentStint.startedAt` 이 `floorDate` 로 전달된다
  - Setup: 구간 `startedAt = '2026-09-14'`, 승급 세션이 `'2026-09-07'`(구간 시작 이전)
  - Action: 월요일에 호출
  - Expected: `null` — **구간 이전의 승급이 카운트되지 않는다**
- [ ] Test case: 화요일에는 여전히 `null` (FR-4.6 유지)
- [ ] Test case: **NFR-2** 원본 `state` 불변

### `acceptProposal` (FR-4.8)

- [ ] Test case: `pending` 이 없으면 no-op
  - Verify: 상태가 그대로. 예외 없음
- [ ] Test case: 제안이 `accepted` 로 갱신된다
  - Expected: `proposals` 마지막 `status === 'accepted'`, `resolvedAt === onDate`
- [ ] Test case: 새 구간이 생성된다
  - Expected: `stints.length` +1, 새 구간 `programId === proposal.toProgramId`
- [ ] Test case: 이전 구간이 마감된다
  - Expected: 직전 구간 `endedAt === onDate`
- [ ] Test case: **FR-4.8** 승인일이 월요일이 아니어도 전환된다
  - Setup: `09-14`(월) 제안 생성·커밋
  - Action: `acceptProposal(..., '2026-09-17')` (목)
  - Verify: 전환 성공. **요일 검사가 없다**
- [ ] Test case: **FR-4.8 / FR-2.6** 새 구간 `startedAt` 이 첫 운동일 규칙을 따른다
  - Setup: `new_blood` 로 전환, 승인일이 `2026-09-08`(화, `new_blood` 휴식일)
  - Expected: `selectedAt === '2026-09-08'`, `startedAt === '2026-09-10'`(목)
- [ ] Test case: 승인일이 새 루틴의 운동일이면 `selectedAt === startedAt`
- [ ] Test case: **FR-3.5** `steps` / `history` 가 변경되지 않는다
- [ ] Test case: 승인 후 `activeProposal` 이 `null`
- [ ] Test case: **NFR-2** 원본 `state` 불변
- [ ] Test case: `markAccepted` 가 `switchProgram` 보다 먼저 적용된다
  - Verify: 최종 상태에 두 효과가 모두 반영되어 있다

### `src/index.ts` export 통합

- [ ] Test case: 3A 의 공개 함수가 전부 `index.ts` 에서 import 된다
  - Verify: `describeProgram`, `describePrograms`, `firstTrainingDay`, `selectProgram`,
    `switchProgram`, `currentStint`, `stintAt`, `dayNumber`
- [ ] Test case: 3B 의 공개 함수가 전부 export 된다
  - Verify: `proposeSwitch`, `proposeSwitchForCurrent`, `commitProposal`, `activeProposal`,
    `declineProposal`, `markAccepted`
- [ ] Test case: 3C 의 공개 함수가 전부 export 된다
  - Verify: `abandonChallenge`, `recordSession`, `recordConsolidation`
- [ ] Test case: 기존 export 가 전부 유지된다
  - Verify: `planDay`, `planWeek`, `planExercise`, `checkGate`, `applySession`, `initialState` 등

---

## Integration Tests

### **EC-7** — 프로그램 전환 시 3회 카운트 리셋 (이 Phase 의 최우선 검증)

> 3A 의 `stint.startedAt` 과 3B 의 카운트가 만나는 **유일한 지점**이다.
> 단독 Phase 에서는 검증할 수 없었다.

- [ ] Test case: **EC-7** 전환 전에는 제안이 생성되고, 전환 직후에는 생성되지 않는다
  - Setup 1: `good_behavior` 구간(`startedAt = '2026-08-31'`), 대상 종목 전부 승급 + 유지 세션 3회씩
  - Action 1: `2026-09-14`(월) 에 `proposeSwitchForCurrent`
  - Verify 1: 제안이 생성된다 (`null` 이 아니다)
  - Setup 2: 같은 상태에서 `2026-09-15` 에 `switchProgram(..., 'veterano', '2026-09-15')`
  - Action 2: `2026-09-21`(월) 에 `proposeSwitchForCurrent`
  - Verify 2: `null` — **새 구간의 `startedAt` 이후 승급 기록이 없으므로 카운트가 0 이다**
- [ ] Test case: **EC-7** 전환 후 다시 3회를 채우면 제안이 생성된다
  - Setup: 위 상태에서 새 구간 시작 이후 승급 + 유지 세션 3회씩 추가
  - Action: 그 다음 월요일에 `proposeSwitchForCurrent`
  - Verify: 제안 생성. **카운트가 새 구간 기준으로 다시 쌓였다**
- [ ] Test case: **EC-7** 전환해도 `history` 는 삭제되지 않는다
  - Verify: 이전 구간의 세션 기록이 그대로 남아 있다.
    **리셋은 데이터 삭제가 아니라 판정 범위 축소로 구현되었다** (ADR-7)
- [ ] Test case: **EC-7** 전용 리셋 코드가 없다
  - Verify: `src/proposal.ts` / `src/program.ts` 에 카운트를 0 으로 만드는 명시적 코드가 없다.
    `floorDate` 주입만으로 성립한다 (코드 감사)

### 제안 승인 → 새 구간 1일차 전체 흐름 (FR-4.6 → FR-4.6a → FR-4.8 → FR-2.6)

- [ ] Test case: 생성 → 커밋 → 매일 노출 → 승인 → 새 구간 1일차
  - Setup: `good_behavior` 진행 중, 조건 충족
  - Action 1: `2026-09-14`(월) `proposeSwitchForCurrent` → `commitProposal`
  - Verify 1: `activeProposal` 이 제안 반환
  - Action 2: `09-15`(화), `09-16`(수) 에 `activeProposal` 호출
  - Verify 2: 같은 제안이 계속 반환된다 (FR-4.6a)
  - Action 3: `09-16`(수) 에 `acceptProposal`
  - Verify 3: `veterano` 새 구간 생성. `selectedAt === '2026-09-16'`,
    `startedAt === '2026-09-16'` (`veterano` 는 수요일이 운동일)
  - Verify 4: `dayNumber(newStint, '2026-09-16') === 1`
  - Verify 5: `activeProposal` 이 `null`
- [ ] Test case: 거절 흐름 — 구간이 바뀌지 않는다
  - Action: `declineProposal(..., '2026-09-16')`
  - Verify: `stints.length` 불변, `currentStint.programId` 가 여전히 `good_behavior`
- [ ] Test case: **FR-4.9** 거절 후 다음 월요일에 재제안되고, 그때 승인하면 전환된다
  - Verify: 거절이 전환을 영구 차단하지 않는다

### 3C ↔ 3B 상호작용 — 포기가 카운트를 무효화한다 (EC-5 통합)

- [ ] Test case: `abandonChallenge` 로 남은 `abandoned` 기록이 제안을 막는다
  - Setup: 전 종목 승급 + 유지 세션 3회씩 → 제안 조건 충족
  - Action 1: 한 종목에 `abandonChallenge` 호출
  - Action 2: 그 다음 월요일에 `proposeSwitchForCurrent`
  - Verify: `null` — **3C 가 만든 기록을 3B 가 읽어 EC-5 가 성립한다**
- [ ] Test case: `recordConsolidation` 으로 남은 다지기 기록도 동일하게 작동한다

### 3C ↔ 3A 상호작용 — 전환이 세션 기록을 건드리지 않는다

- [ ] Test case: **FR-3.5** 여러 세션을 기록한 뒤 전환해도 `history` 와 `steps` 가 보존된다
  - Setup: `recordSession` 5회 + 승급 2회
  - Action: `switchProgram`
  - Verify: `history` 길이 5, `steps` 값 동일

---

## Edge Cases

### 병합 정합성
- [ ] Test case: 세 모듈이 같은 `AppState` 타입을 쓴다
  - Verify: 3A 가 만든 상태를 3B 함수에, 3B 가 만든 상태를 3C 함수에 넘겨도 타입 오류 없음
- [ ] Test case: 순환 import 없음
  - Verify: `src/program.ts` 에 `proposal` 문자열 부재 (코드 감사)

### Boundary Conditions
- [ ] 프로그램 미선택 상태에서 `acceptProposal` 호출 → no-op (`pending` 이 없으므로)
- [ ] 제안 생성 당일에 즉시 승인 → 정상 동작 (월요일 승인)
- [ ] `supermax` 구간에서 `proposeSwitchForCurrent` → 항상 `null`
- [ ] 구간 시작 당일에 전환 → 하루짜리 구간. `endedAt === selectedAt`

### Error Handling
- [ ] `acceptProposal` 을 연속 두 번 호출 → 두 번째는 no-op (`pending` 이 없다)
- [ ] 병합 후 기존 47개 테스트 전량 통과

---

## Mock/Stub Requirements

**없음.** `test/helpers.ts` 의 공통 픽스처(Step 4 에서 추가)를 사용한다.

**통합 테스트 전용 헬퍼** (`test/helpers.ts` 에 추가):
```
stintFixture(programId, selectedAt, startedAt, endedAt = null): ProgramStint
promoted(id, step, date): SessionRecord
plainSession(id, step, date): SessionRecord
readyForProposal(programId, startedAt, promoteDate): AppState
  // 해당 프로그램의 해금된 전 종목이 승급 + 유지 3회를 채운 상태
```

---

## Test File Structure

```
test/
├── integration.test.ts   # 신규 — 이 Phase 의 주 산출물
│   ├── proposeSwitchForCurrent
│   ├── acceptProposal                    (FR-4.8)
│   ├── EC-7 카운트 리셋                  ★ 이 Phase 에서만 검증 가능
│   ├── 제안 승인 → 새 구간 1일차 전체 흐름
│   ├── 3C ↔ 3B (EC-5 통합)
│   └── 3C ↔ 3A (FR-3.5 통합)
├── helpers.ts            # 공통 픽스처 추가 (stateAt 시그니처는 불변)
├── program.test.ts       # 3A 산출물 — 수정하지 않는다
├── proposal.test.ts      # 3B 산출물 — 수정하지 않는다
└── session.test.ts       # 3C 산출물 — 수정하지 않는다
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

node --experimental-strip-types --test test/integration.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/

# EC-7 이 전용 리셋 코드 없이 성립하는지 감사
grep -nE 'reset|리셋|= 0' src/proposal.ts src/program.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (배선 2함수) | - | - | - | -% |
| Integration (EC-7) | - | - | - | -% |
| Integration (승인 흐름) | - | - | - | -% |
| 모듈 간 상호작용 | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
