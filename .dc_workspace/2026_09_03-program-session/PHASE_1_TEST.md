# Phase 1: Test Cases

## Test Coverage Target

**Minimum**: 70%
이 Phase 의 신규 실행 코드는 `src/date.ts` 5함수뿐이다. **`src/date.ts` 는 100% 를 목표로 한다**
(분기가 단순하고, 이후 전 Phase 가 의존하는 기반이므로).

---

## Unit Tests

### `src/date.ts`

#### `weekdayOf` (FR-6.2)
- [ ] Test case: 7요일 전수 매핑
  - Input: `'2026-09-07'`(월) ~ `'2026-09-13'`(일) 7일 연속
  - Expected: `'월','화','수','목','금','토','일'` 순서대로
- [ ] Test case: 일요일이 `'일'` 로 매핑된다 (`getUTCDay()` 0 → 인덱스 6)
  - Input: `'2026-09-13'`
  - Expected: `'일'`
- [ ] Test case: 월요일이 `'월'` 로 매핑된다 (`getUTCDay()` 1 → 인덱스 0)
  - Input: `'2026-09-07'`
  - Expected: `'월'`
- [ ] Test case: 반환값이 `WEEKDAYS` 배열의 원소다
  - Input: 임의의 30일 연속
  - Expected: 모든 결과가 `WEEKDAYS.includes(...)`

#### `addDays`
- [ ] Test case: 단순 전진
  - Input: `('2026-09-04', 3)`
  - Expected: `'2026-09-07'`
- [ ] Test case: 0 일 전진은 항등
  - Input: `('2026-09-04', 0)`
  - Expected: `'2026-09-04'`
- [ ] Test case: 음수 = 후진
  - Input: `('2026-09-04', -4)`
  - Expected: `'2026-08-31'`
- [ ] Test case: 월말 경계
  - Input: `('2026-01-31', 1)`
  - Expected: `'2026-02-01'`
- [ ] Test case: 연말 경계
  - Input: `('2026-12-31', 1)`
  - Expected: `'2027-01-01'`
- [ ] Test case: 연초 역방향 경계
  - Input: `('2027-01-01', -1)`
  - Expected: `'2026-12-31'`
- [ ] Test case: 윤년 2월 29일
  - Input: `('2028-02-28', 1)`
  - Expected: `'2028-02-29'`
- [ ] Test case: 평년 2월에는 29일이 없다
  - Input: `('2026-02-28', 1)`
  - Expected: `'2026-03-01'`
- [ ] Test case: 반환 형식이 항상 zero-padded `'YYYY-MM-DD'`
  - Input: `('2026-01-05', 0)`
  - Expected: `'2026-01-05'` (`'2026-1-5'` 가 아님)

#### `diffDays`
- [ ] Test case: 같은 날은 0
  - Input: `('2026-09-04', '2026-09-04')`
  - Expected: `0`
- [ ] Test case: 정방향
  - Input: `('2026-09-04', '2026-09-11')`
  - Expected: `7`
- [ ] Test case: **음수 허용** (EC-10 기반)
  - Input: `('2026-09-11', '2026-09-04')`
  - Expected: `-7`
- [ ] Test case: 윤년을 넘는 구간
  - Input: `('2028-02-28', '2028-03-01')`
  - Expected: `2`
- [ ] Test case: 평년 동일 구간
  - Input: `('2026-02-28', '2026-03-01')`
  - Expected: `1`
- [ ] Test case: `addDays` 와의 왕복 항등
  - Input: 임의 날짜 `d`, 임의 정수 `n` (음수 포함)
  - Expected: `diffDays(d, addDays(d, n)) === n`

#### `dateRange` (FR-5.2)
- [ ] Test case: 양끝 포함
  - Input: `('2026-09-04', '2026-09-06')`
  - Expected: `['2026-09-04','2026-09-05','2026-09-06']`
- [ ] Test case: 단일 날짜
  - Input: `('2026-09-04', '2026-09-04')`
  - Expected: `['2026-09-04']`
- [ ] Test case: 역순 구간은 빈 배열
  - Input: `('2026-09-06', '2026-09-04')`
  - Expected: `[]`
- [ ] Test case: 월 경계를 넘는 구간의 길이
  - Input: `('2026-01-30', '2026-02-02')`
  - Expected: 길이 4
- [ ] Test case: 길이가 `diffDays + 1` 과 일치
  - Input: 임의 구간
  - Expected: `dateRange(a,b).length === diffDays(a,b) + 1`

#### `isMonday` (FR-4.6)
- [ ] Test case: 월요일
  - Input: `'2026-09-07'`
  - Expected: `true`
- [ ] Test case: 화~일 6일 전부
  - Input: `'2026-09-08'` ~ `'2026-09-13'`
  - Expected: 전부 `false`

### `src/index.ts`

#### `initialState` (FR-10)
- [ ] Test case: 프로그램 미선택 상태를 반환한다
  - Input: `initialState()`
  - Expected: `stints` 가 `[]`, `proposals` 가 `[]`
- [ ] Test case: 기존 필드가 그대로 유지된다
  - Input: `initialState(2)`
  - Expected: `steps` 6종목 전부 `2`, `history` 가 `[]`

---

## Integration Tests

### 기존 테스트 47개 회귀 (NFR-3)
- [ ] Test case: `test/data.test.ts` 무수정 통과
  - Setup: Phase 1 변경 적용
  - Action: `node --experimental-strip-types --test test/data.test.ts`
  - Verify: 실패 0
- [ ] Test case: `test/gate.test.ts` 무수정 통과 (`helpers.ts` 갱신만으로)
  - Verify: 실패 0. 해금 게이트 동작 보존 사양이 계속 검증됨
- [ ] Test case: `test/plan.test.ts` 무수정 통과
  - Verify: 실패 0. 90% 규칙 · 유지세트 · 상급자 2/3세트 · 워밍업 2세트 · 다지기 증량이 계속 검증됨
- [ ] Test case: `test/schedule.test.ts` 무수정 통과 (ADR-1 안 A 증명)
  - Verify: 실패 0. `planDay` 시그니처가 바뀌지 않았음이 이 통과로 입증된다
- [ ] Test case: `test/evaluate.test.ts` 무수정 통과 (Phase 1 시점)
  - Verify: 실패 0. 시그니처 변경은 Phase 2 이므로 아직 깨지지 않아야 한다

### `LABEL_TO_ID` export (W-1)
- [ ] Test case: `src/schedule.ts` 에서 `LABEL_TO_ID` 를 import 할 수 있다
  - Verify: 3A / 3B 가 복제 없이 재사용 가능
- [ ] Test case: 매핑에 빅6 6종목이 전부 있다
- [ ] Test case: `test/schedule.test.ts` 무수정 통과
  - Verify: export 변경이 `planDay` 동작에 영향을 주지 않았다

### 타입 레벨 검증
- [ ] Test case: `SessionInput` 객체를 `SessionRecord` 자리에 넣어도 컴파일된다
  - Verify: `SessionInput` 이 `SessionRecord` 의 구조적 부분집합임
- [ ] Test case: `AppState` 리터럴에서 `stints` 를 빠뜨리면 타입 오류가 난다
  - Verify: 필수 필드임 (optional 이 아님)

---

## Edge Cases

### Input Validation
- [ ] 존재하지 않는 날짜 문자열(`'2026-02-30'`): `Date.UTC` 가 정규화하므로 `'2026-03-02'` 로 흘러간다.
      **검증 로직을 넣지 않는다** — 이는 호출자 책임이며, 이 동작을 테스트로 고정해 둔다.
- [ ] 빈 `steps`/`history` 상태에서 date 유틸 호출: date 유틸은 `AppState` 를 받지 않으므로 무관

### Boundary Conditions
- [ ] 최소: 같은 날 `diffDays` = 0, `dateRange` 길이 1
- [ ] 최대: `dateRange` 로 3년치(1096일) 요청 시 정상 반환. **상한 없음** (FR-3.6 취지)
- [ ] 윤년: `'2028-02-29'` 가 `weekdayOf` 에서 정상 처리
- [ ] 연도 4자리 유지: `'2099-12-31'` + 1일 = `'2100-01-01'`

### Timezone (FR-6.3, NFR-5) — 이 Phase 의 최우선 검증
- [ ] Test case: UTC-N 타임존에서도 요일이 밀리지 않는다
  - Setup: `TZ='America/Los_Angeles'` (UTC-7/-8)
  - Action: `weekdayOf('2026-09-07')`
  - Verify: `'월'`
- [ ] Test case: UTC+N 타임존에서도 동일
  - Setup: `TZ='Asia/Seoul'` (UTC+9)
  - Action: `weekdayOf('2026-09-07')`
  - Verify: `'월'`
- [ ] Test case: `addDays` 가 타임존에 무관
  - Setup: `TZ='Pacific/Kiritimati'` (UTC+14) 및 `TZ='Pacific/Midway'` (UTC-11)
  - Action: `addDays('2026-09-04', 1)`
  - Verify: 양쪽 다 `'2026-09-05'`
- [ ] Test case: DST 전환일을 넘는 `addDays` 가 정확히 1일
  - Input: `('2026-03-07', 1)` (미국 DST 전환 주간)
  - Verify: `'2026-03-08'`. 시간 단위 산술이 아니라 달력 산술임이 확인된다

---

## Mock/Stub Requirements

**없음.** NFR-1 에 따라 외부 의존이 없고, NFR-5 에 따라 엔진이 시스템 시각을 읽지 않으므로
날짜 모킹 자체가 불필요하다. 모든 날짜는 인자로 주입된다.
타임존 검증은 모킹이 아니라 `TZ` 환경변수로 프로세스를 분리 실행해 수행한다.

---

## Test File Structure

```
test/
├── helpers.ts          # stateAt(steps, history, stints, proposals) 로 확장
├── date.test.ts        # 신규 — 이 Phase 의 주 산출물
│   ├── weekdayOf
│   ├── addDays
│   ├── diffDays
│   ├── dateRange
│   ├── isMonday
│   └── timezone (TZ 무관 검증)
├── data.test.ts        # 무수정
├── gate.test.ts        # 무수정
├── plan.test.ts        # 무수정
├── schedule.test.ts    # 무수정
└── evaluate.test.ts    # 무수정 (Phase 2 에서 재작성)
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

# 이 Phase 의 신규 테스트
node --experimental-strip-types --test test/date.test.ts

# 전체 (기존 47 + 신규)
node --experimental-strip-types --test test/

# 커버리지
node --experimental-strip-types --test --experimental-test-coverage test/

# 타임존 교차 검증 — 세 결과가 동일해야 한다
TZ='UTC' node --experimental-strip-types --test test/date.test.ts
TZ='Asia/Seoul' node --experimental-strip-types --test test/date.test.ts
TZ='America/Los_Angeles' node --experimental-strip-types --test test/date.test.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit Tests (date) | - | - | - | -% |
| Integration (회귀 47) | 47 | - | - | -% |
| Edge Cases (타임존/경계) | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*
