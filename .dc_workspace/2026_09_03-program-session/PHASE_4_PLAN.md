# Phase 4: 날짜 진입점 + 기록 조회

## Objective

`src/calendar.ts` 를 신설해 **엔진의 외부 진입점**을 완성한다.
FR-5(수행 기록 조회)와 FR-6(실제 달력 요일 사용)을 담당하며,
ADR-1(계층 구조)과 ADR-4(미수행일 파생)를 구현한다.

이 Phase 가 끝나면 "오늘 무엇을 할지" 와 "그날 무엇을 했는지" 를 날짜로 물을 수 있다.

---

## Prerequisites

- [ ] Phase 3.5 완료 — `src/index.ts` export 통합, `acceptProposal` 배선
- [ ] `currentStint` / `stintAt` / `dayNumber` (3A) 사용 가능
- [ ] `activeProposal` (3B) 사용 가능
- [ ] `weekdayOf` / `dateRange` (Phase 1) 사용 가능

---

## Scope

### In Scope
- `src/calendar.ts` (신규) — `planOn`, `reviewDay`, `reviewRange`
- `src/index.ts` — `calendar.ts` export 추가
- `test/calendar.test.ts` (신규)

### Out of Scope
- `planDay` / `planWeek` 의 변경 — ADR-1 안 A 에 따라 **시그니처와 본문 모두 불변**
- `planExercise` 등 수치 로직 — 동작 보존 사양
- 제안 **생성** — `planOn` 은 `activeProposal` 만 읽는다 (ADR-6, NFR-2)
- `'missed'` 상태의 **저장** — ADR-4 에 따라 파생만 한다.
  `AppState` 에 미수행 관련 필드를 추가하지 않는다
- 주간·월간 캘린더 뷰 — SPEC Out of Scope (별도 이슈)

---

## Instructions

### Step 1: `planOn` — 날짜 기반 계획 진입점 (FR-6.1, FR-2.5)

**Files**: `src/calendar.ts`

**Action**: `planOn(state, catalog, date: IsoDate): DayAgenda`

1. `stintAt(state, date)` 로 그날의 구간을 찾는다
2. **`null` 이면** `{ kind: 'no-program', date }` 를 반환한다 (FR-2.5, EC-1).
   **예외를 던지지 않는다.** 호출자가 `kind` 로 분기해 프로그램 선택 화면으로 유도한다
3. 구간이 있으면:
   - `weekday = weekdayOf(date)` (FR-6.2)
   - `dayPlan = planDay(state, catalog, stint.programId, weekday)` — **저수준 함수에 위임** (ADR-1)
   - `dayNumber = dayNumber(stint, date)` — `startedAt` 이전이면 0 (FR-2.7, FR-5.4, EC-10)
   - `proposal = activeProposal(state)` — **읽기만 한다** (ADR-6, FR-4.6a)
4. `{ kind: 'plan', date, weekday, programId, dayNumber, ...dayPlan, proposal }` 을 반환한다

**`planOn` 은 절대 제안을 생성하지 않는다.** `proposeSwitch` 를 호출하지 않는다.
호출하면 순수성(FR-5.5, NFR-2)이 깨지고, 생성이 월요일에만 일어난다는 FR-4.6 도 위반된다.
앱 부팅 시퀀스가 `proposeSwitchForCurrent` → `commitProposal` 을 별도로 호출한다.

### Step 2: `reviewDay` — 하루 조회 (FR-5.1, FR-5.3, ADR-4)

**Files**: `src/calendar.ts`

**Action**: `reviewDay(state, catalog, date: IsoDate): DayReview`

1. `stint = stintAt(state, date)`. `null` 이면
   `{ date, programId: null, dayNumber: 0, status: 'rest', planned: [], plannedExercises: [], accessories: [], performed: [] }`
2. `dayPlan = planDay(state, catalog, stint.programId, weekdayOf(date))`
3. `planned = dayPlan.exercises.map(e => e.progressionId)`
   **`dayPlan.locked` 는 `planned` 에 포함하지 않는다** (ADR-4 부수 결정 a — 잠긴 종목은 판정 대상 아님).
   **`dayPlan.accessories` 도 `planned` 에 포함하지 않는다** (부수 결정 b — 기록 모델이 표현하지 못함)
3-1. `plannedExercises = dayPlan.exercises` 를 **그대로 담는다** (W-2 (c), FR-5.1 "목표").
   이 값은 조회 시점의 `state.steps` 로 재계산된 것이며 그날 당시의 목표가 아니다.
   Phase 1 에서 붙인 JSDoc 이 이 사실을 명시한다. **과거 목표를 복원하려 시도하지 않는다** —
   계획 스냅샷 저장이 필요하고 SPEC 이 요구하지 않는다
3-2. `accessories = dayPlan.accessories` 를 **그대로 담는다** (W-2 (a), FR-5.1 "종목").
   보조 운동도 그날 계획의 일부이므로 조회 결과에 남긴다.
   **단 status 판정에는 쓰지 않는다** — 판정 제외와 결과 삭제는 다른 문제다
4. `performed = state.history.filter(r => r.date === date)`
5. 상태 판정:

| 조건 | status |
|---|---|
| `planned.length === 0` | `rest` |
| `planned` 중 `performed` 에 등장하는 종목이 0개 | `missed` |
| 일부만 등장 | `partial` |
| 전부 등장 | `done` |

"등장" 판정은 `performed.some(r => r.progressionId === id)` 다. `kind` 와 `outcome` 을 보지 않는다 —
포기한 세션도 다지기 세션도 **그날 그 종목을 했다**는 사실이므로 미수행이 아니다.

6. `dayNumber(stint, date)` 를 채운다

### Step 3: `reviewRange` — 기간 조회 (FR-5.2)

**Files**: `src/calendar.ts`

**Action**: `reviewRange(state, catalog, from: IsoDate, to: IsoDate): DayReview[]`

`dateRange(from, to)` 의 각 날짜에 `reviewDay` 를 적용해 배열로 반환한다.
`from > to` 면 빈 배열이다 (Phase 1 `dateRange` 동작).

**상한을 두지 않는다** (FR-3.6 취지). 호출자가 3년치를 요청하면 그만큼 반환한다.

**EC-8 이 이 함수에서 충족된다**: 며칠을 건너뛰어도 그 날짜들이 `dateRange` 에 포함되므로
각각 `missed` 로 결과에 남는다. 앱을 일주일 안 열었어도 그 일주일이 통째로 빠지지 않는다.

### Step 4: `src/index.ts` export 추가

**Files**: `src/index.ts`

**Action**: `export { planOn, reviewDay, reviewRange } from './calendar.ts';`

`planDay` / `planWeek` export 줄의 주석이 "요일 미리보기용 저수준 API. 날짜 기반 진입점은 `planOn`."
으로 되어 있는지 최종 확인한다 (ADR-1).

### Step 5: `'missed'` 저장 금지 확인

**Action**: 코드 감사. `AppState` 에 미수행 관련 필드가 없고,
`reviewDay` / `reviewRange` 가 상태를 반환하지 않음을 확인한다 (FR-5.5, ADR-4).

이 Step 은 "하지 않을 것" 을 명시하기 위해 존재한다.

---

## Implementation Notes

### 왜 `locked` 를 `planned` 에서 빼는가 (ADR-4 부수 결정 a)
`good_behavior` 는 금요일에 `hspu` + `bridge` 를 계획한다. 빅4 가 6단계 미만이면 둘 다 잠긴다.
`locked` 를 `planned` 에 넣으면 그 금요일은 **영원히 `missed`** 가 된다 — 사용자가 할 수 없는 것을
안 했다고 표시하는 셈이다. FR-4.5 가 같은 이유로 잠긴 종목을 제안 판정에서 뺐다. 같은 취지다.

`good_behavior` 금요일처럼 계획된 종목이 **전부** 잠긴 날은 `planned.length === 0` 이 되어
`rest` 로 판정된다. 이것이 의도된 동작이다.

### 왜 `accessories` 를 **판정에서만** 빼는가 (ADR-4 부수 결정 b, W-2)
`SessionRecord.progressionId` 는 `ProgressionId`(빅6) 타입이다.
악력·종아리·목 운동을 기록할 수단이 **타입 수준에서 없다.**
따라서 수행 여부를 알 수 없고, 판정에 포함하면 `solitary_confinement` 사용자는
빅6 를 완벽히 수행해도 **매일 `partial`** 이 되어 4상태가 사실상 2상태로 붕괴한다.
보조 운동만 있는 날은 `planned.length === 0` → `rest` 다.

**그러나 조회 결과에서 지우지는 않는다.** FR-5.1 은 "그날 계획되어 있던 종목" 을 요구하고
보조 운동도 그날 계획의 일부다. `DayReview.accessories` 에 참고 필드로 담는다.

**알려진 한계 (GLOBAL.md ADR-4 에 기록됨)**: 사용자가 보조 운동을 전부 건너뛰어도
그날은 `done` 으로 표시된다. UI 는 `accessories` 를 별도 표시하되 status 로 판단하지 않아야 한다.

### 왜 `plannedExercises` 가 "현재 단계 기준" 일 수밖에 없는가 (W-2 (c))
`planDay` → `planExercise` 는 `state.steps`(현재값)로 목표를 계산한다.
`planOn(과거일)` 로 우회할 수 없다 — 같은 이유로 그것도 현재 단계 기준이다.
그날 당시의 목표를 복원하려면 세션마다 계획 스냅샷을 저장해야 하는데
SPEC 은 그런 필드를 요구하지 않는다(FR-8 이 요구한 것은 승급 결과뿐이다).
따라서 **FR-5.1 의 "목표" 는 현재 단계 기준 재계산값으로 충족**하고,
그 사실을 타입 JSDoc 과 GLOBAL.md 한계 절에 명시했다. 묵시적으로 넘기지 않는다.

### 왜 `planOn` 이 `DayPlan` 을 상속하지 않고 스프레드하는가
`DayPlan` 은 `weekday`/`rest`/`exercises`/`accessories`/`locked` 를 갖는다.
`DayAgenda` 의 `plan` 변형은 여기에 `date`/`programId`/`dayNumber`/`proposal` 을 더한다.
판별 유니온의 다른 변형(`no-program`)은 이 필드들을 갖지 않으므로,
상속보다 명시적 나열이 타입 좁히기(narrowing)에 유리하다.

### `planOn` 이 `dayNumber === 0` 인 날에도 계획을 만드는 이유
EC-10 / FR-5.4 는 며칠차가 0 임을 요구할 뿐 계획을 만들지 말라고 하지 않는다.
선택일~첫 운동일 사이는 그 루틴의 휴식일이므로 `planDay` 가 자연히 `rest: true`,
`exercises: []` 를 돌려준다. **특별 분기를 만들지 않는다.**

---

## Sample Code

없음. 기존 패턴에서 전부 추론 가능하다.

---

## Completion Checklist

- [ ] `src/calendar.ts` 신규 작성
- [ ] **EC-1 / FR-2.5** `planOn` 이 미선택 시 `{ kind: 'no-program' }` 반환. **예외를 던지지 않음**
- [ ] `planOn` 이 `planDay` 에 위임 — `planDay` 본문·시그니처 무변경 (ADR-1)
- [ ] `planOn` 이 `weekdayOf` 로 요일 도출 (FR-6.1, FR-6.2)
- [ ] `planOn` 이 `dayNumber` 를 채움 (FR-2.7)
- [ ] `planOn` 이 `activeProposal` 을 **읽기만** 함. `proposeSwitch` 호출 0건 (ADR-6)
- [ ] `reviewDay` 4상태 판정 구현 (FR-5.3)
- [ ] `reviewDay` 가 `locked` 를 `planned` 에서 제외 (ADR-4 부수 결정 a)
- [ ] `reviewDay` 가 `accessories` 를 `planned`(판정)에서 제외 (ADR-4 부수 결정 b)
- [ ] **`reviewDay` 가 `accessories` 를 별도 필드로 반환** — 판정 제외 ≠ 결과 삭제 (W-2 (a), FR-5.1)
- [ ] **`reviewDay` 가 `plannedExercises` 를 반환** (W-2 (c), FR-5.1 "목표")
- [ ] `plannedExercises` 가 현재 단계 기준 재계산값임이 JSDoc 에 명시됨 — 과거 목표 복원 시도 없음
- [ ] `reviewRange` 가 `dateRange` 의 모든 날짜를 반환 (FR-5.2, EC-8)
- [ ] **FR-5.5 / NFR-2** 세 함수 전부 순수 — `AppState` 를 반환하지 않고 변형하지 않음
- [ ] `AppState` 에 미수행 관련 필드 없음 (ADR-4)
- [ ] `src/index.ts` 에 `planOn` / `reviewDay` / `reviewRange` export
- [ ] `test/calendar.test.ts` 작성 — EC-1 / EC-8 / EC-10 포함
- [ ] `test/schedule.test.ts` 무수정 통과 (ADR-1 최종 확인)
- [ ] 전체 테스트 통과
- [ ] 런타임 통과 (타입 검사는 수행되지 않음 — `--experimental-strip-types` 는 타입을 지울 뿐 검사하지 않는다. 구조 변경은 테스트로 검증한다)

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

node --experimental-strip-types --test test/calendar.test.ts
node --experimental-strip-types --test test/

# ADR-6 — planOn 이 제안을 생성하지 않는지
grep -n "proposeSwitch" src/calendar.ts

# ADR-4 — missed 를 저장하지 않는지
grep -n "missed" src/types.ts | grep -i "AppState"

# ADR-1 — planDay 시그니처 불변 최종 확인
git diff feature/program-session src/schedule.ts

# FR-6.3 — 타임존 무관
TZ='America/Los_Angeles' node --experimental-strip-types --test test/calendar.test.ts
TZ='Asia/Seoul' node --experimental-strip-types --test test/calendar.test.ts
```

### Expected Output
```
# fail 0
(proposeSwitch grep 결과 없음)
(AppState 에 missed 필드 없음)
(schedule.ts diff 는 LABEL_TO_ID export 한 줄뿐)
```

---

## Notes

- 이 Phase 가 완료되면 **SPEC 의 FR-1 ~ FR-10 이 전부 구현된다.** Phase 5 는 검증 전용이다.
- `planOn` 은 앱이 가장 자주 호출할 함수다. 반환 타입 `DayAgenda` 가 판별 유니온인 덕에
  호출자가 미선택 상태를 놓칠 수 없다 — `kind` 를 분기하지 않으면 타입 오류가 난다.
  이것이 FR-2.5 의 "호출자가 분기할 수 있는 명시적 값" 요구를 타입으로 강제하는 방식이다.
- `reviewRange` 는 성능 특성상 O(일수 × 종목 수) 다. `planDay` 가 매일 호출되기 때문이다.
  1년치 조회 시 365회 `planDay` 호출이 발생하지만, 전부 순수 계산이고 I/O 가 없으므로
  이번 범위에서는 최적화하지 않는다. 필요해지면 캐싱을 얹을 자리가 명확하다.

---

## Completion Date

## Completed By
