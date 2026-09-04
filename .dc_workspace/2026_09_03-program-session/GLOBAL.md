# 프로그램 세션 엔진 (Program & Session Engine) - Global Documentation

**Target Version**: 0.1.0
**Work Type**: feature
**Base Branch**: `main`
**Working Branch**: `feature/program-session`
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-program-session`
**SOT**: 같은 디렉터리의 `SPEC.md` — 본 문서와 어긋나면 SPEC 이 이긴다.

---

## Feature Overview

**Purpose**
빅6(6종목 × 10단계) 훈련 엔진에 **달력 기반 진행** 개념을 도입한다.
지금까지의 엔진은 "이 종목 이 단계에서 다음 목표가 무엇인가"만 답할 수 있었고,
"오늘이 며칠차이고 오늘 무엇을 할지"는 답할 수 없었다.

**Problem** (SPEC Overview 그대로)
1. `AppState` 에 현재 수행 중인 프로그램 정보가 없다.
2. 요일 문자열(`'월'`)만 받고 실제 `Date` 를 받지 않는다.
3. 프로그램 전환(수동/자동 제안) 개념이 없다.
4. `perSide` 단계에서 어느 쪽을 입력할지 사용자에게 알릴 수단이 없다.
5. 미수행일이 조회 결과에서 사라진다.

**Solution**
`AppState` 에 **프로그램 구간(stint)** 과 **전환 제안(proposal)** 을 도입하고,
그 위에 **날짜 기반 진입점**(`planOn` / `reviewDay` / `reviewRange`)을 얹는다.
기존 계산 로직(`plan.ts` / `gate.ts` / `schedule.ts`)은 **동작 보존 사양**이므로 그대로 호출한다.
이번 작업은 **엔진만** 다룬다 (UI 는 Out of Scope).

---

## Architecture Decision

### ADR-1: `planDay` 시그니처 — 안 A (저수준 유지 + 날짜 기반 상위 진입점 신규)

**Options Considered** (SPEC 충돌 2 의 참고용 대안)
1. 안 A: `planDay`/`planWeek` 를 명시적 인자 저수준 함수로 유지하고, 날짜 기반 상위 진입점을 신규 추가
2. 안 B: `planDay` 에서 `programId` 인자를 제거하고 상태에서 읽도록 통합 (breaking)
3. 안 C: 스케줄 모듈 자체를 날짜 중심으로 재작성

**Decision**: 안 A. `planDay(state, catalog, programId, weekday)` / `planWeek` 는 **현 시그니처 그대로 유지**하고,
신규 `src/calendar.ts` 에 `planOn(state, catalog, date)` 를 추가한다.

**Rationale**
1. **안 B 는 기능 손실이다.** `programId` 를 상태에서만 읽으면 아래가 전부 막힌다.
   - FR-2.3: 아직 선택하지 않은 프로그램 5종의 설명·요일표 조회
   - FR-4.7: 다음 순번 프로그램의 요일표 조회 (제안 대상은 아직 상태에 없다)
   - FR-2.6 / FR-3.2: `startedAt` 계산 시 **상태에 없는** `programId` 의 요일표를 앞으로 훑어야 한다
2. **안 C 는 비용 대비 이득이 없다.** `src/schedule.ts` 68줄은 "요일 → 계획" 이라는 단일 책임을 이미 정확히 수행한다.
   날짜 → 요일은 그 위에 한 겹 얹는 순수 사상이다 (YAGNI).
3. `test/schedule.test.ts` 52줄이 **무수정 생존**한다.

**계층 구조**
```
calendar.ts  planOn(state, catalog, date) : DayAgenda      ← 외부 진입점 (FR-6, FR-2.5)
     │        program.ts stintAt / dayNumber 로 programId·며칠차 결정
     ▼
schedule.ts  planDay(state, catalog, programId, weekday) : DayPlan   ← 저수준, 무변경
     ▼
plan.ts      planExercise / planWarmup / planConsolidation           ← 동작 보존 (수치 로직 무변경)
```

`src/index.ts` 는 `planDay` / `planWeek` 를 계속 export 하되, JSDoc 에
**"요일 미리보기용 저수준 API. 날짜 기반 진입점은 `planOn`."** 임을 명시한다.

---

### ADR-2: `AppState` 신규 스키마 — 단일 `stints` 배열 + 단일 `proposals` 배열

**Options Considered**
1. SPEC 예시 그대로 3필드: `program`(현재) / `pastPrograms`(과거) / `declinedSwitches`(거절 이력)
2. 2필드 통합: `stints`(현재+과거 단일 배열) / `proposals`(생성·승인·거절 통합 레코드)

**Decision**: 옵션 2.

**Rationale**
- FR-5.1 은 **임의 과거 날짜**의 `programId` 와 며칠차를 조회해야 한다. 현재/과거가 두 필드로 나뉘면
  모든 조회가 두 소스를 합쳐야 하고, 전환마다 "현재 → 과거로 이동" 로직이 붙는다.
  단일 배열이면 `stintAt(state, date)` **하나로** 과거·현재를 동일하게 처리한다. `currentStint` 는 파생이다.
- `declinedSwitches` 는 **제안의 상태**이지 별개의 사건이 아니다. FR-4.9 의
  "거절 이력은 보존하되 재제안 차단에 쓰지 않는다" 는 `status: 'declined'` 레코드를 남기되
  `proposeSwitch` 가 그것을 **읽지 않는 것**으로 충족한다.
- SPEC 충돌 1 이 필드명·중첩 구조를 "예시일 뿐이며 설계 단계에서 확정한다" 고 명시했다.
- 하위 호환 없음(충돌 1 결정). 신규 필드는 **optional 이 아니다.**

> **설계 결정 — 합의 완료 (1/3)**: SPEC 예시의 3필드를 2필드(`stints`/`proposals`)로 통합한다.
> 근거와 확정 경위는 아래 "설계 결정 — 합의 완료" 절 참조.

---

### ADR-3: 승급 사실 기록 — 입력/저장 타입 분리 + `promotedTo` / `blockedBy`

**Decision**
`SessionInput`(사용자·UI 가 제출, 파생 필드 없음)과 `SessionRecord`(history 에 저장, 파생 필드 포함)를 분리한다.
`applySession(state, catalog, input: SessionInput): { state; evaluation; record: SessionRecord }`

**Rationale**
1. **SPEC 충돌 3("재평가 없이 판정") 충족** — FR-4.1 판정은 `history` 를 뒤에서 스캔해
   해당 종목의 마지막 `promotedTo` 보유 레코드를 찾고, 그 이후 세션을 세면 끝난다.
2. **EC-11 이 스키마 수준에서 자동 충족** — RPE 거부권으로 보류된 세션은
   `promotedTo === undefined`, `blockedBy === 'rpe'` 이므로 애초에 카운트 기준점이 되지 않는다.
   별도 예외 처리 코드가 필요 없다.
3. **입력/저장 분리가 위조를 구조적으로 차단** — `promotedTo` 는 `evaluateSession` 결과에서만 나온다.
   호출자가 `promotedTo` 를 직접 채워 넣을 수 있는 경로가 타입 수준에서 존재하지 않는다.
4. 중첩 객체 대신 평평한 두 필드 — `record.promotedTo !== undefined` 라는 **단일 술어**가
   "이 세션에서 승급했는가"를 그대로 표현한다.

---

### ADR-4: 미수행일 — 저장하지 않는다. 계획 − 기록의 차집합으로 유도

**Decision**
`'missed'` 는 **저장되지 않는 파생 상태**다. `reviewDay(state, catalog, date)` 가
(활성 구간의 그날 요일표) ∖ (그날 `history`) 로 계산한다.

**Rationale**
1. **저장하려면 트리거가 필요한데 엔진에 트리거가 없다.** NFR-5 로 엔진은 시스템 시각을 읽지 않으므로
   "어제가 지났으니 missed 를 기록한다"를 실행할 주체가 없다. 호출자에게 맡기면
   앱을 일주일 안 열었을 때 그 일주일이 통째로 빠진다 — EC-8 이 금지하는 상황이다.
2. **조회는 순수 함수여야 한다** (FR-5.5). 따라서 조회 시점에 저장할 수 없다.
3. `stints` + `history` 만으로 **임의 날짜의 계획 유무가 결정적으로 복원된다.**
   파생 가능한 값을 저장하면 부정합만 생긴다.

**상태 판정 규칙 (FR-5.3, 4상태)**

| 조건 | status |
|---|---|
| 활성 구간 없음 / 그날 요일표가 빈 배열 / 계획된 종목이 전부 잠김 | `rest` |
| 계획된 빅6 종목 중 그날 기록이 0개 | `missed` |
| 계획된 종목 중 일부만 기록 | `partial` |
| 계획된 종목 전부 기록 | `done` |

**부수 결정 2건**
- (a) `checkGate` 로 잠긴 종목은 계획에서 빠지므로 **missed 판정 대상이 아니다.**
  잠긴 종목 때문에 그날이 영영 `partial` 이 되는 것을 막는다 (FR-4.5 와 같은 취지).
- (b) **보조 운동(악력·종아리·목)은 status 판정에서 제외한다.** 기록 모델(`SessionRecord.progressionId`)이
  빅6만 표현하므로 수행 여부를 알 방법이 없다. 보조 운동만 있는 날은 빅6 계획이 0개이므로 `rest` 다.
  **다만 조회 결과에서 지우지는 않는다** — `DayReview.accessories` 에 참고 필드로 남긴다 (FR-5.1).

#### ADR-4 의 명시적 한계 — 다음 UI 작업이 알아야 할 전제

1. **보조 운동 미수행이 감지되지 않는다.**
   `solitary_confinement` 사용자가 빅6만 하고 악력·종아리·목 운동을 전부 건너뛰어도
   그날은 `done` 으로 표시된다. status 는 **빅6 수행 여부만** 말한다.
   보조 운동을 판정에 넣으려면 `SessionRecord` 가 보조 운동을 표현할 수 있어야 하는데,
   SPEC 은 그 확장을 요구하지 않는다(FR-1.1 이 기록 모델을 빅6로 한정).
   포함하면 `solitary_confinement` 사용자는 **매일 `partial`** 이 되어 4상태가 사실상 2상태로 붕괴한다.
   UI 는 `accessories` 필드를 별도로 표시하되 status 로 판단하지 않아야 한다.

2. **과거 시점의 목표 수치를 복원할 수 없다.**
   `DayReview.plannedExercises` 는 조회 시점의 `state.steps` 로 재계산된다.
   "그날 목표가 3×15 였다" 를 정확히 되살리려면 계획 스냅샷 저장이 필요하며 이번 범위 밖이다.

3. **`'missed'` 는 저장되지 않는다.** 파생 상태이므로 `AppState` 를 지나간 뒤에는
   `stints` + `history` 로부터 매번 다시 계산된다. 상태 자체를 UI 가 캐싱하면 부정합이 생긴다.

> **설계 결정 — 합의 완료 (2/3)**: 보조 운동(악력·종아리·목)을 `missed` **판정**에서 제외하되,
> `DayReview.accessories` 참고 필드로 **조회 결과에는 남긴다.**
> 근거와 확정 경위는 아래 "설계 결정 — 합의 완료" 절 참조.

---

### ADR-5: 날짜 주입 경계 — 공개 API 의 첫 인자. 엔진 전체에 `new Date()` 0회

**Decision**
신규 순수 모듈 `src/date.ts` 를 만든다(의존 0). 날짜가 필요한 **모든 공개 함수가 `date: IsoDate` 를
명시적 인자로 받는다.** "오늘이 며칠인가"는 전적으로 호출자(UI) 책임이다.

| 함수 | 시그니처 | 용도 |
|---|---|---|
| `weekdayOf` | `(date: IsoDate) => Weekday` | `getDay()` 0=일 → `'일'` 변환 (FR-6.2) |
| `addDays` | `(date: IsoDate, n: number) => IsoDate` | `firstTrainingDay` 전방 탐색 |
| `diffDays` | `(from: IsoDate, to: IsoDate) => number` | 며칠차. **음수 허용** (EC-10) |
| `dateRange` | `(from: IsoDate, to: IsoDate) => IsoDate[]` | `reviewRange` (FR-5.2) |
| `isMonday` | `(date: IsoDate) => boolean` | 제안 생성일 판정 (FR-4.6) |

**타임존 처리 (FR-6.3)**
내부 산술은 전부 `Date.UTC(y, m - 1, d)` 기반으로 한다.
**`new Date('2026-09-04')` 같은 ISO 문자열 파싱을 금지한다** — 이 형식은 UTC 로 해석되므로
UTC-N 타임존에서 `getDay()` / `getDate()` 가 하루 밀린다.
`'YYYY-MM-DD'` 를 숫자 3개로 직접 쪼개 `Date.UTC` 에 넣고 `getUTC*` 로만 읽으면
**실행 환경 타임존과 무관하게 동일한 결과**가 나온다.
이것이 FR-6.3("로컬 타임존 기준, 하루 밀림 방지")의 의도이자 NFR-5(결정성)를 동시에 만족시키는 방법이다.
`'YYYY-MM-DD'` 는 이미 로컬 달력 날짜이며, 엔진은 그 위에서 달력 산술만 하면 된다.

---

### ADR-6: 제안 생성과 노출의 분리 (FR-4.6 vs FR-4.6a vs NFR-2)

**Problem**
생성은 월요일에만(FR-4.6), 노출은 매일(FR-4.6a), 그런데 조회는 순수 함수여야 한다(FR-5.5 / NFR-2).
따라서 **조회가 제안을 만들어 저장할 수 없다.**

**Decision**: 2단계 API 로 분리한다.

| 함수 | 성격 | 역할 |
|---|---|---|
| `proposeSwitch(state, catalog, date): SwitchProposal \| null` | 순수 판정 (FR-4.10) | 월요일이 아니면 `null`. 조건 미달이면 `null`. `supermax` 면 `null` |
| `commitProposal(state, proposal): AppState` | 상태 전이 | `pending` 으로 `proposals` 에 적재 |
| `activeProposal(state): SwitchProposal \| null` | 순수 조회 | 저장된 `pending` 을 반환 — **날짜 무관, 매일 노출** |
| `advanceProposals(state, catalog, date): AppState` | 전이 (부팅용) | 위 두 단계를 하나로 묶는다 — 호출자가 순서를 틀릴 여지를 없앤다 (Phase 3.5) |

`planOn` 은 `activeProposal` 만 읽고 **절대 생성하지 않는다.**
앱 부팅 시퀀스는 **`advanceProposals` 하나만** 호출한다.
`proposeSwitch`(순수, FR-4.10 의 `null` 반환 계약)와 `commitProposal`(전이)은
단위 테스트 가능성을 위해 개별 함수로 남기되, **호출자에게 노출되는 정상 경로는 하나다.**

**분리 자체는 선택이 아니라 필수다.** FR-4.6b 가 "제안은 상태에 저장되어야 하며
매 조회마다 새로 계산되는 휘발성 값이 아니다" 를 요구하고 NFR-2 / FR-5.5 가 조회의 순수성을
요구하므로, "조회가 필요할 때 알아서 만드는" 형태는 SPEC 하에서 구성이 불가능하다.

#### `activeProposal` 의 현재 구간 필터 (Phase 3.5 에서 적용)

`pending` 제안이 있는 상태에서 사용자가 FR-3.1 로 **수동 전환**하면
`fromProgramId` 가 이미 끝난 구간을 가리키는 **고아 pending** 이 남는다. 그러면
`activeProposal` 이 그것을 계속 노출하고(FR-4.6a), `proposeSwitch` 는
"`pending` 이 있으면 `null`"(FR-4.6b) 이라 **새 제안이 영원히 생성되지 않는다.**
SPEC 에 이 상황에 대한 조항이 없으므로 설계에서 메운다.

→ `activeProposal` 은 `currentStint.programId === proposal.fromProgramId` 인 `pending` 만 반환한다.
`proposeSwitch` 의 pending 검사도 같은 필터를 쓴다.
**이력은 보존되고**(고아 pending 을 삭제하지 않는다) **재제안 차단만 풀린다.**
시그니처는 여전히 1인자이므로 FR-4.6a(날짜 무관 매일 노출)는 구조로 유지된다.

> **설계 결정 — 합의 완료 (3/3)**: 제안 생성이 `proposeSwitch` + `commitProposal` 로 분리되되,
> 호출자에게 노출되는 정상 경로는 `advanceProposals` 하나다.
> 근거와 확정 경위는 아래 "설계 결정 — 합의 완료" 절 참조.

---

### ADR-7: "승급 후 세션 3회" 카운트는 저장 필드가 아니다 (EC-5 / EC-6 / EC-7)

**Decision**
카운트를 `AppState` 필드로 두지 않고 `history` 에서 파생 계산한다.

```
조회 범위      = 그 종목의 세션 중 date >= currentStint.startedAt 인 것 (EC-7 날짜 하한)
effectiveFloor = 조회 범위 안 마지막 강등 세션의 history 인덱스 + 1 (없으면 0)
baseline       = effectiveFloor 이상인 가장 이른 promotedTo 보유 세션의 history 인덱스
카운트         = baseline 보다 뒤 인덱스인 그 종목의 세션 수 (kind 무관 — FR-4.2)
```

**기준점 전후 비교는 날짜가 아니라 `history` 인덱스로 한다 (W-1).**
FR-4.2 가 요구하는 것은 "날짜 3일" 이 아니라 "**세션 3회**" 이고, EC-4 는 같은 날 같은 종목을
두 번 기록하는 것을 허용한다. 날짜로 비교하면 **승급 당일의 두 번째 세션이 통째로 누락된다**
(`date > baseline` 이 거짓). 같은 이유로 강등 하한도 "강등일 + 1일" 이 아니라 "강등 인덱스 + 1" 이다 —
그래야 승급 당일의 강등, 강등 당일의 재승급이 정확히 판정된다.
`currentStint.startedAt` 은 구간 경계이므로 그것만 날짜 비교로 남는다 (당일 포함).

**FR-4.3 이 FR-4.2 보다 우선한다 — 대상 종목의 `consolidation` 은 카운트되지 않고 하한을 올린다.**
FR-4.2 는 "`kind` 무관" 이라 다지기도 세라고 읽히고, FR-4.3 은 다지기를 강등으로 보아 리셋하라고 한다.
SPEC 안에서 두 조항이 충돌하며, 구현은 FR-4.3 을 택한다. 그 결과 `maintenanceCount` 의 필터에
`kind` 조건은 없지만 **그 종목의 다지기는 구조적으로 절대 세어지지 않는다** — `effectiveFloor` 가
그 다지기 뒤로 밀려 기준점 자체가 사라지기 때문이다. `kind` 무관 필터가 실제로 의미를 갖는 것은
**다른 종목의** 세션이 섞이지 않는다는 것뿐이다. 강등이면서 동시에 유지 세션일 수는 없다.

**강등은 사후 무효화가 아니라 기준점의 하한(floor)으로 처리한다.**
"`baseline` 이후에 강등이 있으면 카운트 0" 이라는 사후 무효화 방식은
"`baseline` 은 가장 이른 승급"(EC-6 대응)과 충돌해 **구간 내 영구 0** 을 만든다.

```
09-07 승급(기준점) → 09-09 abandoned → 09-20 재승급 → 09-22, 24, 26 세션
사후 무효화: baseline 은 여전히 09-07, 그 이후 강등 존재 ⇒ 카운트가 영원히 0
하한 승격  : effectiveFloor = abandoned 다음 인덱스, baseline = 09-20 승급 ⇒ 카운트 3 (정상 재계수)
```

SPEC EC-5 는 **"카운트 리셋"** 이지 "구간 내 영구 무효화" 가 아니다.
사후 무효화로 두면 FR-4.1 제안이 그 구간에서 다시는 생성되지 않고,
"조건이 만족되는 한 매주 월요일에 계속 제안한다"는 **FR-4.9 도 함께 무너진다.**

**Rationale**
저장 필드로 두면 EC-5(강등 리셋) · EC-6(추가 승급 시 유지) · EC-7(전환 시 리셋)이
전부 **서로 다른 갱신 경로**가 되어 어긋난다. 파생이면 규칙 하나로 셋 다 나온다.

**EC-5 와 EC-6 은 서로 다른 층에서 처리된다** — 이 분리가 핵심이다.
강등(EC-5)은 baseline 을 정하기 **전에** 하한으로 적용되고,
추가 승급 무시(EC-6)는 baseline 을 정한 **후에** 적용된다.
둘을 같은 층(둘 다 baseline 이후 스캔)에서 처리하면 서로를 무력화한다.

| EC | 파생 계산에서의 처리 |
|---|---|
| EC-5 승급 직후 강등 → 리셋 | `outcome: 'abandoned'` 또는 `kind: 'consolidation'` 중 **마지막 것의 다음 인덱스**를 하한으로 승격. 강등 이전 승급이 조회 범위 밖으로 밀려나고, **재승급하면 새 기준점이 잡혀 재계수된다.** SPEC 충돌 4 대로 스키마 변경 불필요 |
| EC-6 3회 전 추가 승급 → 유지 | 기준점은 **카운트가 시작된 승급**이어야 한다. `effectiveFloor` 이후 **가장 이른** 승급이 기준점이며 **중간의 `promotedTo` 는 기준점을 갱신하지 않는다** |
| EC-7 전환 시 리셋 | `currentStint.startedAt` 을 **조회 범위의 날짜 하한**으로 쓰는 것만으로 자동 충족. **전용 리셋 코드 없음** |
| EC-11 RPE 보류 | `promotedTo` 가 없으므로 기준점 후보가 아니다 (ADR-3) |

---

## Data Model

### `IsoDate`
```ts
export type IsoDate = string;   // 'YYYY-MM-DD'
```

### `ProgramStint` — 한 프로그램을 수행한 연속 구간
```ts
export interface ProgramStint {
  programId: string;
  selectedAt: IsoDate;      // 사용자가 프로그램을 고른 날
  startedAt: IsoDate;       // 그 루틴의 첫 운동일 = 1일차 (FR-2.6)
  endedAt: IsoDate | null;  // 진행 중이면 null
}
```
불변식: 구간은 서로 겹치지 않는다 (A-4). `endedAt === null` 인 구간은 배열 마지막에 최대 1개다.

### `SwitchProposal` — 자동 전환 제안 1건 (생성·승인·거절 이력을 한 레코드로)
```ts
export interface SwitchProposal {
  proposedAt: IsoDate;      // 항상 월요일 (FR-4.6)
  fromProgramId: string;
  toProgramId: string;
  status: 'pending' | 'accepted' | 'declined';
  resolvedAt: IsoDate | null;
}
```
불변식: `status === 'pending'` 인 레코드는 **최대 1개** (FR-4.6b).

### `AppState`
```ts
export interface AppState {
  steps: Record<ProgressionId, number>;
  history: SessionRecord[];
  stints: ProgramStint[];      // 시간순. 마지막의 endedAt===null 이면 활성. 빈 배열 = 미선택
  proposals: SwitchProposal[]; // 시간순
}
```
`initialState()` → `{ steps, history: [], stints: [], proposals: [] }` (FR-10).

### `SessionInput` / `SessionRecord` (ADR-3)
```ts
/** 사용자·UI 가 제출. 파생 필드 없음. */
export interface SessionInput {
  date: IsoDate;
  progressionId: ProgressionId;
  step: number;
  performedStep?: number;
  sets: number[];
  rpe?: number;
  kind: 'work' | 'consolidation';
  outcome?: 'completed' | 'abandoned';
}

/** history 에 저장. 파생 필드는 엔진만 채운다. */
export interface SessionRecord extends SessionInput {
  promotedTo?: number;            // 이 세션으로 올라간 단계 (FR-8)
  blockedBy?: 'rpe' | 'master';   // 기준은 충족했으나 승급이 막힌 사유 (EC-11 증거)
}
```

### `PlannedExercise` 확장 (FR-1)
```ts
sideNote?: string;   // perSide 단계에서만. 예: '양쪽 팔을 모두 수행하고, 적게 한 쪽의 횟수를 입력한다.'
```

### `DayAgenda` — FR-2.5 를 만족하는 판별 유니온 (예외를 던지지 않는다)
```ts
export type DayAgenda =
  | { kind: 'no-program'; date: IsoDate }
  | {
      kind: 'plan';
      date: IsoDate;
      weekday: Weekday;
      programId: string;
      dayNumber: number;                  // FR-2.7 / FR-5.4
      rest: boolean;
      exercises: PlannedExercise[];
      accessories: AccessoryItem[];
      locked: { progressionId: ProgressionId; reason: string }[];
      proposal: SwitchProposal | null;    // activeProposal (FR-4.6a)
    };
```
호출자는 `agenda.kind` 로 분기한다. 미선택 상태에서 예외가 발생하지 않는다.

### `DayReview` — FR-5.1 / FR-5.3
```ts
export interface DayReview {
  date: IsoDate;
  programId: string | null;
  dayNumber: number;                     // 활성 구간 없거나 startedAt 이전이면 0
  status: 'rest' | 'done' | 'partial' | 'missed';

  /** 그날 계획된 빅6 (잠긴 종목 제외). status 판정의 유일한 근거다. */
  planned: ProgressionId[];

  /**
   * 그날 계획된 빅6 의 목표 수치.
   * 주의 — 이 값은 **조회 시점의 state.steps 로 재계산한 값**이지
   * 그날 당시의 목표가 아니다. 그날 이후 단계가 오르내렸다면 수치가 다르다.
   * 과거 시점 목표의 정확한 복원은 이번 범위에서 지원하지 않는다 (아래 한계 참조).
   */
  plannedExercises: PlannedExercise[];

  /**
   * 그날 계획된 보조 운동(악력·종아리·목).
   * **참고 필드다 — status 판정에 쓰지 않는다.**
   * 기록 모델이 보조 운동을 표현하지 못하므로 수행 여부를 알 수 없다 (ADR-4 부수 결정 b).
   */
  accessories: AccessoryItem[];

  performed: SessionRecord[];            // 그날 history
}
```

**FR-5.1 "그날 계획되어 있던 종목·목표" 의 충족 범위**
- 종목: `planned` + `accessories` 로 **완전히 충족**한다. 보조 운동도 그날 계획의 일부이므로
  판정에서 빼되 **조회 결과에서는 지우지 않는다** — 판정 제외와 결과 삭제는 다른 문제다.
- 목표: `plannedExercises` 로 제공하되 **현재 단계 기준 재계산값**이다.
  `planDay` 가 `state.steps`(현재값)로 목표를 계산하므로 과거 시점 목표를 복원할 수 없다.
  이것은 **알려진 한계**이며, 복원하려면 세션마다 계획 스냅샷을 저장해야 하는데
  SPEC 이 그런 필드를 요구하지 않는다. 정확한 과거 목표가 필요하면 별도 작업으로 다룬다.

### Relationships
```
AppState
 ├── steps      : 종목 → 현재 단계          (프로그램과 독립, FR-3.5)
 ├── history    : SessionRecord[]           → promotedTo/blockedBy 로 EC-5/6/11 판정 (ADR-3/7)
 ├── stints     : ProgramStint[]            → stintAt(date) → programId, dayNumber
 └── proposals  : SwitchProposal[]          → activeProposal() → pending 1개

Catalog (data/progressions.json, 변경 금지)
 ├── progressions : 6종목 × 10단계
 └── programs     : 5종 요일표 + frequency + note
```

---

## API Design

### 신규 공개 함수

| 모듈 | 함수 | 성격 | FR |
|---|---|---|---|
| `date.ts` | `weekdayOf` / `addDays` / `diffDays` / `dateRange` / `isMonday` | 순수 | FR-6.2, FR-6.3 |
| `program.ts` | `describeProgram` / `describePrograms` | 순수 조회 | FR-2.3 |
| `program.ts` | `firstTrainingDay(catalog, programId, from)` | 순수 | FR-2.6 |
| `program.ts` | `selectProgram(state, catalog, programId, onDate)` | 상태 전이 | FR-2.1, FR-2.4 |
| `program.ts` | `switchProgram(state, catalog, programId, onDate)` | 상태 전이 | FR-3.1~3.3 |
| `program.ts` | `currentStint` / `stintAt` / `dayNumber` | 순수 | FR-2.7, FR-5.4 |
| `proposal.ts` | `proposeSwitch(state, catalog, date)` | 순수 판정 | FR-4.1~4.7, FR-4.10 |
| `proposal.ts` | `commitProposal` / `activeProposal` / `declineProposal` / `markAccepted` | 전이/조회 | FR-4.6a, FR-4.6b, FR-4.9 |
| `proposal.ts` | `proposeSwitchForCurrent(state, catalog, date)` | 순수 판정 | EC-7 배선 (Phase 3.5) |
| `proposal.ts` | `advanceProposals(state, catalog, date)` | 전이 (부팅용) | ADR-6 정상 경로 단일화 (Phase 3.5) |
| `session.ts` | `abandonChallenge(state, catalog, id, date)` | 전이 | FR-7.1~7.4 |
| `session.ts` | `recordSession(state, catalog, input)` | 전이 | FR-7.5 |
| `calendar.ts` | `planOn(state, catalog, date): DayAgenda` | 순수 | FR-2.5, FR-6.1 |
| `calendar.ts` | `reviewDay` / `reviewRange` | 순수 | FR-5.1~5.5 |
| `index.ts` | `acceptProposal(state, catalog, onDate)` | 전이 | FR-4.8 |

### 시그니처가 바뀌는 기존 함수
| 함수 | 전 | 후 |
|---|---|---|
| `applySession` | `(state, catalog, record: SessionRecord) => { state, evaluation }` | `(state, catalog, input: SessionInput) => { state, evaluation, record: SessionRecord }` |

### 시그니처가 유지되는 기존 함수 (ADR-1)
`planDay`, `planWeek`, `getProgram`, `listPrograms`, `planExercise`, `planWarmup`,
`planConsolidation`, `canConsolidate`, `consolidationCount`, `withPair`,
`checkGate`, `unlockedProgressions`, `evaluateSession`, `sessionsAt`, `lastSession`, `mean`, `meetsStandard`

---

## 모듈 구성표

| 파일 | 상태 | 책임 | Phase |
|---|---|---|---|
| `src/types.ts` | 확장 | `IsoDate`, `ProgramStint`, `SwitchProposal`, `SessionInput`/`SessionRecord` 분리, `AppState` 재정의, `PlannedExercise.sideNote`, `DayAgenda`, `DayReview` | 1 |
| `src/date.ts` | **신규** | 순수 날짜 유틸 (의존 0) | 1 |
| `src/rules.ts` | 무변경 | 상수 | — |
| `src/catalog.ts` | 무변경 | 데이터 로딩 | — |
| `src/gate.ts` | 무변경 | 해금 판정 (동작 보존) | — |
| `src/history.ts` | 무변경 | 조회 헬퍼 | — |
| `src/schedule.ts` | 최소 변경 | 저수준 요일 계획 (ADR-1). **`LABEL_TO_ID` 를 export 로 바꾸는 한 줄만** — `planDay`/`planWeek` 시그니처·본문 불변 | 1 |
| `src/plan.ts` | 소폭 확장 | `sideNote` 채우기만 추가. **수치 로직 무변경** (FR-1.5) | 2 |
| `src/evaluate.ts` | 시그니처 변경 | `applySession` 이 `SessionInput` 받아 `record` 반환 (ADR-3) | 2 |
| `src/program.ts` | **신규** | 구간 관리 + 프로그램 설명 파생 | 3A |
| `src/proposal.ts` | **신규** | 자동 전환 제안 판정·상태 전이 | 3B |
| `src/session.ts` | **신규** | 세션 흐름 (도전/포기/다지기 연결) | 3C |
| `src/calendar.ts` | **신규** | 날짜 기반 계획 진입점 + 수행 기록 조회 | 4 |
| `src/index.ts` | 확장 | export 통합, `initialState()` 갱신, `acceptProposal` 배선 | 1, 3.5, 4 |

### Files to Create
```
bigsix/
├── src/
│   ├── date.ts          # 순수 날짜 유틸 5함수. Date.UTC 기반 (ADR-5)
│   ├── program.ts       # 구간 관리 + describeProgram (ADR-2)
│   ├── proposal.ts      # 자동 전환 제안 (ADR-6, ADR-7)
│   ├── session.ts       # abandonChallenge / recordSession
│   └── calendar.ts      # planOn / reviewDay / reviewRange (ADR-1, ADR-4)
└── test/
    ├── date.test.ts
    ├── program.test.ts
    ├── proposal.test.ts
    ├── session.test.ts
    ├── calendar.test.ts
    └── integration.test.ts
```

### Files to Modify
```
src/types.ts             # 신규 타입 추가 + AppState / SessionRecord 재정의
src/schedule.ts          # LABEL_TO_ID 를 export 로 (한 줄). planDay/planWeek 불변
src/plan.ts              # sideNote 필드 채우기 (수치 로직 무변경)
src/evaluate.ts          # applySession 시그니처 변경, promotedTo/blockedBy 전사
src/index.ts             # export 통합, initialState 갱신, acceptProposal
test/helpers.ts          # stateAt 에 stints/proposals 기본값
test/evaluate.test.ts    # 재작성 (반환 형태 변경)
test/plan.test.ts        # sideNote 케이스 추가 (기존 케이스 전량 유지)
```

---

## Phase Overview

| Phase | Description | Status | Dependencies |
|-------|-------------|--------|--------------|
| 1 | 타입 스키마 재정의 + 순수 날짜 유틸 (ADR-2, ADR-5) | 🔴 Not Started | - |
| 2 | 승급 기록 필드 (ADR-3) + 좌우 고지 sideNote (FR-1) | 🔴 Not Started | Phase 1 |
| 3A | 프로그램 구간 관리 · 설명 조회 (FR-2, FR-3) | 🔴 Not Started | Phase 2 |
| 3B | 자동 전환 제안 (FR-4, ADR-6, ADR-7) | 🔴 Not Started | Phase 2 |
| 3C | 세션 흐름 — 포기·다지기 연결 (FR-7) | 🔴 Not Started | Phase 2 |
| 3.5 | Merge parallel branches — export 통합 + acceptProposal 배선 | 🔴 Not Started | Phase 3A, 3B, 3C |
| 4 | 날짜 기반 진입점 + 수행 기록 조회 (FR-5, FR-6, ADR-1, ADR-4) | 🔴 Not Started | Phase 3.5 |
| 5 | 회귀 · Edge Case 전수 대조 · 커버리지 (NFR-3, NFR-4) | 🔴 Not Started | Phase 4 |

**Status Legend**:
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Complete
- ⚠️ Blocked

### 각 Phase 의 산출 파일

| Phase | 신규/수정 파일 |
|---|---|
| 1 | `src/types.ts`, `src/date.ts`(신규), `src/index.ts`, `src/schedule.ts`(`LABEL_TO_ID` export 만), `test/helpers.ts`, `test/date.test.ts`(신규) |
| 2 | `src/evaluate.ts`, `src/plan.ts`, `test/evaluate.test.ts`(재작성), `test/plan.test.ts` |
| 3A | `src/program.ts`(신규), `test/program.test.ts`(신규) |
| 3B | `src/proposal.ts`(신규), `test/proposal.test.ts`(신규) |
| 3C | `src/session.ts`(신규), `test/session.test.ts`(신규) |
| 3.5 | `src/index.ts`, `src/proposal.ts`, `test/helpers.ts`, `test/integration.test.ts`(신규) |
| 4 | `src/calendar.ts`(신규), `src/index.ts`, `test/calendar.test.ts`(신규) |
| 5 | `test/*` (검증·보강만) |

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──┬─→ Phase 3A ──┐
                      ├─→ Phase 3B ──┼─→ Phase 3.5 ──→ Phase 4 ──→ Phase 5
                      └─→ Phase 3C ──┘
```

---

## 병렬화 검증 (3A / 3B / 3C)

### 파일 겹침 — 0건

| Phase | 소스 | 테스트 |
|---|---|---|
| 3A | `src/program.ts` | `test/program.test.ts` |
| 3B | `src/proposal.ts` | `test/proposal.test.ts` |
| 3C | `src/session.ts` | `test/session.test.ts` |

**겹침이 0건인 것은 저절로 그런 것이 아니라 두 건을 사전에 이관했기 때문이다.**

1. **`src/schedule.ts` 의 `LABEL_TO_ID` export** — 3A(종목·보조 운동 목록)와 3B(판정 대상 종목)가
   둘 다 이 매핑을 필요로 한다. 각자 export 로 바꾸면 같은 파일을 동시에 고쳐 충돌한다.
   → **Phase 1 Step 10 에서 미리 export 로 바꾼다.** 3A·3B 는 `schedule.ts` 를 수정하지 않고 import 만 한다.
2. **`src/index.ts` export 통합** — 세 Phase 모두 금지. Phase 3.5 에서 일괄 처리.

### 모듈 의존 — 상호 import 0건
셋 다 Phase 1/2 산출물(`types.ts`, `date.ts`, `evaluate.ts`, `plan.ts`, `schedule.ts`, `gate.ts`)만 import 한다.
유일한 잠재 의존이던 **3B 의 `acceptProposal → switchProgram`** 은 **의도적으로 Phase 3.5 로 분리**했다.

### 테스트 픽스처
`test/helpers.ts` 는 **Phase 1 에서 확정**하고 3A/3B/3C 는 **수정 금지**한다.
각 Phase 고유 픽스처는 자기 테스트 파일 안에 로컬로 둔다.

### 충돌 예측 및 대응

| 범주 | 지점 | 대응 |
|---|---|---|
| 머지 충돌 | `src/index.ts` — 세 Phase 모두 export 를 추가하려 함 (**최고 확률**) | 3A/3B/3C 는 `index.ts` 를 **건드리지 않는다.** export 는 전부 Phase 3.5 에서 일괄 처리 |
| 머지 충돌 | `src/schedule.ts` — 3A·3B 가 둘 다 `LABEL_TO_ID` 를 export 로 바꾸려 함 | **Phase 1 Step 10 으로 이관해 사전 제거.** 3A/3B 는 `schedule.ts` 를 수정하지 않는다 |
| 머지 충돌 | `test/helpers.ts` 공유 픽스처 | Phase 1 에서 확정, 3단계는 수정 금지, 필요분은 Phase 3.5 |
| 통합 | 3B `acceptProposal` ↔ 3A `switchProgram` | Phase 3.5 에서 배선. 3B 는 `markAccepted` 까지만 |
| 통합 | 3B 카운트 하한 ↔ 3A `currentStint.startedAt` (EC-7) | 3B 는 `startedAt` 을 **파라미터로 받는 형태**로 구현, Phase 3.5 에서 결합 |
| 테스트 | EC-7 은 3A·3B 단독으로 검증 불가 | Phase 3.5 의 `test/integration.test.ts` 에서 검증 |

### 워크트리 (병렬 실행 시)
```bash
git worktree add ../bigsix-feature-program-session-3A feature/program-session-3A feature/program-session
git worktree add ../bigsix-feature-program-session-3B feature/program-session-3B feature/program-session
git worktree add ../bigsix-feature-program-session-3C feature/program-session-3C feature/program-session
```

---

## 기존 테스트 47개 처리 방침

NFR-3 은 기존 테스트 통과를 의무화하지 않지만, **동작 보존 사양을 검증하던 케이스는
형태가 바뀌더라도 동등한 검증이 남아 있어야 한다.**
설계 결과 **폐기 0건, 재작성 1파일**로 끝난다.

| 파일 | 줄 | 처리 | Phase | 근거 |
|---|---|---|---|---|
| `test/data.test.ts` | 76 | **유지** | — | 데이터 스키마 검증. JSON 은 변경 금지 대상(제약 c) |
| `test/gate.test.ts` | 37 | **유지** | 1 | `AppState.steps` 만 사용. `helpers.ts` 갱신으로 자동 통과 |
| `test/plan.test.ts` | 149 | **유지 + 추가** | 2 | 수치 로직 무변경. `sideNote` 케이스만 추가 |
| `test/evaluate.test.ts` | 98 | **재작성** | 2 | `applySession` 반환 형태 변경(ADR-3)으로 **유일하게 깨진다** |
| `test/schedule.test.ts` | 52 | **유지** | — | ADR-1 안 A 채택으로 `planDay` 시그니처 불변. `LABEL_TO_ID` export 는 동작에 영향 없음 |
| `test/helpers.ts` | 20 | **확장** | 1, 3.5 | `stateAt` 에 `stints`/`proposals` 기본값 추가 |

### 동작 보존 사양 5항목 — 어디서 계속 검증되는가

| 사양 | 검증 위치 |
|---|---|
| 해금 게이트 (빅4 전부 6단계 완수 → 7단계 진입) | `test/gate.test.ts` (유지) |
| 진급 플로우차트 (90% 규칙, 유지세트=직전평균, 상급자 2/3세트 분기, 워밍업 최대 2세트) | `test/plan.test.ts` (유지) |
| 승급 판정 — 수행 횟수로만 | `test/evaluate.test.ts` (재작성, 동등 케이스 이관) |
| 다지기 증량 30 → 33 → 36 → 39 | `test/plan.test.ts` (유지) |
| RPE 정책 (거부권 평균 ≥ 8, 하향 직전 ≥ 9, 심박수 미사용) | `test/plan.test.ts` + `test/evaluate.test.ts` |

---

## Edge Case ↔ Phase 매핑 (11 / 11)

| EC | 상황 | Phase | 테스트 파일 |
|---|---|---|---|
| EC-1 | 프로그램 미선택 상태에서 오늘 계획 요청 | 4 | `test/calendar.test.ts` |
| EC-2 | 프로그램 선택일이 그 루틴의 휴식일 | 3A | `test/program.test.ts` |
| EC-3 | A → B → A 로 되돌아옴 | 3A | `test/program.test.ts` |
| EC-4 | 하루에 같은 종목을 두 번 기록 | 3C | `test/session.test.ts` |
| EC-5 | 승급 직후 '불가능'으로 강등 | 3B | `test/proposal.test.ts` |
| EC-6 | 3회를 채우기 전에 또 승급 | 3B | `test/proposal.test.ts` |
| EC-7 | 프로그램 전환 시 진행 중이던 3회 카운트 | 3.5 | `test/integration.test.ts` |
| EC-8 | 며칠 건너뛰고 운동 | 4 | `test/calendar.test.ts` |
| EC-9 | 1단계에서 '불가능' | 3C | `test/session.test.ts` |
| EC-10 | 구간 시작일 이전 날짜 조회 | 3A + 4 | `test/program.test.ts`, `test/calendar.test.ts` |
| EC-11 | RPE 거부권으로 승급 보류된 세션 | 2 + 3B | `test/evaluate.test.ts`, `test/proposal.test.ts` |

Phase 5 에서 **각 EC 가 정확히 하나 이상의 `test()` 이름에 매핑되는지** 전수 대조한다 (NFR-4).

---

## 설계 결정 — 합의 완료

아래 3건은 **사용자 부재 중에 확정된 항목**이다.
`SPEC.md` 를 유일한 Source of Truth 로 삼아 **Designer 와 spec-validator 의 합의**로 결정했으며,
사용자의 직접 승인을 받은 것이 아니다. 사용자가 이견을 낼 경우 재검토 대상이다.
SPEC 본문은 정본이므로 **수정하지 않았다.**

### 1. ADR-2 — `stints` / `proposals` 2필드 통합 → **승인**

**결정**: SPEC 예시의 `program` / `pastPrograms` / `declinedSwitches` 3필드를
`stints`(현재+과거 단일 배열) / `proposals`(생성·승인·거절 통합) 2필드로 통합한다.

**근거**
- SPEC:282-283 이 "필드 이름과 중첩 구조(`program` / `pastPrograms` / `declinedSwitches` / 제안 상태)는
  **예시일 뿐이며 설계 단계에서 확정한다**" 고 명시했다. 통합은 SPEC 이 허용한 범위 안이다.
- **3필드안보다 낫다**: 현재/과거를 나누면 FR-5.1 의 모든 조회(임의 과거 날짜의 programId·며칠차)가
  두 소스를 병합해야 하고, 전환마다 "현재 → 과거로 이동" 로직이 붙어 부정합 지점이 생긴다.
  단일 배열이면 `stintAt(state, date)` 하나로 과거·현재가 동일하게 처리된다.
- FR-3.4(구간 이력 보존) / FR-3.6(무제한 누적) / FR-4.9(거절 이력 보존하되 재제안 차단에 미사용) /
  FR-5.1(임의 날짜 조회) 전부 충족한다.

### 2. ADR-4(b) — 보조 운동을 status 판정에서 제외 → **조건부 승인**

**결정**: 악력·종아리·목 운동을 `rest`/`done`/`partial`/`missed` 판정에서 제외한다.
**조건**: 아래 두 가지 반영을 전제로 승인되었으며, 본 문서에 반영 완료다.
- (a) `DayReview.accessories: AccessoryItem[]` 를 **참고 필드로 추가** — 판정에서 빼는 것과
  조회 결과에서 지우는 것은 다른 문제다. FR-5.1 은 "그날 계획되어 있던 종목" 을 요구하고
  보조 운동도 그날 계획의 일부다.
- (b) **명시적 한계 기록** — ADR-4 의 "명시적 한계" 절에 기록 완료.
  다음 UI 작업이 이 전제를 알아야 한다.

**근거**
- 기록 수단이 SPEC 상 존재하지 않는다. `SessionRecord.progressionId` 는 `ProgressionId`(빅6) 타입이며
  FR-1.1 이 기록 모델을 빅6 로 한정한다. 수행 여부를 알 방법이 타입 수준에서 없다.
- 포함하면 `solitary_confinement` 사용자는 빅6 를 완벽히 수행해도 **매일 `partial`** 이 되어
  FR-5.3 이 요구한 4상태가 사실상 2상태로 붕괴한다.
- FR-4.5("아직 해금되지 않은 종목은 판정 대상에서 제외한다 — 잠긴 종목 때문에 제안이 영영
  뜨지 않는 상황을 막는다")가 세운 **"판정 불가 대상은 판정에서 제외한다" 원칙의 확장**이다.

### 3. ADR-6 — 2단계 API → **조건부 승인**

**결정**: 제안 생성(`proposeSwitch`)과 저장(`commitProposal`)을 분리한다.
**조건**: 부팅용 단일 전이 함수 `advanceProposals(state, catalog, date)` 추가.
Phase 3.5 Step 2-2 에 반영 완료. 호출자는 부팅 시 이것 하나만 호출하며 순서를 틀릴 여지가 없다.

**근거**
- **분리 자체는 선택이 아니라 필수다.** FR-4.6b 가 "제안은 미결/승인/거절 상태를 갖는 데이터로
  **상태에 저장되어야 한다. 매 조회마다 새로 계산되는 휘발성 값이 아니다**" 를 요구하고,
  NFR-2 / FR-5.5 가 조회의 순수성을 요구한다.
  따라서 "조회가 필요할 때 알아서 만들어 저장하는" 형태는 SPEC 하에서 구성이 불가능하다.
- `proposeSwitch`(순수, FR-4.10 의 `null` 반환 계약)와 `commitProposal`(전이)을 개별 함수로 남기면
  단위 테스트 가능성이 보존된다. `advanceProposals` 는 **정상 경로만** 하나로 만드는 순수 증분이다.

---

## Risk Mitigation

### Risk 1: `src/index.ts` 3중 머지 충돌
**Impact**: High (병렬 3분기 전부가 export 를 추가하려 한다)
**Mitigation**: 3A/3B/3C 는 `index.ts` 를 **읽지도 쓰지도 않는다.** export 통합은 Phase 3.5 단독 책임.
Phase 3A/3B/3C 의 테스트는 모듈을 상대 경로로 직접 import 한다 (`../src/program.ts`).

### Risk 2: 타임존 오프바이원 (FR-6.3)
**Impact**: High (하루 밀리면 요일이 어긋나 전 기능이 틀린다)
**Mitigation**: ADR-5 대로 `Date.UTC` + `getUTC*` 로 통일. ISO 문자열 파싱 금지.
Phase 1 에서 7요일 전수 + 월말·연말·윤년 경계 테스트. Phase 5 에서 `TZ=` 환경변수를 바꿔가며 동일 결과 확인.

### Risk 3: `AppState` breaking change 가 기존 테스트를 광범위하게 깬다
**Impact**: Medium
**Mitigation**: 모든 기존 테스트가 `test/helpers.ts` 의 `stateAt` 을 경유한다.
Phase 1 에서 `stateAt` 하나만 갱신하면 `gate`/`plan`/`schedule`/`data` 테스트가 그대로 통과한다.
실제로 깨지는 것은 `evaluate.test.ts` 1개 파일뿐이다 (ADR-3 시그니처 변경).

### Risk 4: EC-6 기준점 스캔 방향 오류
**Impact**: Medium (카운트가 매 승급마다 리셋되어 제안이 영영 안 뜬다)
**Mitigation**: ADR-7 대로 "기준점 이후 중간 `promotedTo` 는 기준점을 갱신하지 않는다".
Phase 3B 에서 EC-5 / EC-6 을 **서로 반대 방향의 케이스 쌍**으로 테스트한다.

### Risk 5: `applySession` 이 `stints` / `proposals` 를 소리 없이 버린다 (C-2)
**Impact**: High (세션을 기록할 때마다 프로그램 구간과 제안이 통째로 사라진다)
**원인**: 현행 `src/evaluate.ts:92-98` 이 반환값을 객체 리터럴 `{ steps, history }` 로 만든다.
Phase 1 에서 `AppState` 에 필수 필드 2개가 추가되면 이 리터럴이 그것들을 누락시킨다.
**자동으로 잡히지 않는다**: `--experimental-strip-types` 는 타입을 지울 뿐 **검사하지 않고**,
`tsconfig.json` 도 `typescript` 패키지도 없으며(NFR-1 이 추가를 금지), 필드 소실은
런타임 예외를 내지 않는다.
**Mitigation**: Phase 2 Step 1 에서 `{ ...state, steps, history }` 스프레드를 명시.
Phase 2 / Phase 3C 테스트에 "`stints`/`proposals` 가 입력과 동일" 케이스를 필수로 둔다.
**타입 검사가 없으므로 테스트가 유일한 방어선이다.**

### Risk 6: 강등 1회로 카운트가 구간 내 영구 0 이 된다 (C-1)
**Impact**: High (한 번 포기하면 그 구간에서 전환 제안이 다시는 뜨지 않는다 — FR-4.1·FR-4.9 위반)
**원인**: EC-6 대응으로 기준점을 "가장 이른 승급" 에 고정한 상태에서
EC-5 를 "기준점 이후에 강등이 있으면 카운트 0" 이라는 **사후 무효화**로 구현하면
재승급해도 기준점이 강등 이전에 머물러 카운트가 영원히 0 이 된다.
**Mitigation**: ADR-7 의 `effectiveFloorIndex` — 강등을 사후 무효화가 아니라 **기준점의 하한**으로 승격.
Phase 3B 에 "강등 후 재승급하면 카운트가 0 이 아니라 새로 시작된다" 테스트를 필수로 둔다.

### Risk 7: 미수행일을 저장 필드로 구현하려는 유혹
**Impact**: Medium (NFR-2 순수성 위반, EC-8 미충족)
**Mitigation**: ADR-4 를 각 Phase PLAN 의 "Out of Scope" 에 명시. Phase 4 에서
`AppState` 에 `missed` 관련 필드가 없음을 코드 리뷰 항목으로 둔다.

---

## Completion Criteria

전체 기능은 다음이 모두 참일 때 완료된다.

- [ ] Phase 1 ~ 5 전부 🟢 Complete
- [ ] FR-1 ~ FR-10 전 항목 충족
- [ ] NFR-1 의존성 0 — `package.json` 의 `dependencies` 가 비어 있음
- [ ] NFR-2 순수성 — 신규 함수가 인자 `AppState` 를 변형하지 않음
- [ ] NFR-4 커버리지 ≥ 70% (`node --experimental-strip-types --test --experimental-test-coverage`)
- [ ] NFR-5 — `src/` 전체에 `new Date()` 검색 결과 0건
- [ ] NFR-6 — 엔진 반환 문자열에 격려·백분율 동기부여 표현 없음
- [ ] EC-1 ~ EC-11 이 각각 하나 이상의 테스트 케이스로 존재
- [ ] 동작 보존 사양 5항목의 동등 검증이 테스트에 남아 있음 (NFR-3 단서)
- [ ] 전체 테스트 통과

---

## Next Steps

1. ⏳ **Phase 1** — 타입 스키마 재정의 + `src/date.ts`
2. Phase 2 — `promotedTo`/`blockedBy` + `sideNote`
3. Phase 3A / 3B / 3C 병렬 실행 (워크트리 분리)
4. Phase 3.5 병합 및 배선
5. Phase 4 — 날짜 진입점
6. Phase 5 — 회귀·EC 대조·커버리지
