# bigsix UI 2차 — Global Documentation

**Target Version**: 0.2.0 (추가분)
**Work Type**: feature
**Base Branch**: `feature/ui` (`0821ecc`)
**Working Branch**: `feature/ui` (그대로 잇는다 — 새 브랜치 만들지 않는다)
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-ui`
**SOT**: 같은 디렉터리의 `SPEC.md` (SPEC2) — 본 문서와 어긋나면 SPEC 이 이긴다.
**선행 SPEC/GLOBAL**: `.dc_workspace/2026_09_04-ui/{SPEC.md, GLOBAL.md}` (D-1~D-19, FR-0~FR-15, L-1~L-9, ADR-1~14 전부 승계). 그 위층 `.dc_workspace/2026_09_03-program-session/GLOBAL.md` 의 엔진 ADR-1~7 도 승계.

---

## Feature Overview

**Purpose** (SPEC2 Overview 요약)
1차에서 완성돼 배포되어 돌기 시작한 앱을, 폰에 설치해 쓰면서 드러난 세 묶음으로 채운다.

1. **앱 껍데기의 기본기** — 설치 · 테마 · 화면 유지 · About (FR-16 / FR-19)
2. **오늘 화면이 상태를 말한다** — 미선택 · 휴식일 · 할 게 없음 · 운동일 4상태 (FR-17)
3. **휴식일에 할 게 없다** — 자유 운동 (FR-18)

그리고 실물 책과 대조한 결과 드러난 세 가지 **로직·표시 정정**:

4. **워밍업 제거** (FR-20) — 책에 없는 규칙이 저단계에서 본세트의 4~7배로 잘못 작동하고 있었다.
5. **표시 위계 정정** (FR-21) — 목표 수치가 작고 흐린 반면 워밍업이 굵은 제목이었다.
6. **승급 조건 정정** (FR-22) — 「상급자 기준 1회 충족 → 승급」이 아니라 「단계별 목표를 순차로 3회 연속 통과」가 유일한 기준이다. 판정의 근간이 바뀐다.

**Solution 요지**
- FR-22 로 `plan.ts` 와 `evaluate.ts` 의 판정 로직을 근본 재작성한다.
- FR-20 은 도메인·UI·저장 스키마에 파장. `schemaVersion` 을 v2 → v3 으로 한 번만 올린다.
- FR-18 은 `SessionRecord.kind` 에 `'free'` 를 추가하고, 판정 진입점 네 곳에서 그것을 걸러 낸다.
- FR-16 / FR-19 는 참조 구현 `~/Documents/cube-study` 에서 이식 (복사 아님).
- FR-17 은 오늘 화면 4상태 분기와 `firstTrainingDay` 의 `state` 인식 확장.

---

## Architecture Decision

1차의 ADR-1~14 를 승계하고, 이번 개정에서 새로 결정한 사항을 **ADR-15~ADR-21** 로 잇는다.

### 승계 요약 (변경 없음)

- ADR-1~7 (엔진 0.1.0): `planDay`/`planOn` 계층, `AppState.stints`/`proposals`, `SessionInput`/`SessionRecord` 분리, 미수행일 파생, 날짜 주입 경계, 제안 2단계 API, `history` 인덱스 기반 카운트.
- ADR-8~14 (UI 1차): 단일 SvelteKit 앱, 보조 운동 제거, `AppState.adjustedAtSessionIndex` 앵커, 저장 봉투, `todayClock`, `boot()` 부팅 시퀀스, 5개 페이즈 매핑.
- ADR-3 의 「엔진만 채우는 파생 필드」 원칙과 ADR-6 의 「생성/노출 분리」는 이번 판정 재작성에서도 그대로 유지된다.

**이번 개정에서 유효성이 재확인된 것**
- **ADR-4**: 미수행일은 파생. `reviewDay().status` 는 `rest`/`done`/`partial`/`missed` 를 계획-기록 차집합으로 만든다. **FR-17 은 이것을 건드리지 않는다** — `planOn().rest` 는 그대로 두고 화면 층에서 4상태를 파생한다 (FR-17.5 / FR-17.6).
- **ADR-10**: `adjustedAtSessionIndex` 앵커는 그대로 유효. FR-22 로 카운트 계산이 파생 상태 머신으로 바뀌지만 이 앵커는 여전히 "이 인덱스 이상만 판정한다" 는 하한 역할을 한다.
- **ADR-7**: 승급 · 유지 카운트는 저장 필드가 아니다. FR-22 도 이 원칙을 이어받아 **연속 횟수를 저장 필드로 두지 않는다** (ADR-15 참조).

---

### ADR-15: FR-22 연속 횟수는 `history` 파생 — 새 필드 없음. `schemaVersion` 은 FR-20 이 한 번만 올린다

**Problem**
FR-22 는 승급 판정을 「단계별 목표를 순차로 3회 연속 통과」로 바꾼다. 매 세션마다 「지금 어느 기준을 몇 회 연속 채웠는가」를 알아야 계획도, 표시도, 판정도 성립한다. 이 값을 저장 필드로 둘 것인가 파생할 것인가.

FR-22.10 이 이 결정을 설계로 넘겼다 — "새 필드가 필요 없을 수 있다. 필드를 더한다면 `schemaVersion` 을 올린다." 그리고 EC-51 은 "기존 저장 데이터의 재해석에서 단계가 뒤로 가면 안 된다" 를 요구한다.

**Options considered**
1. **파생** — `history` 를 순회하며 상태 머신을 돌려 (tier, streak) 를 계산. 새 필드 없음.
2. **저장 필드** — `AppState` 에 `Record<ProgressionId, { tier, streak }>` 를 추가. `schemaVersion` v2 → v3.
3. **혼합** — 파생하되 마지막 계산 결과를 캐시 필드로 저장.

**Decision**: 옵션 1 (파생).

**Rationale**
- ADR-7 이 이미 확립한 원칙: "'승급 후 N회' 같은 카운트는 저장 필드가 아니다. 저장 필드로 두면 각 이벤트(강등/추가 승급/전환/조정)가 서로 다른 갱신 경로가 되어 어긋난다." 새 규칙도 같은 성격이다 — 미달/'불가능'/다지기/조정 시점마다 카운트가 다르게 움직여야 한다.
- `history` 는 이미 (sets, kind, outcome, promotedTo, step) 을 담아 파생에 필요한 정보가 전부 있다. 상태 머신을 돌리면 결정적으로 (tier, streak) 이 나온다.
- **EC-51 자동 충족**: 재해석은 저장된 `state.steps[id]` 를 그대로 두고 그 위에서만 계산한다. 단계는 이미 결정된 값이라 뒤로 가지 않는다. 기존 데이터에 90% 규칙으로 축소한 세션들이 있어도 그것은 `sets` 에 실제 수행값으로 남아 있으므로, 새 규칙으로는 대개 "미달 → 연속 0" 이 되지만 **단계는 유지된다** (steps 는 그대로).
- FR-13.3 앵커(`adjustedAtSessionIndex`)를 그대로 재사용한다 — 파생 계산의 시작점(하한) 으로.
- 옵션 2/3 은 저장 스키마 오염과 갱신 경로 폭발을 부른다.

**설계 결과**

```ts
// src/lib/domain/history.ts 확장 (또는 src/lib/domain/progress.ts 신규)

/** FR-22 의 승급 카운트 상태. */
export type StreakTier = 'beginner' | 'intermediate' | 'progression' | 'elite';

export interface StepStreak {
  /** 지금 조준 중인 기준. 상급자 3연속 완성 후에는 다음 단계로 넘어가므로
   *  같은 (id, step) 에서 이 필드가 'progression'/'elite' 을 넘어가지 않는다. */
  tier: StreakTier;
  /** 그 기준의 연속 통과 횟수. 0~3. 3에 도달한 세션은 승급 판정 대상이다. */
  streak: number;
}

/**
 * 현 단계에서 지금까지 쌓인 (tier, streak) 을 파생한다.
 *
 * 이 종목의 `history` 를 시간순으로 훑으면서 상태 머신을 돌린다.
 * - `kind !== 'work'` 또는 `outcome === 'abandoned'` 이면 연속 유지 (FR-22.3a).
 * - work-completed 세션에서 현재 tier 의 기준을 채우면 streak+1.
 * - 채우면 streak=3 도달 → 다음 tier 로. tier == 상급자에서 3 도달은 승급 신호.
 * - 채우지 못하면 streak=0 (FR-22.3).
 *
 * `state.adjustedAtSessionIndex[id]` 앵커 이상인 세션만 본다 (FR-13.3).
 * 앵커 없으면 처음부터. `promotedTo` 가 있는 세션 이후는 새 단계이므로,
 * 그 뒤 세션들은 새 단계의 상태 머신이 다시 시작한다.
 *
 * 자유 운동(kind === 'free')은 이 계산의 대상이 아니다 (FR-18.6, ADR-16).
 */
export function stepStreak(
  state: AppState, catalog: Catalog, id: ProgressionId,
): StepStreak;
```

**`schemaVersion` 판단**
- FR-22 로 인한 스키마 변경: **없음.** `AppState` 필드 추가 없음.
- FR-20 으로 인한 스키마 변경: **있음.** `InProgressSession.warmupSets` 삭제 → `storage.ts` 의 검증기가 `warmupSets` 를 요구하지 않도록. 이전 v2 데이터에 `warmupSets` 가 있어도 무시한다 (FR-20.3 / EC-48).
- FR-18 로 인한 스키마 변경: **판별 유니온 확장뿐.** `SessionRecord.kind` 에 `'free'` 추가. 기존 데이터는 `'free'` 레코드가 없으므로 하위 호환. 봉투 버전은 올릴 필요 없음.

→ **`CURRENT_SCHEMA_VERSION` 은 Phase 1(FR-20) 에서 v2 → v3 으로 한 번만 올린다.** FR-22 나 FR-18 은 올리지 않는다.

**Rejected**: 두 번 올리기 (v2→v3→v4). 두 SPEC 변경이 같은 릴리스에서 나가는데 사용자의 저장 봉투에 중간 상태(v3)로 앉을 시점이 없다. 한 번만 올리는 것이 사용자 시각·마이그레이션 경로 모두에서 단순하다.

---

### ADR-16: FR-18 자유 운동 판정 필터 — 판정 진입점 4곳에서 `judgingHistory` 뷰로 좁힌다

**Problem**
FR-18.6 표가 지적한 대로 자유 운동은 네 판정 경로에 새어 든다. 「승급만 빼면 된다」로 좁히면 나머지 셋(다음 목표 · 유지 횟수 · 강등)에서 샌다. FR-18.7 은 「한 곳에서 거르는 편이 낫다」로 요구한다.

**Options considered**
1. **`history.ts` 근본에서 필터** — `sessionsAt` / `lastSession` 자체가 `kind !== 'free'` 를 걸어낸다.
2. **판정 진입점에서 뷰로 좁힘** — 판정 함수들은 `judgingHistory(history)` 를 통해서만 히스토리를 본다.
3. **저장 계층에서 분리** — free 는 별도 배열(`freeHistory`) 로 저장.
4. **각 판정에서 개별 필터** — SPEC 이 명시적으로 반대한 방식.

**Decision**: 옵션 2.

**Rationale**
- 옵션 1 (`sessionsAt` 근본 필터) 은 조회 함수의 계약을 조용히 바꾼다. `reviewDay` 는 그날 free 기록도 `performed` 에 노출해야 한다 (FR-18.8 "기록이 있었다는 사실은 조회 결과에 드러나야 한다"). 조회와 판정이 같은 API 를 공유하고 있으므로 근본에서 필터하면 조회가 깨진다.
- 옵션 3 (저장 분리) 은 큰 스키마 변경이고 FR-18.5 ("`history` 에 남고 수행 이력으로 조회된다") 를 우회한다. 위험 대비 이득 없음.
- 옵션 4 는 FR-18.7 이 명시적으로 금지한 방식이다 ("네 곳에 각각 `kind !== 'free'` 조건을 흩뿌리면 다음에 추가되는 판정에서 또 빠뜨린다").
- 옵션 2 는 판정 계약을 명시적으로 만든다. **"판정하는 함수는 `judgingHistory` 를 통해서만 히스토리를 본다"** 를 규약으로 세우고 코드 리뷰 항목으로 강제한다. 새 판정이 추가되면 자연스럽게 이 규약을 따르게 된다.

**설계 결과**

```ts
// src/lib/domain/history.ts 확장

/**
 * 판정용 히스토리 뷰 (FR-18.7).
 *
 * 자유 운동(`kind === 'free'`)은 승급·유지·강등·다음 목표 계산 어디에도 영향을
 * 주지 않는다. 그 필터는 이 함수 **하나**에 집중한다. 판정하는 코드는 이 함수를
 * 통해서만 히스토리를 본다.
 *
 * 조회(`reviewDay` 의 `performed`, `sessionsAt` 자체) 는 이 필터를 쓰지 않는다 —
 * 자유 운동 기록도 이력이므로 조회 결과에는 남아야 한다 (FR-18.8).
 */
export function judgingHistory(history: SessionRecord[]): SessionRecord[] {
  return history.filter((r) => r.kind !== 'free');
}
```

**적용 지점 (판정 진입점 4곳)**

| # | 지점 | 조치 |
|---|---|---|
| 1 | `plan.ts` `planExercise` / `planConsolidation` / `stepStreak` (신규) | `sessionsAt`/`lastSession` 호출 전에 `judgingHistory` 로 좁힌 뷰를 만들어 넘긴다. 헬퍼: `judgingState(state)` (아래) |
| 2 | `evaluate.ts` `evaluateSession` / `rpeVeto` | `sessionsAt` 호출 전에 같은 방식 |
| 3 | `proposal.ts` `sessionIndices` | 반복문에서 `r.kind === 'free'` 도 건너뛴다 |
| 4 | `proposal.ts` `lastSetbackIndex` (실제로는 (3)이 처리) | (3) 이 이미 free 를 배제하므로 자동 충족 |

```ts
// src/lib/domain/history.ts
export function judgingState(state: AppState): AppState {
  return { ...state, history: judgingHistory(state.history) };
}
```

**FR-18.4 (단계 강하 방지) 는 별도 처리**
`applySession` 이 자유 운동 입력을 받았을 때 `state.steps[id]` 를 건드리지 않아야 한다. 이것은 판정 필터가 아니라 **입력 자체를 승급 판정 전에 조기 반환**하는 문제다:

```ts
// evaluate.ts 또는 applySession 조기 반환 분기
if (input.kind === 'free') {
  const record: SessionRecord = { ...input };
  return {
    state: { ...state, history: [...state.history, record] }, // steps 를 손대지 않는다
    evaluation: { /* free 전용 no-op evaluation */ },
    record,
  };
}
```

`consolidation` 분기(`nextStep = record.step`)를 자유 운동에도 적용하면 안 되는 이유는 SPEC FR-18.4 가 그대로 지적한다.

**FR-18.3 (잠긴 종목 거부)**
`checkGate` 를 자유 운동 UI 진입점에서 호출한다. 도메인 함수(`recordSession` / `applySession`)는 잠긴 종목 필터를 하지 않는다 — 도메인 계약을 free 만을 위해 바꾸지 않는다. UI 층에서 저장 전에 거른다.

---

### ADR-17: FR-22.7 미결 2건 결정 — `rpeDownshiftAt` 제거, `rpeVetoMean` 3연속 완성 시점에 적용

FR-22.7 이 설계로 넘긴 두 항목을 결정한다.

#### (a) `RULES.rpeDownshiftAt` (직전 RPE ≥ 9 이면 유지세트 목표 하향) — **제거**

**Rationale**
- 이 상수의 유일한 소비자는 `plan.ts` 의 `carryValue` 다. `carryValue` 는 유지세트의 값(`Math.floor(직전 평균) - 1`)을 만드는 함수다.
- FR-22.6 이 `carryValue` 를 명시적으로 제거 대상으로 지정했다. FR-22.4 는 매 세션 목표를 "현재 통과 중인 기준" 으로 고정한다 — 유지세트라는 개념 자체가 사라진다.
- 따라서 `rpeDownshiftAt` / `rpeDownshiftAmount` 는 죽은 상수가 된다. 남기면 오해를 부른다 (FR-22.8 이 요구한 "틀린 출처 표시는 없느니만 못하다").
- **결정**: `rpeDownshiftAt`, `rpeDownshiftAmount` 를 `rules.ts` 에서 삭제한다.

#### (b) `RULES.rpeVetoMean` / `rpeVetoWindow` (최근 3회 RPE 평균 ≥ 8 이면 승급 보류) — **유지. 상급자 3연속 완성 시점에 적용**

**Rationale**
- RPE 거부권의 원래 역할은 SPEC1 D-11 이 요약한 바 있다 — "부하가 높을수록 보수적으로 작동한다. 승급을 대체하지 않고 거부권과 목표 하향에만 쓴다." 규칙이 변해도 이 정책의 정당성은 그대로다.
- SPEC2 FR-22.7 이 물은 것: "3연속 통과 시점에 그대로 적용하면 되는가."
- **결정**: 그대로 적용한다. 다만 **트리거 지점이 달라진다** — 원래는 "이 세션에서 상급자 기준 통과" 시 발동. 새 규칙에서는 "이 세션이 상급자 기준의 3번째 연속 통과" 시 발동.
- `rpeVetoWindow: 3` 과 `상급자 3연속` 이 자연스럽게 맞다. 정확히 그 3세션의 RPE 평균이 임계 이상이면 승급을 보류한다.
- 보류 시 동작: 승급하지 않고, 그 기준의 연속 횟수는 **3 을 유지한다** — 4번째 세션이 또 상급자 기준 통과이고 RPE 평균이 임계 미만이면 그때 승급한다. 이것이 원래 RPE 거부권의 "보류" 의미와 일치한다 (승급 취소 아님).
- `blockedBy: 'rpe'` 마킹은 그대로 유지 (EC-11 증거로 남음).

**주의**: 원래 규칙(`evaluate.ts:74-80`) 은 "이 세션이 상급자 기준을 채우면 거부권 검사" 였다. 새 로직에서는 "상급자 3연속 완성" 이 승급 트리거이므로 거부권도 그 시점에만 검사한다. `metTop` 하나만으로 발동하던 옛 위치는 사라진다.

#### (c) `RULES.consolidationBumpEvery` / `BumpRatio` — **그대로 유효**

다지기의 「3회마다 10% 증량」은 FR-22 로 바뀌지 않는다. `planConsolidation` 은 그대로 유효.

---

### ADR-18: FR-20 워밍업 제거 — 스키마 v3, 마이그레이션은 no-op

**Decision**
- `types.ts`: `PlannedExercise.warmup: TargetSet[]` 필드 삭제.
- `plan.ts`: `planWarmup` 함수 삭제. `planExercise` / `planConsolidation` 반환값에서 `warmup` 키 삭제.
- `rules.ts`: `maxWarmupSets` 상수 삭제.
- `storage.ts`: `InProgressSession.warmupSets` 필드 삭제. `isInProgressShape` 검증기가 이 필드를 요구하지 않도록.
- `session.svelte.ts`: `pushWarmupSet` / `updateWarmupSet` 제거. 시작 시 `warmupSets: []` 초기화 제거.
- `ExerciseCard.svelte`: 워밍업 절 렌더 코드 삭제.
- `+page.svelte`: 오늘 화면에 스트레칭 안내 한 줄 추가 (FR-20.5, 세션마다 반복 X).

**Migration (v2 → v3)**
```ts
function migrateInProgressV2toV3(v2: unknown): InProgressSession {
  const src = v2 as any;
  return {
    startedAt: src.startedAt,
    progressionId: src.progressionId,
    step: src.step,
    performedStep: src.performedStep,
    kind: src.kind,
    workSets: src.workSets ?? [],
    // warmupSets 는 있어도 무시한다 (FR-20.3 / EC-48)
  };
}
```

`AppState` 봉투는 v2→v3 이 실질적으로 no-op 이지만, `schemaVersion` 필드는 두 봉투에 공유되므로 두 봉투 다 v3 로 올린다.

---

### ADR-19: FR-17 오늘 화면 4상태 — 화면 층 파생, `rest` 정의 불변, `firstTrainingDay` 는 `state` 인식 확장

**Problem**
1차의 오늘 화면은 `agenda.rest` 하나로 갈렸다 (+page.svelte:96). 이는 두 경우를 놓친다.
- **미선택**: `agenda.kind === 'no-program'` → 리다이렉트만 하고 화면에 남지 않았다.
- **잠긴 종목만 배정된 날**: `rest === false && exercises.length === 0` → 빈 화면.

**Decision**
- `rest` 의 도메인 정의(`schedule.ts:52` 의 `entries.length === 0`)를 **바꾸지 않는다** (FR-17.5 / FR-17.6). 두 API (`planOn().rest` vs `reviewDay().status === 'rest'`) 가 다른 답을 주는 것은 서로 다른 질문에 답하는 것이므로 그대로 둔다. L-3 문구만 다듬는다.
- **화면 층에서 4상태를 파생한다**:

```ts
type TodayScreenState =
  | { kind: 'no-program' }
  | { kind: 'rest'; nextTrainingDate: IsoDate | null }
  | { kind: 'no-doable'; locked: {id, reason}[]; nextTrainingDate: IsoDate | null }
  | { kind: 'training'; agenda: DayAgenda };

function deriveTodayScreen(agenda: DayAgenda, state, catalog, today): TodayScreenState {
  if (agenda.kind === 'no-program') return { kind: 'no-program' };
  if (agenda.rest) return { kind: 'rest', nextTrainingDate: nextDoableTrainingDay(state, catalog, today) };
  if (agenda.exercises.length === 0) return { kind: 'no-doable', locked: agenda.locked, nextTrainingDate: ... };
  return { kind: 'training', agenda };
}
```

- **`firstTrainingDay` 의 `state` 인식 확장** (FR-17.4).
  현 시그니처: `firstTrainingDay(catalog, programId, from): IsoDate` (프로그램 요일표만 본다. 잠금을 모른다).
  파생 목적: (a) "다음 첫 운동일이 1일차" 안내 (프로그램 선택 화면) — 여기서는 잠금 무관, 요일표만 필요. (b) 오늘 화면 "다음 루틴은 N월 N일" — **여기는 잠금을 알아야** 실제로 수행할 것이 있는 날을 가리킨다.

  **결정**: 기존 `firstTrainingDay(catalog, programId, from)` 을 그대로 두고 **새 함수 `nextDoableTrainingDay(state, catalog, from)`** 을 `program.ts` 에 추가한다.
  - 이유: 기존 호출부(`programs/+page.svelte:46`) 는 "선택하려는 프로그램" 의 첫 운동일을 묻는다. 사용자는 아직 그 프로그램을 선택하지 않았고, 잠금은 상태에 종속이지만 이 시점의 상태는 그 프로그램과 무관하다. **잠금을 여기서 반영하면 의미가 어긋난다.**
  - 새 함수 `nextDoableTrainingDay` 는 "현재 활성 구간의 프로그램에서, `from` 이후로 실제로 수행할 종목이 있는 첫 날짜" 를 돌려준다. `state`, `catalog`, `from` 을 받고 `planDay` 로 각 날짜의 `exercises.length > 0` 을 확인한다.
  - 7일을 다 봐도 없으면 **예외를 던지지 않고 `null` 을 돌려준다** (FR-17.4a / EC-43). 화면은 "당분간 수행할 종목이 없다" 를 표시.

```ts
// src/lib/domain/program.ts 확장 (신규 함수, 기존 firstTrainingDay 는 그대로)

/**
 * 활성 구간에서 실제로 수행할 종목이 있는 다음 날짜 (FR-17.4 / EC-43).
 *
 * `from` 자신도 후보다. 활성 구간 없거나 7일 안에 못 찾으면 null.
 * `planDay` 는 잠긴 종목을 `exercises` 가 아니라 `locked` 에 넣으므로,
 * `exercises.length === 0` 인 날은 실제로 수행할 것이 없는 날이다.
 */
export function nextDoableTrainingDay(
  state: AppState, catalog: Catalog, from: IsoDate,
): IsoDate | null;
```

**호출부 정리 (기존 그대로)**
- `programs/+page.svelte:46` — 선택 화면 안내. **기존 `firstTrainingDay` 유지.** 잠금 반영하지 않는다.
- `+page.svelte` (오늘 화면 rest/no-doable 브랜치) — **신규 `nextDoableTrainingDay` 사용.**

---

### ADR-20: 페이즈 매핑 — 5개 순차, 병렬 없음

**Decision**
SPEC2 의 변경을 성격별로 5개 페이즈로 묶는다. **병렬 페이즈 만들지 않는다.**

| Phase | 성격 | 대상 FR | 도메인 손상 | UI 손상 | 스키마 |
|---|---|---|---|---|---|
| 1 | 워밍업 제거 | FR-20 | plan.ts / rules.ts / types.ts | ExerciseCard / storage / session.svelte / +page | **v2→v3** |
| 2 | 승급 판정 재작성 + rules 정정 + 표시 위계 | FR-22 · FR-21 | plan.ts / evaluate.ts / rules.ts / history.ts (확장) | ExerciseCard 위계 정리 | — |
| 3 | 자유 운동 | FR-18 | types.ts / history.ts / evaluate.ts / plan.ts / proposal.ts | 자유 운동 화면 · 카드 | — |
| 4 | 오늘 화면 4상태 + firstTrainingDay 확장 | FR-17 | program.ts (nextDoableTrainingDay 신규) | +layout / +page (리다이렉트 제거 · 4상태 분기) | — |
| 5 | 상단 바 + About | FR-16 · FR-19 | — | +layout / wakelock / theme / install / About | — |

**병렬 후보 검토**

| 후보 | 판정 | 이유 |
|---|---|---|
| Phase 2 (FR-22) / Phase 3 (FR-18) 병렬 | **불가 (순차)** | 둘 다 `plan.ts` / `evaluate.ts` / `proposal.ts` / `history.ts` 를 손댄다. ADR-16 의 `judgingHistory` 필터는 FR-22 가 재작성한 판정 로직 위에 얹혀야 자연스럽다 — FR-22 이 없이 free 필터만 넣으면 옛 로직에 free 를 배제한 형태가 되어 곧 폐기될 코드가 된다. |
| Phase 4 (FR-17) / Phase 5 (FR-16) 병렬 | **불가 (순차)** | 둘 다 `+layout.svelte` 를 손댄다. FR-16 상단 바 배치와 FR-17 no-program 리다이렉트 제거가 같은 파일의 같은 영역에 걸린다. |
| Phase 1 (FR-20) / Phase 2 (FR-22) 병렬 | **불가 (순차)** | 둘 다 `plan.ts` / `rules.ts` 를 손댄다. FR-20 이 워밍업을 먼저 없애야 FR-22 판정 재작성이 깨끗해진다 (남은 `warmup` 필드를 계속 채워 넣는 재작성이 되지 않도록). |
| Phase 3 (FR-18) / Phase 4 (FR-17) 병렬 | **가능하지만 이득 없음** | 파일 겹침 0, 도메인 의존 방향 없음. 그러나 개발자 1인이고 순차 실행의 총 시간이 병렬 세팅 비용을 상쇄하지 못한다. ADR-14(1차) 와 동일한 근거로 **순차**로 둔다. |

**결과**: 5개 순차, 병합 페이즈(N.5) 없음. worktree 병렬 없음.

**Rationale**
- SPEC2 의 「가장 큰 변경」이 FR-22 (승급 판정) 라고 사용자가 강조했다. FR-20 을 먼저 하는 이유는 FR-22 재작성의 대상 함수(`planExercise`)가 `warmup` 필드를 여전히 채워 넣는 상태에서 다시 쓰이는 것을 피하기 위함이다 — 두 변경이 같은 파일의 같은 함수를 순차로 두 번 대폭 수정하는 것보다, FR-20 이 정리한 뒤 FR-22 가 다시 쓰는 편이 diff 가 읽힌다.
- FR-18 은 FR-22 의 재작성 결과 위에 `judgingHistory` 필터를 얹는 형태로 자연스럽다.
- FR-17 은 도메인 손상이 거의 없다 (`nextDoableTrainingDay` 한 함수 신규). 화면 층 중심.
- FR-16/19 는 새 파일 중심이라 마지막이 리스크가 가장 낮다. 참조 구현이 완성돼 있어 이식 시간이 예측 가능.

**커밋 경계 (각 페이즈 안)**

각 페이즈는 1~3개 커밋으로 나눈다. 각 커밋에서 `pnpm test` · `pnpm run check` 통과 (NFR-20).

| Phase | 커밋 경계 |
|---|---|
| 1 | (1) 도메인 (types/plan/rules) + 도메인 테스트 (2) UI (storage/session/ExerciseCard/+page) + UI 테스트 + docs |
| 2 | (1) rules 정리 + `stepStreak` 파생 (2) `evaluate.ts` 재작성 + `plan.ts` 재작성 + 테스트 (3) UI 표시 위계 (ExerciseCard 카드 스타일 + reason 문구) + progressions.json _source / docs 정리 |
| 3 | (1) `SessionRecord.kind='free'` 확장 + `judgingHistory` + 판정 진입점 4곳 필터 (2) 자유 운동 UI 화면 + 카드 조정 + 테스트 |
| 4 | (1) `nextDoableTrainingDay` 신규 + program 테스트 (2) 오늘 화면 4상태 분기 · +layout 리다이렉트 제거 + UI 테스트 |
| 5 | (1) `wakelock`/`theme`/`install` 이식 + 테스트 (2) About 컴포넌트 + 초기화 이관 (3) +layout 상단 바 배치 · CSS 이중 정의 |

---

### ADR-21: 배포는 이번 범위 밖 (사용자 부재)

**Decision**
- 이 작업의 범위는 **push 와 PR 갱신까지** 다. `deploy/` 는 1차에서 만들어 그대로 두고, 이번엔 실제 배포를 하지 않는다.
- CI (`.github/workflows/ci.yml`) 는 이미 검사만 하도록 세팅됐다 — 그대로 유지.
- Phase 5 완료 후 `git push` 로 원격 브랜치를 갱신하고, PR 이 있으면 그 위에 커밋이 얹힌다. **PR 을 병합하지 않는다** (사용자 결정, 1차와 동일).

**근거**: 사용자가 이번 SPEC2 작업 시작 시점에 "배포는 이번에 하지 않는다 (사용자가 외출 중). Phase 에 배포를 넣지 마라" 를 명시했다.

---

## Data Model

### 변경 요약

```ts
// src/lib/domain/types.ts

// [FR-18] SessionInput / SessionRecord 의 kind 판별에 'free' 추가
export interface SessionInput {
  // ... 기존 필드 그대로
  kind: 'work' | 'consolidation' | 'free';  // 'free' 추가
  // ... outcome 등 그대로. free 는 outcome 을 쓰지 않는다.
}

// [FR-20] PlannedExercise.warmup 삭제
export interface PlannedExercise {
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  stepName: { en: string; ko: string };
  unit: Unit;
  perSide: boolean;
  // warmup: TargetSet[];   ← 삭제 (FR-20.1)
  work: TargetSet[];
  goal: { label: StandardLabel; sets: number; value: number };
  kind: 'work' | 'consolidation';  // free 는 PlannedExercise 를 만들지 않는다 (계획 X)
  reason: string;
  sideNote?: string;
  paired?: PlannedExercise;
}

// AppState: 무변경 (FR-22 는 파생, ADR-15)
// adjustedAtSessionIndex 는 그대로 유효 (ADR-10 승계)
```

```ts
// src/lib/ui/storage.ts

// [FR-20] warmupSets 필드 삭제
export interface InProgressSession {
  startedAt: string;
  progressionId: ProgressionId;
  step: number;
  performedStep: number;
  kind: 'work' | 'consolidation' | 'free';  // 자유 운동 진행 중도 담긴다
  // warmupSets: SetEntry[];   ← 삭제 (FR-20.1)
  workSets: SetEntry[];
}

// [FR-20] v2 → v3
export const CURRENT_SCHEMA_VERSION = 3;
```

```ts
// src/lib/domain/rules.ts — 정리 (FR-22.6 / FR-22.8 / ADR-17)

export const RULES = {
  /** book: 브리지·핸드스탠드는 빅4가 이 단계를 완료해야 시작한다. */
  gateStep: 6,
  /** 정책: 6단계 완수(진입)를 요구한다. */
  gateRequiresCompletion: true,

  // attemptThreshold: 삭제 (FR-22.6)
  // maxWarmupSets: 삭제 (FR-20)
  // rpeDownshiftAt: 삭제 (ADR-17 (a))
  // rpeDownshiftAmount: 삭제 (ADR-17 (a))

  /** book: 아무리 강해도 2단계부터 시작할 것을 권한다. */
  startStep: 2,

  /** book: 초보자 기준 미달 시 이전 단계 상급자 기준으로 다지는 세트 수. */
  consolidationSets: 2,

  /** 정책: 다지기가 N회마다 수행량을 한 단계 올린다. */
  consolidationBumpEvery: 3,
  /** 정책: 올릴 때의 증가폭. 30 → 33 → 36 → 39. */
  consolidationBumpRatio: 0.1,

  /** 정책: 상급자 3연속 통과 시점의 최근 세션 RPE 평균이 임계 이상이면 승급 보류. (ADR-17 (b)) */
  rpeVetoWindow: 3,
  rpeVetoMean: 8,

  /** 정책: FR-22 승급에 요구되는 연속 통과 횟수. */
  promotionStreakRequired: 3,
} as const;
```

**표시 정리 (FR-22.8)**: `book:` 이 붙었던 것 중 실제로 책과 대조가 확인된 것은 `gateStep` / `startStep` / `consolidationSets` 뿐이다. 나머지는 `정책:` 으로 표기한다. `attemptThreshold` 와 `maxWarmupSets` 는 이제 존재 자체가 사라진다.

### 파생 타입 (신규)

```ts
// src/lib/domain/history.ts (또는 progress.ts 신규)

export type StreakTier = 'beginner' | 'intermediate' | 'progression' | 'elite';

export interface StepStreak {
  tier: StreakTier;
  streak: number;   // 0..3. 3은 승급 판정 대상.
}

export function stepStreak(state, catalog, id): StepStreak;
export function judgingHistory(history: SessionRecord[]): SessionRecord[];
export function judgingState(state: AppState): AppState;
```

---

## API Design

### 신규 공개 함수

| 모듈 | 함수 | 성격 | FR |
|---|---|---|---|
| `src/lib/domain/history.ts` | `judgingHistory(history)` / `judgingState(state)` | 순수 | FR-18.6 / FR-18.7 |
| `src/lib/domain/history.ts` (또는 신규 `progress.ts`) | `stepStreak(state, catalog, id): StepStreak` | 순수 파생 | FR-22.4 / FR-22.5 |
| `src/lib/domain/program.ts` | `nextDoableTrainingDay(state, catalog, from): IsoDate \| null` | 순수 | FR-17.4 / FR-17.4a / EC-43 |
| `src/lib/ui/wakelock.svelte.ts` | `wakeLock.enabled` / `wakeLock.toggle()` / `wakeLock.supported` | 룬 상태 | FR-16.5~16.7 |
| `src/lib/ui/theme.svelte.ts` | `theme.value` / `theme.cycle()` | 룬 상태 | FR-16.3 / FR-16.4 |
| `src/lib/ui/install.svelte.ts` | `install.available` / `install.prompt()` | 룬 상태 | FR-16.2 / EC-31 / EC-32 |
| `src/lib/ui/About.svelte` | 정보 모달 + 업데이트 확인 + 전체 초기화 | 컴포넌트 | FR-19.1~19.4 |

### 시그니처가 바뀌는 기존 함수

| 함수 | 전 → 후 | 근거 |
|---|---|---|
| `PlannedExercise` | `warmup: TargetSet[]` 필드 삭제 | FR-20.1 |
| `SessionInput.kind` / `SessionRecord.kind` | `'work' \| 'consolidation'` → `'work' \| 'consolidation' \| 'free'` | FR-18 |
| `evaluateSession` | 반환 형태 자체는 유지. 내부적으로 `kind === 'free'` 조기 반환 · 3연속 통과 판정으로 재작성 | FR-22 / FR-18 |
| `applySession` | 시그니처 유지. `input.kind === 'free'` 이면 `steps` 를 손대지 않는다 | FR-18.4 |
| `planExercise` | 시그니처 유지. 내부 완전 재작성 (streak 기반) | FR-22.4 / FR-22.5 |
| `planConsolidation` | 시그니처 유지. `warmup` 필드 반환 삭제 | FR-20.1 |
| `RULES` | `attemptThreshold`, `maxWarmupSets`, `rpeDownshiftAt`, `rpeDownshiftAmount` 삭제. `promotionStreakRequired` 추가 | FR-22.6 / FR-20 / ADR-17 |

### 삭제되는 함수

- `plan.ts` 의 `planWarmup(catalog, id, step)` — FR-20.1
- `plan.ts` 안의 내부 함수 `hasClearedBeginner` / `carryValue` — FR-22.6 (내부라 export 아님이지만 명시)

---

## 모듈 구성표

| 파일 | 상태 | 책임 | Phase |
|---|---|---|---|
| `src/lib/domain/types.ts` | 확장·삭제 | `PlannedExercise.warmup` 삭제(1), `SessionInput.kind` 에 `'free'` 추가(3) | 1 · 3 |
| `src/lib/domain/rules.ts` | 축소 | 사망 상수 삭제, `promotionStreakRequired` 추가, `book:`/`정책:` 표기 정리 | 1 · 2 |
| `src/lib/domain/plan.ts` | **재작성** | `planWarmup` 삭제(1), `planExercise` streak 기반 재작성(2), `judgingState` 로 좁힘(3) | 1 · 2 · 3 |
| `src/lib/domain/evaluate.ts` | **재작성** | 상급자 3연속 판정으로 재작성(2), `input.kind === 'free'` 조기 반환(3), RPE 거부권을 3연속 완성 시점으로 이전(2) | 2 · 3 |
| `src/lib/domain/history.ts` | 확장 | `judgingHistory` / `judgingState` / `stepStreak` 신규 | 2 · 3 |
| `src/lib/domain/proposal.ts` | 소폭 수정 | `sessionIndices` 안에서 `kind === 'free'` 건너뛰기 | 3 |
| `src/lib/domain/program.ts` | 확장 | `nextDoableTrainingDay` 신규 | 4 |
| `src/lib/domain/index.ts` | 확장 | 신규 함수 export (`judgingHistory` / `stepStreak` / `nextDoableTrainingDay`) | 각 phase |
| `src/lib/ui/storage.ts` | 소폭 수정 | `warmupSets` 삭제, `CURRENT_SCHEMA_VERSION` v3, v2→v3 마이그레이션, `kind === 'free'` 허용 | 1 · 3 |
| `src/lib/ui/session.svelte.ts` | 축소·확장 | `pushWarmupSet`/`updateWarmupSet` 삭제(1), `beginFree(startedAt, plan)` 신규(3) | 1 · 3 |
| `src/lib/ui/session/ExerciseCard.svelte` | 재편 | 워밍업 절 제거(1), 표시 위계 정리(2), free 카드 지원(3) | 1 · 2 · 3 |
| `src/lib/ui/session/FreeExerciseForm.svelte` | **신규** | 자유 운동 입력 (종목·단계·난이도·세트) | 3 |
| `src/routes/+page.svelte` | 재편 | 스트레칭 안내 추가(1), 4상태 분기(4), 자유 운동 진입 버튼(3), reason/goal 위계(2) | 1 · 2 · 3 · 4 |
| `src/routes/+layout.svelte` | 재편 | no-program 리다이렉트 제거(4), 상단 바 배치(5), About 진입(5), 초기화 다이얼로그 About 으로 이관(5) | 4 · 5 |
| `src/lib/ui/wakelock.svelte.ts` | **신규** (이식) | Screen Wake Lock (FR-16.5~7) | 5 |
| `src/lib/ui/theme.svelte.ts` | **신규** (이식) | 테마 순환 · localStorage 저장 (FR-16.3) | 5 |
| `src/lib/ui/install.svelte.ts` | **신규** (이식) | `beforeinstallprompt` 가로챔 (FR-16.2) | 5 |
| `src/lib/ui/About.svelte` | **신규** (이식) | 이름·버전·커밋·업데이트 확인·초기화 (FR-19) | 5 |
| `src/app.css` (또는 `+layout.svelte` `<style>`) | 확장 | `[data-theme]` + `prefers-color-scheme` 이중 정의 (FR-16.4) | 5 |
| `src/lib/data/progressions.json` | 소폭 수정 | `_source` 정정 (실물 대조 범위) | 2 |
| `docs/PROGRESSIONS.md` | 수정 | 워밍업 · 90% 서술 삭제, 보조 규칙 대조 범위 정정 | 1 · 2 |
| `docs/LOGIC.md` | 수정 | 워밍업 · `maxWarmupSets` 행 삭제, 승급 판정 서술을 3연속으로 정정 | 1 · 2 |

---

## Phase Overview

| Phase | Description | Status | Dependencies |
|-------|-------------|--------|--------------|
| 1 | 워밍업 제거 (FR-20). 스키마 v2→v3. | Not Started | - |
| 2 | 승급 조건 정정 (FR-22) + 표시 위계 (FR-21) + rules/문서 정정 (FR-22.6/8/9) | Not Started | Phase 1 |
| 3 | 자유 운동 (FR-18). `kind='free'` + 판정 필터 4곳 + UI | Not Started | Phase 2 |
| 4 | 오늘 화면 4상태 (FR-17) + `nextDoableTrainingDay` + `+layout` 리다이렉트 제거 | Not Started | Phase 3 |
| 5 | 상단 바 (FR-16) + About (FR-19). CubeStudy 이식 + 상단 바 배치 + CSS 이중 정의 | Not Started | Phase 4 |

**병렬 페이즈 없음. 병합 페이즈 없음** (ADR-20).

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
```

---

## 기존 테스트 561개 처리 방침

**대전제** (SPEC2 NFR-20)
- `pnpm test` 561개 전부 통과가 기준선.
- FR-20 · FR-22 로 테스트 수가 **줄어드는 것이 정상**이다. 각 페이즈 커밋 메시지에 「줄어든/재작성된 케이스 수와 사유」 를 적는다 (FR-20.6 / FR-22.11).
- FR-18 · FR-17 · FR-16 · FR-19 로 테스트 수가 **늘어난다** (NFR-15 각 EC 는 테스트 케이스로 존재).

### Phase 1 (FR-20) 에서 조정되는 테스트

**삭제 대상** (약 8~10개)

| 파일 | 케이스 | 사유 |
|---|---|---|
| `tests/unit/plan.test.ts` | "워밍업은 최대 2세트, 3단계부터는 직전 두 단계의 중급자 기준" (line 128) | `planWarmup` 삭제 |
| `tests/unit/plan.test.ts` | `planWarmup(catalog, 'pushup', 2/5/9)` 3건 (line 130~133) | 함수 자체 소멸 |
| `tests/unit/inprogress.test.ts` | `pushWarmupSet` / `updateWarmupSet` 테스트 (약 4건) | API 소멸 |
| `tests/unit/storage.test.ts` | `warmupSets` 필드 검증 (약 2~3건) | 스키마에서 삭제 |

**재작성 대상** (약 3~5개)

| 파일 | 케이스 | 방향 |
|---|---|---|
| `tests/unit/plan.test.ts` | 여러 케이스가 `planExercise` 반환에서 `warmup` 필드를 assertion — 그 부분만 삭제 | 나머지 assertion 유지 |
| `tests/unit/inprogress.test.ts` | `beginWork` 시 `warmupSets: []` 확인 | `workSets: []` 만 확인으로 |
| `tests/unit/storage.test.ts` | 라운드트립 케이스 (`warmupSets` 무시 확인 신규) | v2 데이터에 warmupSets 있어도 읽어들이는 마이그레이션 테스트 신규 |

**신규 대상** (Phase 1 안에)
- `tests/unit/storage.test.ts`: v2 → v3 마이그레이션 확인 (EC-48)
- `tests/unit/inprogress.test.ts`: `warmupSets` 없이 정상 완료 라운드트립

**예상 이관 후 테스트 수**: 561 → 대략 550~555.

### Phase 2 (FR-22) 에서 조정되는 테스트

**전면 재작성** (`tests/unit/evaluate.test.ts`, 41개 중 대부분)

| 옛 사양 | 새 사양 |
|---|---|
| "상급자 기준을 채우면 다음 단계로 올린다" | "상급자 기준을 **3연속** 채워야 다음 단계로 올린다" |
| "RPE 평균이 임계 이상이면 기준을 채워도 승급을 보류한다" (즉시 판정 시점) | "상급자 3연속 완성 시점에 최근 3회 RPE 평균이 임계 이상이면 보류" |
| "3세트 기준은 세 세트를 모두 채워야 한다" | 그대로 유효 (단일 세션 판정) |
| RPE veto 창 관련 케이스 | 트리거 지점이 상급자 3연속 완성으로 이전 |

**전면 재작성** (`tests/unit/plan.test.ts`, 32개 중 절반 이상)

| 옛 사양 | 새 사양 |
|---|---|
| "초보자 통과·중급자 미달이면 유지 1세트 + 중급자까지 최대한" | "초보자 3연속 통과 후 중급자 구간 · 매 세션 중급자 기준 도전 · 미달이면 연속 0" |
| "중급자 통과 후 상급자가 2세트면 유지 1세트 + 상급자까지 최대한" | "중급자 3연속 후 상급자 구간 · 매 세션 상급자 기준 도전" |
| "상급자가 3세트면 유지 2세트 + 마지막 세트 최대한" | "상급자 구간 · 매 세션 상급자 기준 3세트 도전" |
| "직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다" (line 110) | **삭제** (90% 규칙 소멸, FR-22.6) |
| "직전 RPE 9 이상이면 유지 세트 목표를 1 낮춘다" (line 119) | **삭제** (`rpeDownshiftAt` 소멸, ADR-17 (a)) |
| "다지기 3회마다 수행량이 기준의 10%씩 올라간다" | 그대로 유효 (`consolidationBumpEvery/Ratio` 유지) |
| "새 단계 첫 세션은 초보자 기준에 도전한다" | 그대로 유효 (첫 세션 = 초보자 구간 시작) |

**신규 대상** (`tests/unit/stepStreak.test.ts` 또는 `plan.test.ts`/`history.test.ts` 확장)
- 초보자 0회 → 1회 → 2회 → 3회 → 중급자 0회 로 tier 전이
- 초보자 2회 후 미달 → 초보자 0회 (FR-22.3 / EC-49)
- 초보자 2회 후 '불가능' → 초보자 2회 유지 (FR-22.3a / EC-53)
- 초보자 2회 후 다지기 세션 → 초보자 2회 유지 (FR-22.3a)
- 상급자 3회 완성 → promote (FR-22.1)
- 상급자 3회 완성 시점 RPE 평균 ≥8 → blockedBy: 'rpe', tier 유지 (ADR-17 (b))
- 그 다음 세션에서 상급자 통과 & RPE 정상 → promote
- 승급 후 새 단계 = 초보자 구간 새로 시작 (streak=0)
- 수동 조정 후 조정 앵커 이상만 계산 (ADR-10 재확인)
- EC-51: 기존 저장 데이터(승급 이력 포함) 재해석 시 단계가 뒤로 가지 않음
- EC-52: 상급자 기준 크게 초과해도 그 세션은 연속 1회로 카운트

**integration.test.ts 조정** (50개 중 5~10건)
- `maintainedHistory` 헬퍼가 "상급자 기준 1회 통과 3세션" 을 만드는데, 새 규칙에서는 "각 tier 3연속 × 3tier = 9세션" 이 필요. 헬퍼 재작성 또는 케이스별 조정.
- EC-7 (프로그램 전환 시 카운트 리셋) 은 그대로 유효.

**proposal.test.ts 조정** (88개 중 5~15건)
- `maintenanceCount` 자체는 기존 계약 유지 (승급 후 세션 수). 다만 승급이 늦게 일어나므로 카운트 도달까지 필요한 세션 수 조정.

**예상 이관 후 테스트 수**: 555 → 대략 530~540. 신규 stepStreak 케이스로 +10 정도 다시 상승.

### Phase 3 (FR-18) 에서 신규되는 테스트

**신규** (`tests/unit/free.test.ts` 또는 파일별 분산)
- FR-18.1: work / consolidation / free 세 kind 가 판별 유니온으로 존재
- FR-18.4 / EC-40: free 세션 후 `state.steps[id]` 불변
- FR-18.6 승급 판정 leak: free 로 상급자 3연속 채워도 승급 없음 (EC-41)
- FR-18.6 다음 목표 leak: free 를 "직전 세션" 으로 잡지 않음 (EC-44)
- FR-18.6 유지 횟수 leak: free 반복해도 `maintenanceCount` 안 늘어남 (EC-46)
- FR-18.6 강등 leak: free abandon 이 `lastSetbackIndex` 에 잡히지 않음 (EC-45)
- FR-18.7 `judgingHistory` / `judgingState` 순수성 및 필터 정확성
- FR-18.8 `reviewDay`: free 는 `planned` 판정에 없지만 `performed` 에 노출
- FR-18.9 free 세션 RPE 최댓값 규칙 유지 (D-11)

**신규** (`tests/unit/inprogress.test.ts` 확장)
- free 세션 진행 중 저장·복원

**예상 이관 후 테스트 수**: 530~540 → 약 555~570.

### Phase 4 (FR-17) 에서 신규되는 테스트

**신규** (`tests/unit/program.test.ts` 확장)
- `nextDoableTrainingDay`: 잠긴 종목만 있는 날을 건너뛴다
- 7일 안에 못 찾으면 `null` (FR-17.4a / EC-43)
- 프로그램 미선택이면 `null`

**신규** (`tests/unit/todayScreen.test.ts` 신규 또는 헤드리스 함수 테스트)
- 4상태 파생 함수 `deriveTodayScreen` 단위 테스트 (컴포넌트 마운트 없음, NFR-14)
- no-program → no-program (리다이렉트 아님, FR-17.1 / EC-39)
- rest → rest (FR-17.2)
- rest === false, exercises 빔 → no-doable (EC-37)
- exercises 있음 → training

**예상 이관 후 테스트 수**: 555~570 → 약 570~585.

### Phase 5 (FR-16 / FR-19) 에서 신규되는 테스트

**신규** (`tests/unit/wakelock.test.ts`, `tests/unit/theme.test.ts`, `tests/unit/install.test.ts`)
- `// @vitest-environment happy-dom` (NFR-21)
- CubeStudy 참조 테스트를 준용해 이식

**신규** (`tests/unit/about.test.ts` 또는 로직 헬퍼 단위)
- 2단계 초기화 확인 상태 전이 (`idle` → 클릭 → `confirming` → 클릭 → 실행)
- 모달 닫으면 `idle` 로 되돌아감 (EC-47)

**예상 이관 후 테스트 수**: 570~585 → 약 600~625.

---

## Edge Case ↔ Phase 매핑 (SPEC2 EC-31~55 = 25건)

| EC | 상황 | Phase | 위치 |
|---|---|---|---|
| EC-31 | `beforeinstallprompt` 안 옴 | 5 | `install.test.ts` |
| EC-32 | 설치 프롬프트 취소 | 5 | `install.test.ts` |
| EC-33 | `navigator.wakeLock` 미지원 | 5 | `wakelock.test.ts` |
| EC-34 | wake lock 거부됨 | 5 | `wakelock.test.ts` |
| EC-35 | 백그라운드 → 복귀 | 5 | `wakelock.test.ts` |
| EC-36 | localStorage 차단 상태 토글 | 5 | `theme.test.ts` / `wakelock.test.ts` (try/catch) |
| EC-37 | 요일표 있으나 전부 잠긴 날 | 4 | `todayScreen.test.ts` |
| EC-38 | 다음 운동일이 계산상 전부 잠긴 날 | 4 | `program.test.ts` (`nextDoableTrainingDay`) |
| EC-39 | 프로그램 미선택 오늘 화면 진입 | 4 | `todayScreen.test.ts` |
| EC-40 | free 로 낮은 단계 기록 | 3 | `free.test.ts` |
| EC-41 | free 로 상급자 크게 초과 | 3 | `free.test.ts` |
| EC-42 | 잠긴 종목 free 시도 | 3 | `free.test.ts` (UI 단 gate 검증) |
| EC-43 | 7일 안에 수행할 종목 없음 | 4 | `program.test.ts` |
| EC-44 | free 로 현재 단계 기록 → 다음 목표 leak | 3 | `free.test.ts` |
| EC-45 | free 도중 중단 → 강등 leak | 3 | `free.test.ts` |
| EC-46 | 휴식일마다 free 반복 → 유지 leak | 3 | `free.test.ts` |
| EC-47 | About 닫았다 다시 → 초기화 idle | 5 | `about.test.ts` |
| EC-48 | v2 저장 데이터에 `warmupSets` 있음 | 1 | `storage.test.ts` |
| EC-49 | 초보자 2회 후 미달 → 0 | 2 | `stepStreak.test.ts` |
| EC-50 | 상급자 3연속 → 승급 (RPE 판정) | 2 | `evaluate.test.ts` / `stepStreak.test.ts` |
| EC-51 | 기존 승급 이력 재해석 시 단계 유지 | 2 | `stepStreak.test.ts` |
| EC-52 | 상급자 크게 초과 → 연속 1회 | 2 | `evaluate.test.ts` |
| EC-53 | 연속 2회 뒤 '불가능' → 연속 2 유지 | 2 | `stepStreak.test.ts` |
| EC-54 | 다지기 다음날 같은 목표 재시도 | 2 | `plan.test.ts` (reason 문구 검증) |
| EC-55 | '불가능' 연속으로 여러 번 | 2 | `stepStreak.test.ts` (연속 유지 + 다지기 누적) |

---

## Risk Mitigation

### Risk 1: FR-22 재작성이 기존 테스트를 광범위하게 깬다 (High)
**Impact**: High (evaluate.test.ts / plan.test.ts / integration.test.ts / proposal.test.ts 에 걸침)
**Mitigation**:
- Phase 2 커밋을 3분할: (1) rules 정리 + `stepStreak` 파생 함수만 (2) `evaluate.ts`/`plan.ts` 재작성 + 관련 테스트 (3) UI 위계 정리
- 각 커밋에서 `pnpm test` 통과가 요구되므로 (2) 커밋에서 대량의 테스트를 함께 손대게 된다. 이때 「이관 오류」 vs 「사양 변경」 을 커밋 메시지로 분리해서 표기.
- Phase 2 완료 시점 CHANGELOG 에 삭제/재작성/신규 테스트 수 명시 (FR-22.11 요구).

### Risk 2: `judgingHistory` 필터가 판정 진입점 하나에서 누락 (High)
**Impact**: High (FR-18.6 이 명시한 leak 이 다시 발생)
**Mitigation**:
- Phase 3 커밋 (1) 에 "판정 진입점 4곳 전수" 를 체크리스트로 명시.
- Phase 3 TEST 에 각 leak 경로별 회귀 케이스를 필수로 둔다 (EC-40~46).
- 코드 리뷰 규약: "새 판정 함수를 추가할 때는 `judgingState` / `judgingHistory` 로 좁힌 뷰만 본다".

### Risk 3: `firstTrainingDay` 시그니처 확장 유혹으로 기존 호출부가 깨진다 (Medium)
**Impact**: Medium (프로그램 선택 화면 안내가 잘못됨)
**Mitigation**:
- ADR-19 의 결정을 지킨다: **기존 `firstTrainingDay` 는 그대로**, `nextDoableTrainingDay` **신규**. 두 함수의 계약이 다른 이유를 각 JSDoc 에 명시.
- 기존 `firstTrainingDay` 는 `state` 를 받지 않으므로 호출부가 자동으로 옛 계약을 유지한다.

### Risk 4: FR-20 스키마 v3 마이그레이션이 v2 데이터를 잃는다 (Medium)
**Impact**: Medium (사용자 진행 중 세션이 사라질 수 있음)
**Mitigation**:
- v2 → v3 은 `warmupSets` 를 무시하는 것뿐이고 `workSets` / `startedAt` / `progressionId` / `step` 등은 그대로 옮긴다.
- Phase 1 TEST 에 "v2 봉투(`warmupSets` 포함)를 넣고 읽어 v3 로 정상 복원" 케이스 필수.
- `AppState` 봉투는 v2→v3 no-op 이지만 `schemaVersion` 은 함께 올리므로, v2 `AppState` 도 이 마이그레이션을 통과해야 한다.

### Risk 5: FR-22 재해석으로 사용자의 저장된 승급이 뒤로 가는 것처럼 보임 (Medium)
**Impact**: Medium (사용자 신뢰 문제)
**Mitigation**:
- ADR-15 결정: `state.steps[id]` 는 그대로 두고 그 위에서 상태 머신을 돌린다 → 단계 자체는 이미 결정된 값이라 뒤로 가지 않는다 (EC-51).
- Phase 2 TEST 에 "기존 승급 이력이 있는 상태 → 재해석 후 `state.steps` 불변" 케이스 필수.
- 단, 새 규칙에서는 그 다음 세션의 연속 카운트가 0 에서 다시 시작될 수 있다 — 이는 「사용자가 새 규칙 아래에서 3연속을 다시 채워야 다음 승급」 이라는 정직한 결과이므로 정상 동작이다.

### Risk 6: FR-16 CSS 이중 정의를 놓쳐 테마 토글이 시스템 모드에서 안 이긴다 (Medium)
**Impact**: Medium (FR-16.4 요구 실패)
**Mitigation**:
- Phase 5 커밋 (3) 에서 CSS 를 다음 순서로 정의:
  1. `:root { --color-*: ... }` (기본 = 라이트)
  2. `@media (prefers-color-scheme: dark) { :root { --color-*: ... } }` (시스템 모드 다크)
  3. `:root[data-theme="dark"] { --color-*: ... }` (강제 다크)
  4. `:root[data-theme="light"] { --color-*: ... }` (강제 라이트)
- (3)(4) 가 우선순위상 (1)(2) 를 이긴다 (선택자 특이도 동일이면 뒤가 이김).
- Phase 5 TEST 에 CSS 순서 확인 케이스는 두지 않는다 (CSS 는 단위 테스트 대상 아님, 수동 확인). GLOBAL 의 이 항목이 그 확인의 근거.

### Risk 7: About 의 「전체 데이터 초기화」 가 1차의 `+layout.svelte` 초기화 다이얼로그와 중복 (Low)
**Impact**: Low (UI 혼란)
**Mitigation**:
- Phase 5 커밋 (2) 에서 `+layout.svelte` 의 기존 `Confirm` (line 111~119) 을 **삭제**하고 About 로 이관 (FR-19.4 명시).
- `showResetConfirm` 상태와 `resetInitial` 함수도 함께 이관.

### Risk 8: FR-17 리다이렉트 제거가 `+layout.svelte` 의 부팅 후 goto 로직과 충돌 (Low)
**Impact**: Low (첫 실행 화면(/steps) 진입 경로가 부작용)
**Mitigation**:
- `+layout.svelte:41` 의 `if (result.needsFirstRun && page.url.pathname !== '/steps') goto('/steps')` 는 그대로 유지 (첫 실행 단계 선택은 별개다, FR-3.5).
- `+layout.svelte:43-46` 의 `no-program` 리다이렉트만 삭제. 오늘 화면에 남아 `deriveTodayScreen('no-program')` 을 화면이 렌더한다.
- 마찬가지로 `+page.svelte:71-75` 의 `onMount` 에서 no-program → goto 도 삭제.

---

## Completion Criteria

전체 기능은 다음이 모두 참일 때 완료된다.

- [ ] Phase 1~5 전부 완료
- [ ] SPEC2 FR-16 ~ FR-22 전 항목 충족
- [ ] SPEC2 NFR-19 ~ NFR-22 전 항목 충족
- [ ] SPEC2 EC-31 ~ EC-55 이 각각 매핑된 테스트 케이스로 존재 (위 매핑 표)
- [ ] `pnpm test` 전부 통과 (예상 최종 600~625개)
- [ ] `pnpm run check` 오류 0 · 경고 0 (NFR-20)
- [ ] `src/lib/domain/` 안에 `new Date()` / `Date.now()` 0회 (NFR-5a 재확인)
- [ ] `src/lib/domain/` 안에 브라우저·Node·Svelte import 0회 (NFR-3 재확인)
- [ ] `git push` 로 원격 갱신. PR 이 있으면 자동 갱신되며 **병합하지 않는다** (ADR-21).
- [ ] 이번 작업에서 배포하지 않는다.

---

## SPEC 과의 불일치

SPEC 을 읽고 설계하는 과정에서 발견한 것들이다. **임의 해결하지 않고 여기 남긴다.**

### 1. FR-20.8 "90% 규칙을 이번에 제거하지 않는다" vs FR-22.6 "90% 규칙을 없앤다"

**상황**
- FR-20.8: "**90% 규칙도 같은 출처다.** 이번에 제거하지는 않되, 미검증임을 문서에 명시한다. 책 확인 뒤 판단할 항목으로 남긴다."
- FR-22.6: "90% 규칙과 그에 딸린 계산을 없앤다. `RULES.attemptThreshold`, `plan.ts` 의 `carryValue` · 직전 평균 기반 유지세트 · `hasClearedBeginner` 가 대상이다."

두 항목이 같은 대상(`attemptThreshold`)에 대해 반대 방향으로 지시한다.

**본 설계의 해석**
FR-22 가 이긴다. 근거:
- FR-22 는 SPEC2 의 "가장 큰 변경" 으로 명시적으로 승급 판정 근간을 바꾼다. 이 변경은 유지세트 개념 자체를 없애므로 90% 규칙의 소비자가 사라진다.
- FR-20.8 은 "책 확인 뒤 판단" 이지만, FR-22 가 그 판단을 앞당겨 "책에도 없다 = 없앤다" 로 확정했다.
- FR-22.6 이 명시적으로 `attemptThreshold` 를 대상으로 지정 → 삭제.
- FR-20.8 의 "미검증임을 문서에 명시" 는 FR-22.9 의 "실물 책과 대조한 것은 60단계의 기준 수치이고 보조 규칙은 그렇지 않다" 와 함께 소화된다 — 미검증 상태를 명시하되 그 상수 자체는 존재하지 않는다.

**필요한 결정**: 없음. 자체 판단으로 FR-22 를 따랐다. 사용자가 다르게 판단하면 뒤집는다.

### 2. FR-22.7 미결 2건의 결정 근거를 SPEC 이 어디에서 참조할지

**상황**
SPEC 이 FR-22.7 에서 두 항목을 명시적으로 설계에 위임했다: `rpeDownshiftAt`, `rpeVetoMean`.
본 설계는 ADR-17 에서 결정했으나, SPEC 본문에 이 결정이 반영되지 않는다.

**본 설계의 해석**
정상. FR-22.7 이 "설계 단계에서 판단" 이라 명시적으로 위임했으므로 결정은 GLOBAL 의 ADR 이 담당한다. SPEC 은 정본이므로 수정하지 않는다.

### 3. `firstTrainingDay` 변경 방향

**상황**
FR-17.4 는 "기존 함수를 바꿀지 새로 둘지는 설계가 정한다 — 기존 호출부(프로그램 선택 화면의 "다음 첫 운동일이 1일차" 안내)가 무엇을 기대하는지 읽고 판단하라."

**본 설계의 결정 (ADR-19)**
기존 `firstTrainingDay` 유지, `nextDoableTrainingDay` 신규 추가. 근거는 ADR-19 본문 참조.

**필요한 결정**: 없음.

### 4. FR-19.4 "1차 레이아웃에 이미 초기화 확인 다이얼로그가 있다면 중복으로 두지 말고 여기로 모은다"

**상황**
있다 (`+layout.svelte:111-119`). About 로 이관하라는 지시가 명확.

**본 설계의 처리 (Risk 7)**
Phase 5 커밋 (2) 에서 이관. `showResetConfirm` 상태와 `resetInitial` 함수도 함께 About 안으로 이동.

**필요한 결정**: 없음.

### 5. 자유 운동 UI 진입점의 위치

**상황**
SPEC 은 자유 운동의 도메인 규정을 명확히 하되 UI 화면 위치는 지정하지 않았다. FR-18.1 "언제든 기록", FR-18.2 "종목·단계·난이도·세트별 수치" 를 요구한다.

**본 설계의 결정**
오늘 화면(`+page.svelte`) 하단에 「자유 운동 기록」 버튼을 두고 클릭 시 `FreeExerciseForm.svelte` 모달을 연다. 별도 라우트를 만들지 않는다.
근거: FR-18.1 "언제든" = 휴식일에도 운동일에도. 오늘 화면이 진입점의 자연스러운 자리. 별도 탭(하단 4번째)은 화면 위계를 흐린다.

**필요한 결정**: 이 UI 배치가 사용자 의도와 맞는지. 다르면 배치만 조정.

---

## Next Steps

1. Phase 1 — 워밍업 제거. 스키마 v3. 커밋 2개 (도메인, UI+docs).
2. Phase 2 — 승급 판정 재작성. 커밋 3개 (rules+streak, evaluate+plan 재작성, UI 위계+문서).
3. Phase 3 — 자유 운동. 커밋 2개 (도메인 + 판정 필터, UI).
4. Phase 4 — 오늘 화면 4상태 + `nextDoableTrainingDay`. 커밋 2개.
5. Phase 5 — 상단 바 + About. 커밋 3개 (이식, About, 상단 바 배치+CSS).
6. Phase 5 완료 후 `git push`. PR 갱신. **병합·배포하지 않는다** (사용자 결정).

---

## References

- `.dc_workspace/2026_09_05-ui-2/SPEC.md` — SPEC2 (SOT)
- `.dc_workspace/2026_09_04-ui/{SPEC.md, GLOBAL.md}` — 1차 (승계)
- `.dc_workspace/2026_09_03-program-session/GLOBAL.md` — 엔진 0.1.0 ADR (승계)
- `src/lib/domain/plan.ts:31-43` — `planWarmup` (FR-20 삭제 대상)
- `src/lib/domain/plan.ts:46-49` — `carryValue` (FR-22.6 삭제 대상)
- `src/lib/domain/plan.ts:52-56` — `hasClearedBeginner` (FR-22.6 삭제 대상)
- `src/lib/domain/plan.ts:121-199` — `planExercise` (FR-22 재작성 대상)
- `src/lib/domain/evaluate.ts:82-84` — 현재 승급 트리거 (FR-22.2 로 대체)
- `src/lib/domain/evaluate.ts:74-80` — 현재 RPE 거부권 위치 (ADR-17 (b) 로 이전)
- `src/lib/domain/evaluate.ts:76-78` — `nextStep = record.step`, `applySession` 이 이를 `steps[id]` 에 씀 (FR-18.4 사고 경로)
- `src/lib/domain/rules.ts:17` `attemptThreshold` (FR-22.6 삭제), `:20` `maxWarmupSets` (FR-20 삭제), `:41-42` `rpeDownshiftAt`/`Amount` (ADR-17 (a) 삭제)
- `src/lib/domain/schedule.ts:52` — `rest: entries.length === 0` (FR-17.5 정의, **변경 없음**)
- `src/lib/domain/history.ts:4-14` — `sessionsAt` / `lastSession` (FR-18.6 leak 원인, ADR-16 필터 적용)
- `src/lib/domain/proposal.ts:48-58` — `sessionIndices` (FR-18.6 leak, ADR-16 필터 적용)
- `src/lib/domain/program.ts:72-81` — `firstTrainingDay` (ADR-19 그대로 유지, 신규 `nextDoableTrainingDay` 추가)
- `src/lib/domain/calendar.ts:82-108` — `reviewDay` (FR-17.6 문구 정리, `planned` 판정 그대로)
- `src/lib/ui/storage.ts:63` `warmupSets` (FR-20 삭제), `:109` 검증기 (마이그레이션 대상), `:33` `CURRENT_SCHEMA_VERSION = 2` (v3 로)
- `src/lib/ui/session.svelte.ts:66,90-104` — `warmupSets` 관련 API (FR-20 삭제)
- `src/routes/+layout.svelte:41-46` — no-program 리다이렉트 (FR-17.1 삭제 대상)
- `src/routes/+layout.svelte:111-119` — 초기화 확인 다이얼로그 (FR-19.4 About 로 이관)
- `src/routes/+page.svelte:71-75` — no-program 리다이렉트 (FR-17.1 삭제 대상)
- `src/routes/+page.svelte:96` — `agenda.rest` 단일 분기 (FR-17.2 4상태로 확장)
- `src/routes/programs/+page.svelte:46` — `firstTrainingDay` 사용처 (ADR-19 유지)
- `~/Documents/cube-study/src/lib/ui/wakelock.svelte.ts` — FR-16.5~7 참조 구현
- `~/Documents/cube-study/src/lib/ui/settings.svelte.ts` — FR-16.3 참조 구현
- `~/Documents/cube-study/src/routes/+layout.svelte` — FR-16.2 참조 구현
- `~/Documents/cube-study/src/lib/ui/About.svelte` — FR-19 참조 구현
- 기준 커밋: `0821ecc` (`feature/ui`), 테스트 561개, `pnpm run check` 0 오류
