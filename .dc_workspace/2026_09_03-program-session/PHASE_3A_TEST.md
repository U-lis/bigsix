# Phase 3A: Test Cases

## Test Coverage Target

**Minimum**: 70%. `src/program.ts` 전 함수 커버.

**픽스처 규칙**: `test/helpers.ts` 를 수정하지 않는다. 고유 픽스처는 `test/program.test.ts` 안에 로컬로 정의한다.

**날짜 기준점** (테스트 전반에서 사용):
`2026-09-07`(월) `2026-09-08`(화) `2026-09-09`(수) `2026-09-10`(목) `2026-09-11`(금) `2026-09-12`(토) `2026-09-13`(일)

---

## Unit Tests

### `describeProgram` / `describePrograms` (FR-2.3)

#### 5종 목록
- [ ] Test case: `describePrograms` 가 5종을 반환한다 (FR-2.2)
  - Expected: id 가 `new_blood`, `good_behavior`, `veterano`, `solitary_confinement`, `supermax`

#### 운동일 / 휴식일 (7일 기준)
- [ ] Test case: `new_blood` → `trainingDays: 2`, `restDays: 5`
- [ ] Test case: `good_behavior` → `trainingDays: 3`, `restDays: 4`
- [ ] Test case: `veterano` → `trainingDays: 6`, `restDays: 1`
- [ ] Test case: `solitary_confinement` → `trainingDays: 6`, `restDays: 1`
- [ ] Test case: `supermax` → `trainingDays: 6`, `restDays: 1`
- [ ] Test case: 모든 프로그램에서 `trainingDays + restDays === 7`

#### 종목 목록 (중복 제거)
- [ ] Test case: `new_blood` → `['pushup','squat','pullup','legraise']` (순서 무관, 집합 비교)
- [ ] Test case: `good_behavior` → 빅6 전체
- [ ] Test case: `veterano` → 빅6 전체, **중복 없음** (하루 한 종목이라 원래 중복 없음)
- [ ] Test case: `solitary_confinement` → 빅6 전체. **중복 제거 검증** (풀업이 월·목 2회 등장하지만 목록에는 1개)
- [ ] Test case: `supermax` → 빅6 전체, 중복 제거

#### 보조 운동 (FR-2.3)
- [ ] Test case: `solitary_confinement` → `['악력 운동','종아리 운동','목 운동']` (집합 비교)
- [ ] Test case: `solitary_confinement` 의 악력 운동이 **중복 제거**된다 (월·목 2회 등장)
- [ ] Test case: 나머지 4종 → `accessories` 가 빈 배열
- [ ] Test case: 보조 운동이 `progressionIds` 에 섞이지 않는다
  - Verify: `progressionIds` 의 모든 원소가 빅6 id

#### 기타 필드
- [ ] Test case: `supermax` 만 `note` 를 가진다
  - Expected: 나머지 4종은 `note === undefined`
- [ ] Test case: `frequency` 가 카탈로그 값 그대로다
  - Input: `good_behavior`
  - Expected: `'주 3회 (격일)'`
- [ ] Test case: `name.en` / `name.ko` 가 카탈로그 값 그대로다

#### 파생 원칙 (제약 c)
- [ ] Test case: `data/progressions.json` 에 `trainingDays`/`restDays`/`progressionIds` 키가 없다
  - Verify: 원본 JSON 을 직접 읽어 해당 키 부재 확인 — **파생 계산임을 증명**
- [ ] Test case: `describeProgram` 이 카탈로그 객체를 변형하지 않는다 (NFR-2)

### `firstTrainingDay` (FR-2.6)

- [ ] Test case: `from` 자신이 운동일이면 `from` 반환
  - Input: `('new_blood', '2026-09-07')` (월, `new_blood` 운동일)
  - Expected: `'2026-09-07'`
- [ ] Test case: **EC-2** 선택일이 휴식일이면 다음 운동일
  - Input: `('new_blood', '2026-09-08')` (화, 휴식일)
  - Expected: `'2026-09-10'` (목)
- [ ] Test case: 주 경계를 넘어가는 탐색
  - Input: `('new_blood', '2026-09-11')` (금, 다음 운동일은 다음 주 월)
  - Expected: `'2026-09-14'`
- [ ] Test case: 일요일만 쉬는 프로그램에서 일요일 선택
  - Input: `('veterano', '2026-09-13')` (일)
  - Expected: `'2026-09-14'` (월)
- [ ] Test case: `good_behavior` 화요일 선택 → 수요일
  - Input: `('good_behavior', '2026-09-08')`
  - Expected: `'2026-09-09'`
- [ ] Test case: 5종 × 7요일 = 35 조합 전부 유효한 운동일을 반환한다
  - Verify: 반환된 날짜의 요일표가 빈 배열이 아니고, `from` 으로부터 0~6일 이내
- [ ] Test case: 알 수 없는 `programId` → 예외
  - Verify: 조용히 `from` 을 반환하지 않는다

### `selectProgram` (FR-2.1, FR-2.4)

- [ ] Test case: 미선택 상태에서 선택하면 `stints` 길이가 1
  - Input: `initialState()` 에서 `selectProgram(..., 'good_behavior', '2026-09-07')`
  - Expected: `stints.length === 1`, `programId === 'good_behavior'`, `endedAt === null`
- [ ] Test case: `selectedAt` 은 인자로 준 날짜다
  - Expected: `stints[0].selectedAt === '2026-09-07'`
- [ ] Test case: **EC-2** 휴식일 선택 시 `startedAt` 이 첫 운동일
  - Input: `selectProgram(..., 'new_blood', '2026-09-08')` (화)
  - Expected: `selectedAt === '2026-09-08'`, `startedAt === '2026-09-10'`
- [ ] Test case: 운동일 선택 시 `selectedAt === startedAt`
  - Input: `selectProgram(..., 'new_blood', '2026-09-07')`
  - Expected: 둘 다 `'2026-09-07'`
- [ ] Test case: **FR-3.5** `steps` 가 변경되지 않는다
  - Setup: `steps` 를 임의 값으로 세팅
  - Verify: 반환 상태의 `steps` 가 입력과 완전히 동일
- [ ] Test case: **FR-3.5** `history` 가 변경되지 않는다
  - Setup: 세션 기록 3개
  - Verify: 반환 상태의 `history` 가 동일 길이·동일 내용
- [ ] Test case: **NFR-2** 원본 `state` 가 변형되지 않는다
  - Verify: 원본 `stints.length` 가 호출 전후로 동일
- [ ] Test case: `proposals` 가 보존된다
- [ ] Test case: 알 수 없는 `programId` → 예외 전파

### `switchProgram` (FR-3.1 ~ FR-3.3)

- [ ] Test case: 이전 구간이 `endedAt` 으로 마감된다
  - Setup: `2026-09-07` 에 `new_blood` 선택
  - Action: `2026-09-14` 에 `good_behavior` 로 전환
  - Expected: `stints[0].endedAt === '2026-09-14'`, `stints[1].endedAt === null`
- [ ] Test case: **FR-3.2** 새 구간의 `startedAt` 이 FR-2.6 규칙을 따른다
  - Setup: `good_behavior` 진행 중
  - Action: `2026-09-08`(화, `new_blood` 휴식일)에 `new_blood` 로 전환
  - Expected: 새 구간 `selectedAt === '2026-09-08'`, `startedAt === '2026-09-10'`
- [ ] Test case: **EC-3** A → B → A 가 새 구간이 된다
  - Action: `new_blood` → `good_behavior` → `new_blood`
  - Expected: `stints.length === 3`, 세 번째 `programId === 'new_blood'`,
    세 번째 `startedAt` 이 첫 번째와 다르다
- [ ] Test case: **EC-3 / FR-3.3** 되돌아온 구간의 며칠차가 1부터 시작한다
  - Verify: 세 번째 구간 `startedAt` 당일의 `dayNumber === 1`
- [ ] Test case: 같은 프로그램으로 전환해도 새 구간이 생긴다
  - Action: `new_blood` → `new_blood`
  - Expected: `stints.length === 2`
- [ ] Test case: **FR-3.5** 전환이 `steps`/`history` 를 변경하지 않는다
- [ ] Test case: **FR-3.6** 전환 10회 후 `stints.length === 10`
  - Verify: 자동 정리가 일어나지 않는다. 첫 구간이 그대로 남아 있다
- [ ] Test case: **FR-3.6** 전환 100회 후에도 첫 구간이 보존된다
  - Verify: 개수 상한이 없다

### `currentStint` / `stintAt`

- [ ] Test case: 빈 `stints` 에서 `currentStint` 가 `null`
- [ ] Test case: 활성 구간이 있으면 그것을 반환
- [ ] Test case: 모든 구간이 마감되었으면 `null`
  - Setup: `stints` 마지막의 `endedAt` 이 non-null 인 인위적 상태
- [ ] Test case: `stintAt` 이 과거 구간을 정확히 찾는다
  - Setup: A(`09-07`~`09-14`) → B(`09-14`~)
  - Action: `stintAt(state, '2026-09-10')`
  - Expected: A
- [ ] Test case: **전환 경계일에는 새 구간이 우선한다** (FR-3.2)
  - Action: `stintAt(state, '2026-09-14')`
  - Expected: B (A 가 아니다)
- [ ] Test case: 첫 구간 `selectedAt` 이전 날짜는 `null`
  - Action: `stintAt(state, '2026-09-01')`
  - Expected: `null`
- [ ] Test case: **EC-10** `selectedAt` 과 `startedAt` 사이 날짜는 구간에 속한다
  - Setup: `new_blood` 화요일 선택 (`startedAt` = 목)
  - Action: `stintAt(state, '2026-09-09')` (수)
  - Expected: 그 구간 (`null` 이 아니다)

### `dayNumber` (FR-2.7, FR-5.4, EC-10)

- [ ] Test case: `startedAt` 당일이 1일차
  - Expected: `1`
- [ ] Test case: `startedAt` 다음날이 2일차
- [ ] Test case: **EC-8** 7일 뒤가 8일차 — 수행 여부와 무관
  - Setup: `history` 가 비어 있는 상태
  - Expected: `8`
- [ ] Test case: **EC-8** 기록이 있어도 결과가 같다
  - Setup: 같은 구간, `history` 에 세션 3개
  - Expected: 위와 동일한 `8` — **수행 기록을 보지 않음이 증명된다**
- [ ] Test case: **EC-10** `startedAt` 하루 전은 0
  - Expected: `0` (−1 이 아니다)
- [ ] Test case: **EC-10** `startedAt` 한 달 전도 0
  - Expected: `0`
- [ ] Test case: **EC-10 / FR-5.4** 선택일~첫 운동일 사이 휴식일이 0
  - Setup: `new_blood` 화요일 선택, `startedAt` = 목
  - Action: 화요일·수요일의 `dayNumber`
  - Expected: 둘 다 `0`
- [ ] Test case: `dayNumberOn` 이 활성 구간 없을 때 0
  - Input: 빈 `stints`
  - Expected: `0`
- [ ] Test case: 월·연 경계를 넘는 며칠차
  - Setup: `startedAt = '2026-12-28'`
  - Action: `'2027-01-04'`
  - Expected: `8`

---

## Integration Tests

### 구간 이력 시나리오
- [ ] Test case: 3구간 연속 전환 후 각 날짜의 구간 조회가 정확하다
  - Setup: `new_blood`(09-07) → `good_behavior`(09-21) → `veterano`(10-05)
  - Action: 각 구간 내부의 임의 날짜 3개 조회
  - Verify: 각각 올바른 `programId` 와 며칠차
- [ ] Test case: 구간이 서로 겹치지 않는다 (A-4)
  - Verify: 임의 날짜에 대해 `stintAt` 이 반환하는 구간이 항상 1개(또는 `null`)

### 설명 조회 → 선택 흐름 (FR-2.3 → FR-2.4)
- [ ] Test case: `describePrograms` 결과의 임의 id 로 `selectProgram` 이 성공한다
  - Verify: 조회 API 와 선택 API 의 id 체계가 일치

---

## Edge Cases

### Input Validation
- [ ] 알 수 없는 `programId`: `getProgram` 의 기존 예외가 전파된다. 조용히 무시하지 않는다
- [ ] 잘못된 날짜 형식: 검증하지 않는다 (호출자 책임). Phase 1 결정과 일관

### Boundary Conditions
- [ ] 구간 시작 당일 조회 → `dayNumber` 1, `stintAt` 이 그 구간
- [ ] 구간 마감 당일 조회 → 새 구간 (반개구간 규칙)
- [ ] 구간이 하루짜리 (선택 당일 전환) → `endedAt === selectedAt`. `stintAt` 이 그 날짜에 새 구간을 반환
- [ ] `stints` 가 정확히 1개 (최초 선택)
- [ ] `stints` 가 100개 (FR-3.6 무제한)

### FR-3.6 — 무제한 누적 (구현 부재 검증)
- [ ] Test case: `src/program.ts` 에 `slice`/`splice`/`shift`/상한 상수가 없다
  - Verify: 소스 grep. **구현하지 않았음을 테스트가 아니라 코드 감사로 확인**

---

## Mock/Stub Requirements

**없음.** 순수 함수. `test/helpers.ts` 의 `catalog` 를 읽기 전용으로 사용한다.

**로컬 픽스처 예시** (이 파일 안에 정의, `helpers.ts` 를 건드리지 않는다):
```
stintFixture(programId, selectedAt, startedAt, endedAt = null): ProgramStint
withStints(state, ...stints): AppState
```

---

## Test File Structure

```
test/
├── program.test.ts     # 신규 — 이 Phase 의 유일한 테스트 파일
│   ├── describeProgram / describePrograms
│   ├── firstTrainingDay            (EC-2)
│   ├── selectProgram
│   ├── switchProgram               (EC-3, FR-3.5, FR-3.6)
│   ├── currentStint / stintAt
│   └── dayNumber                   (EC-8, EC-10)
└── helpers.ts          # 수정 금지
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3A

node --experimental-strip-types --test test/program.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/program.test.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (describe) | - | - | - | -% |
| Unit (stint) | - | - | - | -% |
| Edge Cases (EC-2/3/10) | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
