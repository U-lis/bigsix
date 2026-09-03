# Phase 2: 승급 기록 + 좌우 고지

## Objective

두 가지를 한다.
1. **ADR-3** — `applySession` 이 `SessionInput` 을 받아 `promotedTo` / `blockedBy` 가 채워진
   `SessionRecord` 를 반환하게 한다. FR-4 의 "승급 후 세션 3회" 판정이 **과거 세션 재평가 없이** 가능해진다 (FR-8, SPEC 충돌 3).
2. **FR-1** — `perSide` 단계의 계획 결과에 사용자 고지 문자열 `sideNote` 를 채운다.

이 Phase 는 Phase 3A/3B/3C 가 병렬로 딛고 설 마지막 공통 기반이다.

---

## Prerequisites

- [ ] Phase 1 완료 — `SessionInput`/`SessionRecord` 분리, `PlannedExercise.sideNote` 선언, `src/date.ts` 존재
- [ ] Phase 1 시점 전체 테스트 통과 확인

---

## Scope

### In Scope
- `src/evaluate.ts` — `applySession` 시그니처 변경 및 파생 필드 전사
- `src/plan.ts` — `planExercise` / `planConsolidation` / `withPair` 에서 `sideNote` 채우기
- `test/evaluate.test.ts` — **재작성** (반환 형태 변경으로 유일하게 깨지는 파일)
- `test/plan.test.ts` — `sideNote` 케이스 **추가** (기존 케이스는 전량 유지)

### Out of Scope
- `evaluateSession` 의 **판정 로직** — 동작 보존 사양. 한 줄도 바꾸지 않는다
- `planExercise` 의 **수치 로직** — 90% 규칙, 유지세트, 세트 분기, 워밍업. 한 줄도 바꾸지 않는다 (FR-1.5)
- `promotedTo` 를 **읽어서** 카운트하는 로직 → Phase 3B (ADR-7)
- `sideNote` 를 화면에 표시하는 것 → Out of Scope (UI)

---

## Instructions

### Step 1: `applySession` 시그니처 변경

**Files**: `src/evaluate.ts`

**Action**: 현행 `applySession(state, catalog, record: SessionRecord)` (88~99줄)을 아래로 바꾼다.

```
applySession(state, catalog, input: SessionInput)
  : { state: AppState; evaluation: Evaluation; record: SessionRecord }
```

동작 순서:
1. `evaluateSession(state, catalog, input)` 호출 — **`evaluateSession` 자체는 무변경.**
   `SessionInput` 은 `SessionRecord` 의 구조적 부분집합이므로 그대로 넘어간다.
2. `input` 을 복사해 `record` 를 만든다.
3. `evaluation.promote === true` 이면 `record.promotedTo = evaluation.nextStep` 을 설정한다.
   `promote` 가 `false` 이면 **필드를 아예 넣지 않는다** (`undefined` 로 명시 대입하지 않는다).
4. `evaluation.blockedBy` 가 있으면 `record.blockedBy` 로 그대로 전사한다.
5. 반환하는 `state.history` 에는 **`input` 이 아니라 `record`** 를 push 한다.
6. 반환 객체에 `record` 를 포함한다.

NFR-2: 인자 `state` 를 변형하지 않는다. 기존의 스프레드 방식을 그대로 유지한다.

### Step 2: `evaluateSession` 인자 타입 완화

**Files**: `src/evaluate.ts`

**Action**: `evaluateSession` 의 세 번째 인자 타입을 `SessionRecord` 에서 `SessionInput` 으로 바꾼다.
내부 로직은 `date`/`progressionId`/`step`/`sets`/`rpe`/`kind`/`outcome` 만 읽으므로
파생 필드가 없어도 동작한다. **`rpeVeto` 내부 헬퍼의 인자 타입도 같이 완화한다.**
`SessionRecord` 는 `SessionInput` 을 상속하므로 기존 호출부는 그대로 유효하다.

### Step 3: `sideNote` 문구 생성 헬퍼 추가

**Files**: `src/plan.ts`

**Action**: 모듈 내부 함수(export 하지 않음)를 추가한다.

```
sideNoteFor(id: ProgressionId, perSide: boolean): string | undefined
```

- `perSide` 가 `false` 이면 `undefined` 를 반환한다 (FR-1.4)
- `perSide` 가 `true` 이면 종목별 부위 명칭을 넣은 문구를 반환한다 (FR-1.3)

| 종목 | 부위 |
|---|---|
| `squat` | 다리 |
| `pushup` / `pullup` / `hspu` | 팔 |
| `legraise` / `bridge` | (데이터에 `perSide` 가 없으므로 이 분기에 도달하지 않는다) |

문구 형식: `양쪽 {부위}을 모두 수행하고, 적게 한 쪽의 {단위명}를 입력한다.`
- `unit === 'reps'` → "횟수", `unit === 'seconds'` → "유지 시간"
- 예: `양쪽 팔을 모두 수행하고, 적게 한 쪽의 횟수를 입력한다.` (SPEC FR-1.2 예시와 일치)

NFR-6: 격려·백분율 표현을 넣지 않는다. **사실 문구만.**

`legraise`/`bridge` 는 `perSide` 가 데이터에 없으므로(FR-1 확정 사항: 총 16개 = 4종목 × 4단계)
매핑 테이블에서 빠져도 되지만, 방어적으로 도달 시 `'팔'`/`'다리'` 중 어느 쪽도 아닌 상황이 되므로
**해당 종목이 매핑에 없으면 `undefined` 를 반환한다.** 예외를 던지지 않는다.

### Step 4: `planExercise` 에서 `sideNote` 채우기

**Files**: `src/plan.ts`

**Action**: `planExercise` 의 `base` 객체(101~109줄)에 `sideNote: sideNoteFor(id, step.perSide === true)` 를
추가한다. `base` 는 세 반환 경로 전부에 스프레드되므로 한 곳만 고치면 된다.

**금지**: `work`, `goal`, `reason`, `warmup` 의 계산에 손대지 않는다 (FR-1.5).
`sideNote` 는 순수 부가 필드다.

### Step 5: `planConsolidation` 에서 `sideNote` 채우기

**Files**: `src/plan.ts`

**Action**: `planConsolidation` 반환 객체(75~89줄)에 `sideNote` 를 추가한다.
**기준은 `prev.perSide`** 다 — 다지기는 이전 단계를 실제로 수행하므로
`perSide` 판정도 이전 단계 기준이어야 한다. 반환 객체의 `perSide: prev.perSide === true` 와 일관되게 맞춘다.

### Step 6: `withPair` 의 동반 단계에도 `sideNote` 채우기

**Files**: `src/plan.ts`

**Action**: `withPair` 가 만드는 `paired` 객체(182~200줄)에도 `sideNote` 를 추가한다.
기준은 `paired.perSide` 다. 동반 단계도 사용자가 실제로 수행하므로 고지가 필요하다.

### Step 7: `test/evaluate.test.ts` 재작성

**Files**: `test/evaluate.test.ts`

**Action**: 기존 98줄을 새 반환 형태에 맞춰 다시 쓴다.
**기존 케이스가 검증하던 동작 보존 사양을 빠짐없이 이관한다** (NFR-3 단서).
반드시 남아야 하는 검증:
- 승급은 **수행 횟수로만** 판정된다
- RPE 거부권: 최근 3회 평균 ≥ 8 이면 승급 보류
- 마스터(10단계)에서는 승급하지 않는다
- `outcome: 'abandoned'` 는 승급하지 않는다
- `kind: 'consolidation'` 은 현재 단계의 승급 판정 대상이 아니다
- 심박수는 사용하지 않는다

여기에 ADR-3 신규 검증을 추가한다 (PHASE_2_TEST.md 참조).

### Step 8: `test/plan.test.ts` 에 `sideNote` 케이스 추가

**Files**: `test/plan.test.ts`

**Action**: 기존 149줄은 **한 줄도 삭제하지 않는다.** `sideNote` 검증 블록을 덧붙인다.
특히 "`sideNote` 가 `work`/`goal` 수치에 영향을 주지 않는다"(FR-1.5)를
동일 입력에 대한 수치 스냅샷 비교로 검증한다.

### Step 9: 회귀 확인

**Action**: 전체 테스트 실행. `plan` / `gate` / `schedule` / `data` 는 그대로 통과해야 한다.
`schedule.test.ts` 가 통과하는 것이 중요하다 — `planDay` 가 `planExercise` 를 호출하므로
`sideNote` 추가가 `DayPlan` 구조를 깨지 않았음을 뜻한다.

---

## Implementation Notes

### `promotedTo` 를 optional 로 두는 이유
`record.promotedTo !== undefined` 라는 **단일 술어**가 "이 세션에서 승급했는가"를 그대로 표현한다.
`promoted: boolean` + `newStep: number` 두 필드로 나누면 둘이 어긋날 수 있는 상태가 생긴다.
Phase 3B 의 ADR-7 카운트는 이 술어 하나에만 의존한다.

### `blockedBy` 가 EC-11 을 자동으로 해결하는 방식
RPE 거부권으로 보류된 세션은 `promotedTo === undefined` 이므로 **애초에 카운트 기준점 후보가 아니다.**
Phase 3B 에서 "RPE 보류는 승급으로 치지 않는다" 는 별도 코드를 쓸 필요가 없다.
`blockedBy: 'rpe'` 는 그 사실을 **사후 확인 가능하게** 남기는 증거일 뿐, 판정에 쓰이지 않는다.

### `sideNote` 가 계산에 관여하지 않음을 보장하는 방법
`sideNoteFor` 는 `id` 와 `perSide` 만 받는다. `state`, `history`, `sets` 를 받지 않으므로
**구조적으로** 수치 계산에 영향을 줄 수 없다. 이 시그니처 제약을 유지한다.

---

## Sample Code

```ts
// evaluate.ts — 파생 필드 전사. 값이 없을 때 undefined 를 명시 대입하지 않는다.
const record: SessionRecord = { ...input };
if (evaluation.promote) record.promotedTo = evaluation.nextStep;
if (evaluation.blockedBy !== undefined) record.blockedBy = evaluation.blockedBy;
```

---

## Completion Checklist

- [ ] `applySession(state, catalog, input: SessionInput)` 이 `{ state, evaluation, record }` 반환
- [ ] `evaluation.promote` 일 때만 `record.promotedTo = evaluation.nextStep`
- [ ] `evaluation.blockedBy` 가 `record.blockedBy` 로 전사됨
- [ ] `state.history` 에 `input` 이 아니라 `record` 가 들어감
- [ ] `evaluateSession` 판정 로직 무변경 (git diff 로 확인)
- [ ] `sideNoteFor` 헬퍼 추가 — `state`/`sets` 를 인자로 받지 않음
- [ ] `planExercise` / `planConsolidation` / `withPair` 세 곳 모두 `sideNote` 채움
- [ ] `perSide` 가 아닌 단계는 `sideNote` 가 `undefined` (FR-1.4)
- [ ] `squat` → "다리", `pushup`/`pullup`/`hspu` → "팔" (FR-1.3)
- [ ] `planExercise` 의 `work`/`goal`/`warmup`/`reason` 계산 무변경 (FR-1.5)
- [ ] `test/evaluate.test.ts` 재작성 완료, 동작 보존 검증 전량 이관
- [ ] `test/plan.test.ts` 기존 케이스 전량 유지 + `sideNote` 케이스 추가
- [ ] `test/schedule.test.ts` / `test/gate.test.ts` / `test/data.test.ts` 무수정 통과
- [ ] 전체 테스트 통과
- [ ] 타입 체크 통과

---

## Verification

### Manual Verification
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

node --experimental-strip-types --test test/

# evaluateSession 판정 로직이 변경되지 않았는지 — diff 가 시그니처 줄과 rpeVeto 인자 타입에만 걸려야 한다
git diff src/evaluate.ts

# planExercise 수치 로직 무변경 확인 — diff 에 sideNote 관련 줄만 있어야 한다
git diff src/plan.ts

# NFR-6 감사 — 엔진 문자열에 격려 표현이 없는지
grep -rnE '화이팅|잘했|훌륭|대단|힘내|굿|축하' src/
```

### Expected Output
```
# fail 0
(grep 결과 없음)
```

---

## Notes

- 이 Phase 이후 Phase 3A / 3B / 3C 를 병렬로 시작할 수 있다.
  **Phase 2 가 완료되기 전에 3A/3B/3C 를 시작하면 안 된다** — 셋 다 `applySession` 새 시그니처와
  `promotedTo` 필드에 의존한다.
- `test/evaluate.test.ts` 재작성은 이 프로젝트에서 **유일하게 폐기되는 테스트 코드**다.
  삭제 전에 기존 98줄의 검증 항목을 목록화하고, 새 파일에서 각각이 대응됨을 확인한다.

---

## Completion Date

## Completed By
