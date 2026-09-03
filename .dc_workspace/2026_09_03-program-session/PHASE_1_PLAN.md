# Phase 1: 타입 스키마 + 날짜 유틸

## Objective

`AppState` 를 ADR-2 대로 재정의하고, 의존 0의 순수 날짜 유틸 모듈 `src/date.ts` 를 신설한다.
이후 모든 Phase 가 딛고 설 **타입 기반**과 **날짜 산술 기반**을 확정하는 단계다.
이 Phase 는 새로운 동작을 추가하지 않는다 — 타입과 유틸만 놓고, 기존 47개 테스트를 계속 통과시킨다.

---

## Prerequisites

- [ ] `SPEC.md` 및 `GLOBAL.md` 숙지 (특히 ADR-2, ADR-5)
- [ ] 브랜치 `feature/program-session` 체크아웃
- [ ] 기준 상태에서 `node --experimental-strip-types --test test/` 가 47개 통과함을 확인

---

## Scope

### In Scope
- `src/types.ts` — `IsoDate`, `ProgramStint`, `SwitchProposal`, `SessionInput`/`SessionRecord` 분리, `AppState` 재정의, `PlannedExercise.sideNote`, `DayAgenda`, `DayReview`
- `src/date.ts` — 신규. 순수 날짜 유틸 5함수
- `src/index.ts` — `initialState()` 갱신 + `date.ts` export
- `test/helpers.ts` — `stateAt` 이 신규 `AppState` 필드를 채우도록 확장
- `test/date.test.ts` — 신규

### Out of Scope
- `sideNote` **값을 채우는 로직** → Phase 2 (여기서는 타입 필드 선언만)
- `applySession` 시그니처 변경 → Phase 2
- `stints` / `proposals` 를 **조작하는 함수** → Phase 3A / 3B (여기서는 타입 선언과 빈 배열 초기값만)
- `DayAgenda` / `DayReview` 를 **생성하는 함수** → Phase 4 (여기서는 타입 선언만)

---

## Instructions

### Step 1: `IsoDate` 별칭 추가

**Files**: `src/types.ts`

**Action**: `Weekday` 선언 근처에 `IsoDate` 타입 별칭을 추가한다.
`'YYYY-MM-DD'` 형식임을 JSDoc 으로 명시한다. A-5 에 따라 로컬 달력 날짜를 뜻한다.

### Step 2: `SessionRecord` 를 `SessionInput` / `SessionRecord` 로 분리

**Files**: `src/types.ts`

**Action**: 현행 `SessionRecord`(66~81줄)의 필드를 그대로 `SessionInput` 으로 옮기되,
`date` 의 타입을 `string` 에서 `IsoDate` 로 바꾼다.
그 다음 `SessionRecord` 를 `SessionInput` 을 상속하는 인터페이스로 재정의하고
파생 필드 두 개를 추가한다.

- `promotedTo?: number` — 이 세션 결과로 올라간 단계. 승급하지 않았으면 `undefined` (FR-8)
- `blockedBy?: 'rpe' | 'master'` — 기준은 충족했으나 승급이 막힌 사유 (EC-11 증거)

각 필드에 **"엔진(`applySession`)만 채운다. 호출자가 직접 채우지 않는다"** 는 JSDoc 을 단다.

**중요**: 이 단계에서 `evaluate.ts` 는 아직 고치지 않는다. 기존 `applySession` 이
`SessionRecord` 를 인자로 받는 형태 그대로여도 `SessionInput` 이 `SessionRecord` 의 부분집합이므로
타입 오류가 나지 않는다. 실제 시그니처 변경은 Phase 2 다.

### Step 3: `ProgramStint` / `SwitchProposal` 추가

**Files**: `src/types.ts`

**Action**: GLOBAL.md 의 Data Model 절에 있는 두 인터페이스를 그대로 선언한다.
불변식은 JSDoc 주석으로 남긴다.

- `ProgramStint`: 구간은 서로 겹치지 않는다 (A-4). `endedAt === null` 은 진행 중.
- `SwitchProposal`: `proposedAt` 은 항상 월요일 (FR-4.6). `status === 'pending'` 은 최대 1개 (FR-4.6b).

### Step 4: `AppState` 재정의

**Files**: `src/types.ts`

**Action**: 기존 `AppState`(83~88줄)에 두 필드를 **필수(non-optional)로** 추가한다.

- `stints: ProgramStint[]` — 시간순. 마지막 원소의 `endedAt === null` 이면 활성. **빈 배열 = 프로그램 미선택**
- `proposals: SwitchProposal[]` — 시간순

SPEC 충돌 1 의 결정에 따라 **하위 호환을 유지하지 않는다.** optional 로 두지 않는다.

### Step 5: `PlannedExercise.sideNote` 필드 선언

**Files**: `src/types.ts`

**Action**: `PlannedExercise` 에 `sideNote?: string` 을 추가한다.
JSDoc: "`perSide` 단계에서만 채운다. 표시용 사실 문구이며 계산에 관여하지 않는다 (FR-1.5)."
**값을 채우는 로직은 Phase 2 다. 여기서는 필드 선언만 한다.**

### Step 6: `DayAgenda` / `DayReview` 타입 선언

**Files**: `src/types.ts`

**Action**: GLOBAL.md Data Model 절의 `DayAgenda` 판별 유니온과 `DayReview` 인터페이스를 선언한다.
`DayAgenda` 는 `kind: 'no-program' | 'plan'` 로 갈리며, 호출자가 `kind` 로 분기하도록 설계된다 (FR-2.5).
**생성 로직은 Phase 4 다.**

### Step 7: `src/date.ts` 신규 작성

**Files**: `src/date.ts` (신규)

**Action**: 순수 날짜 유틸 5함수를 작성한다. `src/types.ts` 의 타입만 import 하고
다른 프로젝트 모듈은 import 하지 않는다 (의존 0).

| 함수 | 시그니처 | 동작 |
|---|---|---|
| `weekdayOf` | `(date: IsoDate) => Weekday` | `getUTCDay()` 0=일 → `WEEKDAYS` 인덱스로 변환 |
| `addDays` | `(date: IsoDate, n: number) => IsoDate` | `n` 일 뒤 날짜. 음수 허용 |
| `diffDays` | `(from: IsoDate, to: IsoDate) => number` | `to - from` 일수. **음수 허용** (EC-10) |
| `dateRange` | `(from: IsoDate, to: IsoDate) => IsoDate[]` | 양끝 포함. `from > to` 면 빈 배열 |
| `isMonday` | `(date: IsoDate) => boolean` | `weekdayOf(date) === '월'` |

**핵심 제약 (ADR-5)**: `new Date('2026-09-04')` 같은 **ISO 문자열 파싱을 하지 않는다.**
문자열을 숫자 3개로 쪼개 `Date.UTC(y, m - 1, d)` 로 만들고, 읽을 때는 `getUTC*` 만 쓴다.
문자열 파싱은 UTC 로 해석되어 UTC-N 타임존에서 하루 밀린다 (FR-6.3 위반).

**요일 변환 주의 (FR-6.2)**: `WEEKDAYS` 는 `['월','화','수','목','금','토','일']` 로
월요일이 인덱스 0 이다. JS `getUTCDay()` 는 일요일이 0 이다. 변환식은 `(getUTCDay() + 6) % 7` 이다.

### Step 8: `initialState()` 갱신

**Files**: `src/index.ts`

**Action**: `initialState` 반환 객체에 `stints: []`, `proposals: []` 를 추가한다 (FR-10).
빈 `stints` 가 **프로그램 미선택 상태**를 뜻한다는 JSDoc 을 단다.

### Step 9: `date.ts` export 추가

**Files**: `src/index.ts`

**Action**: `export { weekdayOf, addDays, diffDays, dateRange, isMonday } from './date.ts';` 를 추가한다.

또한 기존 `planDay` / `planWeek` export 줄 위에 ADR-1 을 반영한 주석을 단다:
**"요일 미리보기용 저수준 API. 날짜 기반 진입점은 `planOn` (Phase 4)."**

### Step 10: `test/helpers.ts` 확장

**Files**: `test/helpers.ts`

**Action**: `stateAt` 이 `initialState(2)` 를 스프레드하는 대신, 신규 필드를 포함한 완전한 `AppState` 를
반환하도록 고친다. 세 번째 인자로 `stints`, 네 번째로 `proposals` 를 **기본값 빈 배열**로 받는다.

```
stateAt(steps, history = [], stints = [], proposals = [])
```

**이 시그니처는 Phase 3A/3B/3C 가 공유하며, 그 Phase 들에서 수정 금지다.**
필요한 추가 픽스처는 Phase 3.5 에서 넣는다 (GLOBAL.md 병렬화 검증 참조).

`rec` 헬퍼는 시그니처를 유지하되 반환 타입만 `SessionRecord` 로 그대로 둔다
(`promotedTo`/`blockedBy` 는 optional 이므로 기존 호출부가 깨지지 않는다).

### Step 11: 기존 테스트 통과 확인

**Action**: `node --experimental-strip-types --test test/` 를 실행한다.
`data` / `gate` / `plan` / `schedule` / `evaluate` 47개가 전부 통과해야 한다.
이 Phase 에서는 `evaluate.test.ts` 도 아직 깨지지 않는다 (시그니처 변경은 Phase 2).

---

## Implementation Notes

### 왜 `SessionInput` 을 먼저 만들고 `applySession` 은 나중에 고치는가
타입 분리와 시그니처 변경을 한 Phase 에 몰면 Phase 1 에서 `evaluate.test.ts` 가 깨지고,
Phase 1 의 완료 기준("기존 47개 통과")이 성립하지 않는다.
타입만 먼저 놓으면 `SessionInput` 이 `SessionRecord` 의 구조적 부분집합이라
기존 코드가 그대로 컴파일된다.

### `diffDays` 가 음수를 허용해야 하는 이유
EC-10 은 구간 시작일 **이전** 날짜 조회를 허용하고, 그 경우 며칠차 0 을 요구한다.
`dayNumber` 계산은 `diffDays(startedAt, date) + 1` 이고, 결과가 0 이하이면 0 으로 클램프한다.
따라서 `diffDays` 자체는 클램프하지 않고 음수를 그대로 돌려줘야 한다.
**클램프는 `dayNumber`(Phase 3A) 의 책임이지 `diffDays` 의 책임이 아니다.**

### `dateRange` 의 크기
FR-3.6 이 무제한 누적을 명시하므로 `dateRange` 에 상한을 두지 않는다.
호출자가 몇 년치를 요청하면 그만큼 배열이 나온다. **자르는 로직을 넣지 않는다.**

---

## Sample Code

`Date.UTC` 기반 파싱은 프로젝트에 선례가 없는 신규 패턴이므로 형태만 제시한다.

```ts
/** 'YYYY-MM-DD' → UTC epoch ms. 문자열을 Date 생성자에 넘기지 않는다 (ADR-5). */
function toUTC(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** UTC epoch ms → 'YYYY-MM-DD'. */
function toIso(ms: number): IsoDate {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
```

---

## Completion Checklist

- [ ] `src/types.ts` 에 `IsoDate` 선언
- [ ] `SessionInput` / `SessionRecord` 분리, `promotedTo` / `blockedBy` 추가
- [ ] `ProgramStint` / `SwitchProposal` 선언 (불변식 JSDoc 포함)
- [ ] `AppState` 에 `stints` / `proposals` 필수 필드 추가
- [ ] `PlannedExercise.sideNote?: string` 선언
- [ ] `DayAgenda` 판별 유니온 / `DayReview` 선언
- [ ] `src/date.ts` 5함수 작성, 프로젝트 모듈 import 0건
- [ ] `src/date.ts` 에 ISO 문자열 파싱(`new Date('...')`) 0건
- [ ] `initialState()` 가 `stints: []`, `proposals: []` 반환 (FR-10)
- [ ] `src/index.ts` 에 date 유틸 export 및 `planDay` 저수준 주석 추가
- [ ] `test/helpers.ts` `stateAt` 4인자 시그니처로 확장
- [ ] `test/date.test.ts` 작성 (PHASE_1_TEST.md 참조)
- [ ] 기존 47개 테스트 전부 통과
- [ ] 신규 date 테스트 전부 통과
- [ ] 타입 체크 통과

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

# 전체 테스트
node --experimental-strip-types --test test/

# ADR-5 준수 확인 — 두 검색 모두 0건이어야 한다
grep -rn "new Date('" src/ ; grep -rn 'new Date("' src/
grep -rn "new Date()" src/

# NFR-1 확인
node -e "const p=require('./package.json');console.log(p.dependencies ?? {})"
```

### Expected Output
```
# tests 47+ / # pass 47+ / # fail 0
(grep 결과 없음)
{}
```

---

## Notes

- 이 Phase 는 **동작 변경 0** 이 목표다. 새 필드를 읽는 코드가 아직 없으므로
  기존 계산 결과가 달라지면 그것 자체가 버그다.
- `src/date.ts` 는 이후 모든 Phase 가 의존하는 기반이다. 여기서 오프바이원이 나면
  Phase 4 까지 증상이 드러나지 않을 수 있으므로 **7요일 전수 테스트를 반드시 넣는다.**
- `stints` 를 optional 로 두고 싶은 유혹이 있으나 SPEC 충돌 1 이 명시적으로 금지한다.

---

## Completion Date

## Completed By
