# Phase 4: Test Cases

## Test Coverage Target

**Minimum**: 70%. `src/calendar.ts` 3함수 전 경로 및 `reviewDay` 4상태 전부 커버.

**날짜 기준점**:
`2026-09-07`(월) `2026-09-08`(화) `2026-09-09`(수) `2026-09-10`(목) `2026-09-11`(금) `2026-09-12`(토) `2026-09-13`(일)

---

## Unit Tests

### `planOn` (FR-6.1, FR-2.5)

#### EC-1 — 프로그램 미선택
- [ ] Test case: **EC-1 / FR-2.5** 미선택 상태에서 `{ kind: 'no-program' }` 반환
  - Setup: `initialState()` (빈 `stints`)
  - Action: `planOn(state, catalog, '2026-09-07')`
  - Expected: `agenda.kind === 'no-program'`, `agenda.date === '2026-09-07'`
- [ ] Test case: **EC-1** 예외를 던지지 않는다
  - Verify: `assert.doesNotThrow`
- [ ] Test case: **EC-1** 반환값에 `exercises` 필드가 없다
  - Verify: 판별 유니온이므로 `no-program` 변형에는 계획 필드가 없다.
    **호출자가 분기를 강제받는다**
- [ ] Test case: 모든 구간이 마감된 상태에서도 `no-program`
  - Setup: `stints` 마지막의 `endedAt` 이 조회일보다 이전
  - Expected: `kind === 'no-program'`

#### 요일 도출 (FR-6.1, FR-6.2)
- [ ] Test case: 날짜에서 요일이 정확히 도출된다
  - Setup: `good_behavior` 선택
  - Action: `2026-09-07`(월) ~ `2026-09-13`(일) 7일
  - Expected: `agenda.weekday` 가 `'월'`~`'일'` 순서
- [ ] Test case: 계획 내용이 `planDay` 직접 호출과 **완전히 동일**하다
  - Setup: 임의 상태 + `good_behavior`
  - Verify: `exercises` / `accessories` / `locked` / `rest` 가
    `planDay(state, catalog, 'good_behavior', '월')` 결과와 일치
  - **ADR-1 위임이 증명된다**
- [ ] Test case: 휴식일에는 `rest === true`, `exercises` 가 빈 배열
  - Input: `good_behavior` 의 화요일
- [ ] Test case: 운동일에는 `rest === false`
  - Input: `good_behavior` 의 월요일

#### 며칠차 (FR-2.7, EC-10)
- [ ] Test case: `startedAt` 당일이 1일차
- [ ] Test case: **EC-8** 며칠 건너뛰어도 달력 기준으로 증가
  - Setup: `history` 가 비어 있음
  - Action: `startedAt` + 7일
  - Expected: `dayNumber === 8`
- [ ] Test case: **EC-10** `startedAt` 이전은 0
  - Setup: `new_blood` 를 화요일에 선택 (`startedAt` = 목)
  - Action: 화요일·수요일 `planOn`
  - Expected: 둘 다 `dayNumber === 0`
- [ ] Test case: **EC-10** 며칠차 0 인 날에도 계획이 정상 생성된다
  - Verify: `kind === 'plan'` (예외 아님). `new_blood` 화·수는 휴식일이므로 `rest === true`

#### 제안 노출 (FR-4.6a, ADR-6)
- [ ] Test case: `pending` 제안이 있으면 `agenda.proposal` 에 담긴다
- [ ] Test case: `pending` 이 없으면 `proposal === null`
- [ ] Test case: **FR-4.6a** 화·수·목에도 같은 제안이 계속 노출된다
  - Setup: 월요일에 `commitProposal`
  - Action: 화~금 각각 `planOn`
  - Verify: 4일 전부 같은 제안
- [ ] Test case: **ADR-6** `planOn` 이 제안을 **생성하지 않는다**
  - Setup: 제안 조건이 충족되었으나 `commitProposal` 을 하지 않은 상태
  - Action: 월요일에 `planOn`
  - Verify: `agenda.proposal === null`. `state.proposals` 도 여전히 빈 배열
  - **조회가 상태를 만들지 않음이 증명된다**
- [ ] Test case: **NFR-2 / FR-5.5** `planOn` 호출 후 원본 `state` 불변
  - Verify: `stints` / `proposals` / `history` / `steps` 전부 동일

### `reviewDay` — 4상태 판정 (FR-5.3, ADR-4)

#### `rest`
- [ ] Test case: 활성 구간이 없으면 `rest`
  - Expected: `status === 'rest'`, `programId === null`, `dayNumber === 0`
- [ ] Test case: 요일표가 빈 날은 `rest`
  - Input: `good_behavior` 의 화요일
  - Expected: `status === 'rest'`, `planned` 가 빈 배열
- [ ] Test case: **ADR-4 (a)** 계획된 종목이 전부 잠긴 날은 `rest`
  - Setup: 빅4 가 6단계 미만 → `bridge`/`hspu` 잠김. `good_behavior` 금요일(hspu + bridge)
  - Expected: `status === 'rest'` (`missed` 가 아니다)
  - **잠긴 종목 때문에 영영 미수행이 되는 상황을 막는다**
- [ ] Test case: **ADR-4 (b)** 보조 운동만 있는 날은 `rest`
  - Setup: 인위적으로 보조 운동만 있는 요일 (또는 `solitary_confinement` 에서
    빅6 가 전부 잠긴 상황)
  - Expected: `planned` 가 빈 배열 → `rest`

#### `missed`
- [ ] Test case: 계획이 있는데 기록이 0개면 `missed`
  - Setup: `good_behavior` 월요일 (푸시업 + 레그 레이즈), `history` 에 그날 기록 없음
  - Expected: `status === 'missed'`, `planned.length === 2`, `performed` 빈 배열
- [ ] Test case: 다른 날의 기록은 그날의 판정에 영향을 주지 않는다
  - Setup: `09-09` 에 기록이 있고 `09-07` 을 조회
  - Expected: `09-07` 이 `missed`

#### `partial`
- [ ] Test case: 계획 2종목 중 1종목만 기록되면 `partial`
  - Setup: `good_behavior` 월요일, `pushup` 만 기록
  - Expected: `status === 'partial'`, `performed.length === 1`
- [ ] Test case: 계획 3종목 중 2종목 기록 → `partial`

#### `done`
- [ ] Test case: 계획 종목 전부 기록되면 `done`
  - Setup: `good_behavior` 월요일, `pushup` + `legraise` 둘 다 기록
  - Expected: `status === 'done'`
- [ ] Test case: **EC-4** 같은 종목을 2회 기록해도 `done`
  - Setup: `pushup` 2회 + `legraise` 1회
  - Expected: `status === 'done'`, `performed.length === 3`
- [ ] Test case: 계획에 없는 종목을 추가로 기록해도 `done`
  - Setup: 계획 2종목 전부 + 계획에 없는 `squat` 1건
  - Expected: `status === 'done'`, `performed.length === 3`

#### 상태 판정 시 `kind`/`outcome` 무시
- [ ] Test case: `outcome: 'abandoned'` 기록도 "수행" 으로 친다
  - Setup: 계획 종목 전부를 `abandoned` 로 기록
  - Expected: `status === 'done'` (`missed` 가 아니다)
  - **미수행은 "기록이 없는 것" 이지 "실패한 것" 이 아니다**
- [ ] Test case: `kind: 'consolidation'` 기록도 "수행" 으로 친다

#### 기타 필드 (FR-5.1)
- [ ] Test case: `programId` 가 그날의 구간 프로그램이다
- [ ] Test case: `performed` 에 세트별 수치·RPE·`kind`·`outcome` 이 전부 담긴다
  - Verify: `SessionRecord` 원본 그대로
- [ ] Test case: 과거 구간의 날짜를 조회하면 그 구간의 `programId` 가 나온다
  - Setup: A(09-07~09-14) → B(09-14~)
  - Action: `reviewDay(state, catalog, '2026-09-10')`
  - Expected: `programId` 가 A
- [ ] Test case: **FR-5.5 / NFR-2** 원본 `state` 불변

### `reviewRange` (FR-5.2, EC-8)

- [ ] Test case: 기간의 모든 날짜가 결과에 포함된다
  - Input: `('2026-09-07', '2026-09-13')`
  - Expected: 길이 7
- [ ] Test case: 날짜 순서가 유지된다
- [ ] Test case: 단일 날짜 구간 → 길이 1
- [ ] Test case: 역순 구간 → 빈 배열
- [ ] Test case: **EC-8** 며칠 건너뛴 구간에서 미수행일이 전부 남는다
  - Setup: `good_behavior` 진행 중. `09-07`(월) 에만 기록하고 `09-09`(수)·`09-11`(금) 은 미수행
  - Action: `reviewRange(state, catalog, '2026-09-07', '2026-09-13')`
  - Expected: `09-07` = `done`, `09-09` = `missed`, `09-11` = `missed`,
    `09-08`/`09-10`/`09-12`/`09-13` = `rest`
  - **앱을 안 연 날들이 결과에서 사라지지 않는다**
- [ ] Test case: **EC-8** 3주를 통째로 건너뛴 경우
  - Setup: 21일간 기록 0건
  - Action: 21일 구간 조회
  - Verify: 운동일이 전부 `missed`, 휴식일이 전부 `rest`. 누락 없음
- [ ] Test case: **EC-8** 며칠차가 건너뛴 날에도 계속 증가한다
  - Verify: 결과 배열의 `dayNumber` 가 1씩 단조 증가 (구간 내에서)
- [ ] Test case: 구간 경계를 넘는 조회
  - Setup: A(09-07~09-14) → B(09-14~)
  - Action: `reviewRange(..., '2026-09-12', '2026-09-16')`
  - Verify: `09-12`/`09-13` 이 A, `09-14`~`09-16` 이 B. 며칠차가 경계에서 1로 리셋
- [ ] Test case: 구간 시작 이전 날짜가 포함된 조회
  - Verify: 그 날짜들이 `programId: null`, `dayNumber: 0`, `status: 'rest'`
- [ ] Test case: 1년치(365일) 조회가 정상 동작한다
  - Verify: 길이 365 또는 366. **상한 제약이 없다** (FR-3.6 취지)
- [ ] Test case: **NFR-2** 원본 `state` 불변

---

## Integration Tests

### 전체 사용 흐름 — 선택 → 계획 → 기록 → 조회
- [ ] Test case: 프로그램 선택부터 주간 조회까지
  - Action 1: `planOn` → `no-program` 확인 (EC-1)
  - Action 2: `selectProgram(..., 'good_behavior', '2026-09-07')`
  - Action 3: `planOn(..., '2026-09-07')` → `dayNumber === 1`, 푸시업 + 레그 레이즈 계획
  - Action 4: 두 종목을 `recordSession` 으로 기록
  - Action 5: `reviewDay(..., '2026-09-07')` → `done`
  - Action 6: `reviewRange(..., '2026-09-07', '2026-09-13')` → 7일 전부 반환

### 전환 후 조회
- [ ] Test case: 전환 전후 날짜의 `programId` 와 며칠차가 정확하다
  - Setup: `new_blood`(09-07) → `veterano`(09-16)
  - Verify: `09-14` 조회 시 `new_blood`, 며칠차 8. `09-16` 조회 시 `veterano`, 며칠차 1

### `planOn` ↔ `reviewDay` 정합성
- [ ] Test case: `planOn` 의 `exercises` 종목과 `reviewDay` 의 `planned` 가 일치한다
  - Verify: 같은 날짜·상태에서 두 함수가 같은 종목 집합을 본다
- [ ] Test case: `planOn` 의 `locked` 종목이 `reviewDay` 의 `planned` 에 없다

### 세션 흐름 연동
- [ ] Test case: `abandonChallenge` 로 남긴 기록이 `reviewDay` 에 반영된다
  - Verify: `performed` 에 `outcome: 'abandoned'` 레코드가 담기고 상태가 `missed` 가 아니다

---

## Edge Cases

### Input Validation
- [ ] `from > to` 인 `reviewRange` → 빈 배열 (예외 아님)
- [ ] 존재하지 않는 날짜 형식 → Phase 1 결정과 일관 (검증하지 않음)

### Boundary Conditions
- [ ] 구간 시작 당일 → 며칠차 1, 계획 정상
- [ ] 구간 시작 하루 전 → 며칠차 0
- [ ] 구간 마감 당일 → 새 구간 기준 (반개구간 규칙)
- [ ] 계획 종목이 정확히 1개인 날 (`veterano` — 하루 한 종목) → `missed` 또는 `done` 만 가능, `partial` 불가
- [ ] `supermax` 처럼 하루 2종목인 날 → 3상태 전부 가능

### Timezone (FR-6.3) — 이 Phase 의 최종 검증
- [ ] Test case: `TZ='America/Los_Angeles'` 에서 `planOn` 결과가 UTC 와 동일하다
  - Verify: `weekday`, `dayNumber`, `exercises` 전부 일치
- [ ] Test case: `TZ='Asia/Seoul'` 에서도 동일
- [ ] Test case: `TZ='Pacific/Kiritimati'`(UTC+14) 에서도 동일
- [ ] Test case: `reviewRange` 결과가 타임존에 무관하다
  - Verify: 7일 조회 시 각 날짜의 `status` 가 세 타임존에서 동일

### Purity (FR-5.5, NFR-2)
- [ ] Test case: 세 함수 모두 `AppState` 를 반환하지 않는다
  - Verify: 반환 타입에 `steps`/`history`/`stints`/`proposals` 가 없다
- [ ] Test case: 같은 인자로 100회 호출해도 결과가 동일하다 (결정성, NFR-5)

---

## Mock/Stub Requirements

**없음.** `test/helpers.ts` 의 공통 픽스처(Phase 3.5 에서 확장)를 사용한다.

**로컬 픽스처** (이 파일 안에 정의):
```
selected(programId, onDate): AppState        // selectProgram 을 거친 상태
recorded(state, catalog, ...inputs): AppState // recordSession 반복 적용
```

---

## Test File Structure

```
test/
├── calendar.test.ts    # 신규 — 이 Phase 의 주 산출물
│   ├── planOn — no-program            (EC-1, FR-2.5)
│   ├── planOn — 요일 도출             (FR-6.1, FR-6.2)
│   ├── planOn — 며칠차                (FR-2.7, EC-8, EC-10)
│   ├── planOn — 제안 노출             (FR-4.6a, ADR-6)
│   ├── reviewDay — 4상태              (FR-5.3, ADR-4)
│   ├── reviewRange                    (FR-5.2, EC-8)
│   ├── 전체 흐름 통합
│   └── 타임존 무관                    (FR-6.3)
└── schedule.test.ts    # 무수정 — ADR-1 최종 확인
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

node --experimental-strip-types --test test/calendar.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/

# 타임존 3종 교차 — 결과가 동일해야 한다
TZ='UTC' node --experimental-strip-types --test test/calendar.test.ts
TZ='Asia/Seoul' node --experimental-strip-types --test test/calendar.test.ts
TZ='America/Los_Angeles' node --experimental-strip-types --test test/calendar.test.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (planOn) | - | - | - | -% |
| Unit (reviewDay 4상태) | - | - | - | -% |
| Unit (reviewRange) | - | - | - | -% |
| Edge Cases (EC-1/8/10) | - | - | - | -% |
| Timezone (FR-6.3) | - | - | - | -% |
| Integration | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
