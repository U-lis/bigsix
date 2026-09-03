# Phase 3A: 프로그램 구간 · 설명

## Objective

`src/program.ts` 를 신설해 **프로그램 구간(stint) 관리**와 **프로그램 설명 파생 조회**를 구현한다.
FR-2(프로그램 선택)와 FR-3(수동 전환)을 담당한다.

**병렬 Phase**: 3B / 3C 와 동시 실행 가능. 파일 겹침 0.

---

## Prerequisites

- [ ] Phase 2 완료 — `applySession` 새 시그니처, `promotedTo`, `sideNote`
- [ ] Phase 1 의 `src/date.ts` 5함수 사용 가능
- [ ] 워크트리 분리 (병렬 실행 시):
      `git worktree add ../bigsix-feature-program-session-3A feature/program-session-3A feature/program-session`

---

## Scope

### In Scope
- `src/program.ts` (신규) — 구간 관리 + 설명 파생
- `test/program.test.ts` (신규)

### Out of Scope — 병렬 안전을 위한 절대 규칙
- **`src/index.ts` 를 읽지도 쓰지도 않는다.** export 통합은 Phase 3.5 단독 책임 (머지 충돌 최고 위험 지점)
- **`test/helpers.ts` 를 수정하지 않는다.** Phase 1 에서 확정됨. 고유 픽스처는 `test/program.test.ts` 안에 로컬로 둔다
- 자동 전환 제안 → Phase 3B
- 세션 흐름 → Phase 3C
- `planOn` / `reviewDay` → Phase 4
- `acceptProposal` 배선 → Phase 3.5

---

## Instructions

### Step 1: `describeProgram` / `describePrograms` (FR-2.3)

**Files**: `src/program.ts`

**Action**: 프로그램 설명 데이터를 **카탈로그에서 파생 계산**하는 조회 함수를 만든다.
**`data/progressions.json` 을 수정하지 않는다** (제약 c). 중복 저장하지 않는다.

반환 타입 `ProgramDescription` 의 필드:

| 필드 | 산출 방법 |
|---|---|
| `id` | `Program.id` |
| `name` | `Program.name` (`{ en, ko }`) |
| `frequency` | `Program.frequency` |
| `trainingDays` | 7요일 중 `schedule[weekday].length > 0` 인 요일 수 |
| `restDays` | `7 - trainingDays` |
| `progressionIds` | 요일표 전체를 훑어 한국어 라벨을 종목 id 로 변환, **중복 제거**, 정렬 |
| `accessories` | 요일표 라벨 중 빅6 매핑에 없는 것 (악력·종아리·목), **중복 제거** |
| `note` | `Program.note` (없으면 `undefined`) |

`describePrograms(catalog)` 는 5종 전부를 `catalog.programs` 순서대로 반환한다 (FR-2.2).

**한국어 라벨 → 종목 id 매핑 주의**: 이 매핑은 현재 `src/schedule.ts` 의 모듈-private
`LABEL_TO_ID` 에만 있다. 두 곳에 복제하면 어긋난다. **`src/schedule.ts` 에서 `LABEL_TO_ID` 를
export 하고 `program.ts` 가 import 한다.** 이는 `schedule.ts` 의 유일한 변경이며
`planDay` 시그니처와 동작에는 영향이 없다 (ADR-1 유지).

**참고 — 기대되는 파생값** (`data/progressions.json` 현재 값 기준, 테스트 기대치로 사용):

| 프로그램 | 운동일 | 휴식일 | 보조 운동 |
|---|---|---|---|
| `new_blood` | 2 (월·목) | 5 | 없음 |
| `good_behavior` | 3 (월·수·금) | 4 | 없음 |
| `veterano` | 6 (월~토) | 1 | 없음 |
| `solitary_confinement` | 6 (월~토) | 1 | 악력 운동, 종아리 운동, 목 운동 |
| `supermax` | 6 (월~토) | 1 | 없음 |

### Step 2: `firstTrainingDay` (FR-2.6)

**Files**: `src/program.ts`

**Action**: `firstTrainingDay(catalog, programId, from: IsoDate): IsoDate`

`from` 부터 시작해 **최대 7일 전방 탐색**하며, 해당 프로그램의 요일표에서
`schedule[weekdayOf(d)].length > 0` 인 첫 날짜를 반환한다.
`from` 자신이 운동일이면 `from` 을 그대로 반환한다.

- 탐색은 `date.ts` 의 `weekdayOf` / `addDays` 를 쓴다
- 7일을 다 돌아도 없으면 — 5종 프로그램 전부가 주 2~6일 운동이므로 **실제로는 도달하지 않는다.**
  방어적으로 예외를 던지되 메시지에 `programId` 를 포함한다. 조용히 `from` 을 반환하지 않는다

### Step 3: `selectProgram` (FR-2.1, FR-2.4)

**Files**: `src/program.ts`

**Action**: `selectProgram(state, catalog, programId, onDate: IsoDate): AppState`

1. `getProgram(catalog, programId)` 로 프로그램 존재를 확인한다 (없으면 기존 예외 전파)
2. 활성 구간(`endedAt === null`)이 있으면 `endedAt` 을 `onDate` 로 마감한다
3. 새 `ProgramStint` 를 push 한다
   - `selectedAt: onDate`
   - `startedAt: firstTrainingDay(catalog, programId, onDate)` (FR-2.6)
   - `endedAt: null`
4. `steps` 와 `history` 는 **그대로 복사한다** (FR-3.5)
5. `proposals` 는 그대로 둔다

NFR-2: 인자 `state` 를 변형하지 않는다. 새 객체를 반환한다.

### Step 4: `switchProgram` (FR-3.1 ~ FR-3.3)

**Files**: `src/program.ts`

**Action**: `switchProgram(state, catalog, programId, onDate: IsoDate): AppState`

동작이 `selectProgram` 과 **완전히 동일하다** — 이전 구간 마감 + 새 구간 push.
FR-3.3 이 "이전에 수행했던 프로그램으로 되돌아와도 이어가기는 없다. 항상 새 구간" 이라고 명시하므로
같은 `programId` 로 전환해도 특별 처리를 하지 않는다.

**구현**: `switchProgram` 을 `selectProgram` 의 별칭으로 두거나 동일 내부 함수를 공유한다.
**두 개의 서로 다른 구현을 만들지 않는다** — 어긋날 여지를 없앤다.
이름을 둘 다 제공하는 것은 호출자 의도를 드러내기 위함이다.

### Step 5: `currentStint` / `stintAt` (ADR-2)

**Files**: `src/program.ts`

**Action**:
- `currentStint(state): ProgramStint | null` — `stints` 마지막 원소가 `endedAt === null` 이면 그것, 아니면 `null`.
  빈 배열이면 `null` (프로그램 미선택)
- `stintAt(state, date: IsoDate): ProgramStint | null` — `date` 가 속한 구간.
  판정 범위는 **`selectedAt` 이상이고, `endedAt` 이 `null` 이거나 `date < endedAt`**.
  구간 경계일(전환일)에는 새 구간이 우선한다 — 전환일부터 새 루틴을 따르기 때문 (FR-3.2)

**주의**: 판정 하한은 `startedAt` 이 아니라 **`selectedAt`** 이다.
선택일과 첫 운동일 사이의 휴식일도 그 구간에 속하며, 며칠차만 0 이다 (FR-5.4, EC-10).

### Step 6: `dayNumber` (FR-2.7, FR-5.4, EC-10)

**Files**: `src/program.ts`

**Action**: `dayNumber(stint: ProgramStint, date: IsoDate): number`

`diffDays(stint.startedAt, date) + 1` 을 계산하되 **0 미만이면 0 으로 클램프한다.**
- `date === startedAt` → `1`
- `date` 가 `startedAt` 하루 전 → `0` (`diffDays` = −1 → `0`)
- `date` 가 `startedAt` 이전 어느 날이든 → `0`

A-3: 며칠차는 **달력 일수** 기준이며 운동 수행 여부와 무관하다 (EC-8).
건너뛴 날에도 계속 증가한다. **수행 기록을 보지 않는다.**

`state` 를 받는 편의 오버로드 `dayNumberOn(state, date)` 도 제공한다 —
`stintAt` 이 `null` 이면 `0`.

### Step 7: 무제한 누적 (FR-3.6)

**Files**: `src/program.ts`

**Action**: **아무것도 구현하지 않는다.**
`stints` 배열에 개수 상한, 보관 기간, 자동 정리(pruning) 로직을 **넣지 않는다.**
FR-3.6 이 "오래된 구간을 잘라내는 로직을 구현해서는 안 된다" 고 명시한다.
이 Step 은 "하지 않을 것" 을 명시하기 위해 존재한다. 리뷰 시 `slice`/`splice`/`shift` 검색으로 확인한다.

---

## Implementation Notes

### `stintAt` 의 경계 규칙이 왜 반개구간인가
전환일 `D` 에 A → B 로 바꾸면 A 의 `endedAt = D`, B 의 `selectedAt = D` 다.
`D` 를 조회하면 **B 가 나와야 한다** (FR-3.2: "전환하면 그날부터 새 루틴을 따른다").
따라서 판정은 `selectedAt <= date && (endedAt === null || date < endedAt)` 이다.
`stints` 를 **뒤에서부터** 스캔하면 자연히 새 구간이 먼저 걸린다.

### EC-3 (A → B → A) 이 자동으로 충족되는 이유
`switchProgram` 은 `programId` 가 같은지 보지 않고 무조건 새 구간을 push 한다.
새 구간의 `startedAt` 은 그 시점 기준으로 다시 계산되므로 `dayNumber` 가 1부터 시작한다.
**"이어가기 없음" 을 위한 별도 코드가 없다** — 구조가 그것을 강제한다.

### EC-2 (선택일이 휴식일) 검증 예시
`new_blood` 는 월·목만 운동일이다. 화요일에 선택하면
`selectedAt` = 그 화요일, `startedAt` = 그 주 목요일이다.
화·수를 조회하면 `dayNumber` 가 0 이고, 목요일이 1일차다.

---

## Sample Code

없음. 기존 코드베이스 패턴(순수 함수 + 스프레드 반환)에서 전부 추론 가능하다.

---

## Completion Checklist

- [ ] `src/program.ts` 신규 작성
- [ ] `describeProgram` / `describePrograms` — 5종 전부 파생값 정확 (FR-2.3)
- [ ] 설명 데이터가 전부 카탈로그 파생 — `data/progressions.json` 무변경 (제약 c)
- [ ] `LABEL_TO_ID` 를 `schedule.ts` 에서 export 해 재사용 (복제 금지)
- [ ] `firstTrainingDay` — 최대 7일 전방 탐색, `from` 자신 포함 (FR-2.6)
- [ ] `selectProgram` — 이전 구간 마감 + 새 구간 push
- [ ] `switchProgram` — `selectProgram` 과 동일 내부 구현 공유 (FR-3.1~3.3)
- [ ] `steps` / `history` 불변 (FR-3.5)
- [ ] `currentStint` / `stintAt` — 반개구간 판정, 뒤에서 스캔
- [ ] `dayNumber` — 0 클램프 (EC-10, FR-5.4)
- [ ] pruning 로직 부재 확인 (FR-3.6)
- [ ] `src/index.ts` 를 **건드리지 않았음** (git diff 로 확인)
- [ ] `test/helpers.ts` 를 **건드리지 않았음** (git diff 로 확인)
- [ ] `test/program.test.ts` 작성, EC-2 / EC-3 / EC-10 포함
- [ ] 전체 테스트 통과
- [ ] 타입 체크 통과

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3A

node --experimental-strip-types --test test/program.test.ts
node --experimental-strip-types --test test/

# 병렬 안전 규칙 준수 확인 — 두 파일이 diff 에 나오면 안 된다
git diff --name-only feature/program-session | grep -E 'src/index.ts|test/helpers.ts'

# FR-3.6 — pruning 로직 부재 확인
grep -nE '\.slice\(|\.splice\(|\.shift\(|MAX_|limit' src/program.ts

# 제약 c — 데이터 무변경
git diff --name-only | grep 'data/progressions.json'
```

### Expected Output
```
# fail 0
(git diff grep 결과 없음)
(pruning grep 결과 없음)
(data grep 결과 없음)
```

---

## Notes

- `schedule.ts` 에서 `LABEL_TO_ID` 를 export 하는 것은 **이 Phase 가 `schedule.ts` 를 건드리는 유일한 이유**다.
  `planDay` / `planWeek` 의 본문과 시그니처는 손대지 않는다. `test/schedule.test.ts` 가 계속 통과해야 한다.
- Phase 3B 가 `switchProgram` 을 필요로 하지만 **Phase 3.5 에서 배선한다.**
  이 Phase 는 3B 의 존재를 모른 채 독립적으로 완결되어야 한다.
- EC-7(전환 시 카운트 리셋)은 3A 단독으로 검증할 수 없다. `startedAt` 을 정확히 세팅하는 것까지가 3A 의 책임이고,
  그것이 카운트 하한으로 쓰이는지는 Phase 3.5 의 통합 테스트가 본다.

---

## Completion Date

## Completed By
