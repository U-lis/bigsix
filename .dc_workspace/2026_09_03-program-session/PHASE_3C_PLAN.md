# Phase 3C: 세션 흐름

## Objective

`src/session.ts` 를 신설해 FR-7(세션 진행 흐름)을 구현한다.
도전 중 '불가능' → 기록 → 다지기 제안 → 다지기 수행 으로 이어지는 흐름을
**기존 다지기 로직을 재구현하지 않고 연결만** 한다 (FR-7.3).

**병렬 Phase**: 3A / 3B 와 동시 실행 가능. 파일 겹침 0.

---

## Prerequisites

- [ ] Phase 2 완료 — `applySession(state, catalog, input)` 이 `{ state, evaluation, record }` 반환
- [ ] 워크트리 분리 (병렬 실행 시):
      `git worktree add ../bigsix-feature-program-session-3C feature/program-session-3C feature/program-session`

---

## Scope

### In Scope
- `src/session.ts` (신규) — `abandonChallenge`, `recordSession`
- `test/session.test.ts` (신규)

### Out of Scope — 병렬 안전을 위한 절대 규칙
- **`src/index.ts` 를 읽지도 쓰지도 않는다.** export 통합은 Phase 3.5 단독 책임
- **`test/helpers.ts` 를 수정하지 않는다.** 고유 픽스처는 `test/session.test.ts` 안에 로컬로
- **`src/program.ts` / `src/proposal.ts` 를 import 하지 않는다.** 3A/3B 와 동시 진행 중
- **`planConsolidation` / `canConsolidate` / `consolidationCount` 를 재구현하지 않는다.** 호출만 한다 (FR-7.3)
- `evaluateSession` 판정 로직 — 동작 보존 사양. 손대지 않는다
- 날짜 기반 진입점 → Phase 4

---

## Instructions

### Step 1: `abandonChallenge` (FR-7.1, FR-7.2, FR-7.4, EC-9)

**Files**: `src/session.ts`

**Action**:

```
abandonChallenge(
  state, catalog, progressionId, date: IsoDate,
  sets: number[], rpe?: number
): { state: AppState; record: SessionRecord; canConsolidate: boolean; consolidation: PlannedExercise | null }
```

동작:
1. `SessionInput` 을 만든다 — `kind: 'work'`, **`outcome: 'abandoned'`** (FR-7.1),
   `step: state.steps[progressionId]`, `sets`, `rpe`, `date`
2. `applySession(state, catalog, input)` 으로 기록한다.
   `evaluateSession` 이 `abandoned` 를 미승급으로 처리하므로 (Phase 2 확인 완료)
   `record.promotedTo` 는 `undefined` 가 되고 단계가 유지된다
3. `canConsolidate(newState, catalog, progressionId)` 를 호출한다 — **재구현 금지**
4. `canConsolidate` 가 `true` 면 `planConsolidation(newState, catalog, progressionId)` 결과를 `consolidation` 에 담는다.
   `false` 면 `consolidation: null`
5. **다지기 세션을 자동으로 기록하지 않는다.** FR-7.2 가 "확인을 거쳐 승인하면" 이라고 명시하므로
   다지기 수행 여부는 사용자 결정이다. 이 함수는 **계획만 돌려준다**

**EC-9 / FR-7.4**: 1단계에서 호출하면 `canConsolidate` 가 `false` 를 반환한다
(`state.steps[id] > 1` 이 판정 조건). 이때 `consolidation` 은 `null` 이고
**단계는 그대로 유지된다.** `planConsolidation` 을 호출해서는 안 된다 —
호출하면 기존 코드가 예외를 던진다. **`canConsolidate` 로 먼저 거른다.**

### Step 2: `recordSession` (FR-7.5, EC-4)

**Files**: `src/session.ts`

**Action**:

```
recordSession(state, catalog, input: SessionInput)
  : { state: AppState; evaluation: Evaluation; record: SessionRecord }
```

`applySession` 위의 얇은 래퍼다. 아래를 **하지 않는다**:
- 같은 날 같은 종목 중복 검사 — FR-7.5 가 하루 2회 기록을 허용한다
- 날짜 순서 검증
- 기록 병합·덮어쓰기

**아무 제약도 넣지 않는 것이 사양이다.** 각 기록은 독립적으로 판정된다 (A-1, FR-7.5).

**왜 래퍼가 존재하는가**: `applySession` 은 `evaluate.ts` 의 저수준 함수다.
호출자가 세션 흐름 API 를 하나의 모듈(`session.ts`)에서 찾을 수 있게 하고,
앞으로 흐름 관련 로직이 붙을 자리를 마련한다. 현 시점에서는 위임만 한다.

### Step 3: 다지기 수행 기록 (FR-7.2)

**Files**: `src/session.ts`

**Action**: 사용자가 다지기를 승인해 수행했을 때 쓰는 함수를 만든다.

```
recordConsolidation(
  state, catalog, progressionId, date: IsoDate, sets: number[], rpe?: number
): { state: AppState; record: SessionRecord }
```

`SessionInput` 을 아래로 구성해 `applySession` 에 넘긴다:
- `kind: 'consolidation'`
- `step: state.steps[progressionId]` — **훈련 중인 단계 그대로.** 다지기는 단계를 내리지 않는다
- `performedStep: state.steps[progressionId] - 1` (FR-7.2)
- `outcome` 은 설정하지 않는다

`evaluateSession` 이 `consolidation` 을 승급 판정 대상에서 제외하므로 (기존 동작)
단계가 유지되고 `promotedTo` 가 `undefined` 가 된다.

**1단계에서는 호출하면 안 된다.** `performedStep` 이 0 이 되어 무의미하다.
`canConsolidate` 로 먼저 거르는 것은 호출자 책임이지만, 방어적으로
`state.steps[id] <= 1` 이면 예외를 던진다. 조용히 잘못된 기록을 남기지 않는다.

---

## Implementation Notes

### 왜 `abandonChallenge` 가 다지기를 자동 기록하지 않는가
FR-7.2 는 `'불가능' → 확인 → 승인 → 다지기 수행` 이라는 **3단계 사용자 흐름**을 규정한다.
`abandonChallenge` 가 다지기까지 기록하면 사용자가 "아니오" 를 고를 여지가 없고,
실제로 수행하지 않은 세션이 `history` 에 남는다.
따라서 **포기 기록(저장) + 다지기 계획(제안)** 까지가 이 함수의 경계다.

### 이 분리가 EC-5 판정에 미치는 영향
Phase 3B 의 `lastSetbackDate` 는 `outcome: 'abandoned'` **또는** `kind: 'consolidation'` 을 본다.
사용자가 포기만 하고 다지기를 거절해도 `abandoned` 기록이 남으므로 EC-5 리셋이 작동한다.
**둘 중 하나만 있어도 강등으로 판정된다** — FR-4.3 의 "조합으로 판정한다" 를 그렇게 해석한다.

### `canConsolidate` 를 재구현하지 않는 이유 (FR-7.3)
SPEC 이 명시적으로 "이미 구현되어 있다. 재구현하지 않는다" 고 못 박았다.
현 구현은 `state.steps[id] > 1` 한 줄이고, 다지기 증량(30 → 33 → 36 → 39)은
`planConsolidation` 안에 있다. 이는 **동작 보존 사양**이므로 복제하면 어긋날 위험만 생긴다.

### `performedStep` 의 의미
`SessionRecord.step` 은 "훈련 중인 단계", `performedStep` 은 "실제로 수행한 단계" 다.
다지기에서 `step` 을 내리면 `sessionsAt(state, id, step)` 기반 조회가 전부 어긋난다.
**`step` 은 그대로 두고 `performedStep` 만 내린다** — 기존 `planConsolidation` 의 반환값과 일관된다.

---

## Sample Code

없음. 기존 `applySession` 호출 패턴에서 전부 추론 가능하다.

---

## Completion Checklist

- [ ] `src/session.ts` 신규 작성
- [ ] `abandonChallenge` — `outcome: 'abandoned'` 기록 (FR-7.1)
- [ ] `abandonChallenge` — `canConsolidate` **호출** (재구현 금지, FR-7.3)
- [ ] `abandonChallenge` — 가능하면 `planConsolidation` **호출** 결과 반환 (재구현 금지)
- [ ] `abandonChallenge` — 다지기를 자동 기록하지 않음 (FR-7.2)
- [ ] **EC-9 / FR-7.4** 1단계에서 `canConsolidate === false`, `consolidation === null`, 단계 유지
- [ ] `recordSession` — 중복 검사 없음 (FR-7.5)
- [ ] `recordConsolidation` — `kind: 'consolidation'`, `performedStep = step - 1` (FR-7.2)
- [ ] `recordConsolidation` — 1단계에서 예외
- [ ] **세 함수 전부 `stints` / `proposals` 를 보존함** (C-2 — `applySession` 위임 시 자동 보존되나,
      중간에 객체 리터럴로 상태를 재구성하지 않았는지 확인)
- [ ] `src/plan.ts` 의 다지기 로직 무변경 (git diff 로 확인)
- [ ] `src/program.ts` / `src/proposal.ts` import 0건
- [ ] `src/index.ts` 를 **건드리지 않았음**
- [ ] `test/helpers.ts` 를 **건드리지 않았음**
- [ ] `test/session.test.ts` 작성 — EC-4 / EC-9 포함
- [ ] 전체 테스트 통과
- [ ] 런타임 통과 (타입 검사는 수행되지 않음 — `--experimental-strip-types` 는 타입을 지울 뿐 검사하지 않는다. 구조 변경은 테스트로 검증한다)

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3C

node --experimental-strip-types --test test/session.test.ts
node --experimental-strip-types --test test/

# 병렬 안전 규칙
git diff --name-only feature/program-session | grep -E 'src/index.ts|test/helpers.ts|src/program.ts|src/proposal.ts'

# FR-7.3 — 다지기 로직 재구현 여부. 아래 상수가 session.ts 에 등장하면 안 된다
grep -nE 'consolidationBump|consolidationSets|0\.1|30|33|36|39' src/session.ts

# plan.ts 무변경
git diff src/plan.ts
```

### Expected Output
```
# fail 0
(git diff grep 결과 없음)
(다지기 상수 grep 결과 없음)
(plan.ts diff 없음)
```

---

## Notes

- 이 Phase 는 세 병렬 Phase 중 가장 작다. 새 계산 로직이 없고 기존 함수의 **연결**만 한다.
- `abandonChallenge` 의 반환 타입에 `canConsolidate` 와 `consolidation` 을 둘 다 넣는 것은 중복처럼 보이지만,
  호출자(UI)가 `canConsolidate === false` 일 때 "내려갈 단계가 없다" 를 사실대로 알릴 수 있게 하기 위함이다 (NFR-6).
  `consolidation === null` 만으로는 "불가능해서 없음" 과 "다른 이유로 없음" 이 구분되지 않는다.
- EC-4(하루 2회 기록)는 `recordSession` 에 제약을 **넣지 않음**으로써 충족된다.
  테스트는 "제약이 없음" 을 확인하는 형태가 된다.

---

## Completion Date

## Completed By
