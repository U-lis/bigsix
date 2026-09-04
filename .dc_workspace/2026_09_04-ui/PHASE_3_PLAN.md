# Phase 3: 도메인 변경 (FR-12 / FR-13 / FR-15)

**목적**: SPEC 이 지정한 세 개의 도메인 변경을 각각 별도 커밋으로 반영한다. 이관(Phase 1·2)과 섞지
않는다는 원칙(FR-0.8)의 반대편 — 여기부터는 동작이 바뀐다.

**SPEC 커밋 경계**: (3) 도메인 변경 (Notes 「커밋 분리 지침」)
**커밋 수**: 3 (FR-12 / FR-13 / FR-15 각각)
**병렬**: 없음 (셋 다 `src/lib/domain/types.ts` 를 건드림, GLOBAL ADR-14 참조)
**Dependencies**: Phase 2 (툴체인 완비)

**커밋 순서**: FR-12 → FR-13 → FR-15
- FR-12 (삭제) 먼저 하면 FR-13 이 다뤄야 하는 타입이 단순해진다
- FR-15 는 주석 · 문구만 이라 어디에 두어도 무해하되 마지막이 자연스럽다

---

## 완료 정의

### FR-12 커밋
- [ ] `AccessoryItem` 타입 삭제
- [ ] `DayPlan.accessories`, `DayAgenda.accessories`, `DayReview.accessories`,
      `ProgramDescription.accessories` 필드 삭제
- [ ] `planDay` / `describeProgram` / `planOn` / `reviewDay` / `noStintReview` 안의 `accessories`
      지역·반환 삭제
- [ ] `LABEL_TO_ID[label] === undefined` 인 라벨은 조용히 건너뜀 — 앱 어디에도 안 남는다 (FR-12.3)
- [ ] `data/progressions.json`(→ `src/lib/data/progressions.json`) 은 **손대지 않는다** (FR-12.2)
- [ ] 삭제 · 재작성된 테스트 목록이 커밋 메시지에 정리된다 (FR-12.4)
- [ ] `pnpm test` 성공 (테스트 수는 474 - 삭제 수 = 대략 465±5)
- [ ] `pnpm run check` 오류 · 경고 0

### FR-13 커밋
- [ ] `AppState` 에 `adjustedAtSessionIndex?: Partial<Record<ProgressionId, number>>` 추가 (ADR-10)
- [ ] `src/lib/domain/steps.ts` 신규 — `setStep(state, catalog, id, step)` 공개 API (FR-13.1, 13.2)
- [ ] `src/lib/domain/index.ts` 에 `setStep` re-export
- [ ] `src/lib/domain/proposal.ts`:
  - `effectiveFloorIndex` / `promotionBaselineIndex` / `maintenanceCount` 에 `adjustmentAnchor?:
    number` 인자 추가
  - `proposeSwitchForCurrent` 및 `advanceProposals` 가 `state.adjustedAtSessionIndex?.[id]` 를
    자동으로 각 종목에 넘김
- [ ] `applySession` / `abandonChallenge` / `recordSession` / `recordConsolidation` /
      `selectProgram` / `switchProgram` / `acceptProposal` 이 `adjustedAtSessionIndex` 를 스프레드로
      보존 (Risk 5, C-2 재발 방지)
- [ ] `tests/unit/steps.test.ts` 신규 — FR-13.1~13.6 + `AppState` 전 필드 보존 커버
- [ ] `tests/unit/proposal.test.ts` 확장 — `adjustmentAnchor` 계약 + `advanceProposals` 자동 반영
- [ ] `pnpm test` 성공, `pnpm run check` 오류 · 경고 0

### FR-15 커밋
- [ ] `src/lib/domain/types.ts:155` 의 `max` 주석 정정: "이 수치를 상한으로 최대한" → "이 수치를
      하한으로 최대한 (기준 이상이면 얼마든 초과 수행할 수 있고, 초과분이 승급 근거가 된다)"
- [ ] `README.md` / `docs/PROGRESSIONS.md` / `docs/LOGIC.md` 에 관련 문구가 있으면 함께 정정
- [ ] 코드 동작 무변경, 테스트 수 변화 없음
- [ ] `pnpm test` 성공, `pnpm run check` 오류 · 경고 0

---

## FR-12 커밋 상세 (보조 운동 제거)

### 삭제 대상 (`src/lib/domain/types.ts`)

- [ ] 삭제:
  ```ts
  /** 빅6에 없지만 프로그램 표에 등장하는 보조 운동(악력·종아리·목). */
  export interface AccessoryItem {
    name: string;
    prescription: string;
  }
  ```
- [ ] `DayPlan.accessories: AccessoryItem[]` 필드 삭제 (types.ts 의 `DayPlan` interface)
- [ ] `DayAgenda` 판별 유니온의 `kind: 'plan'` 가지에서 `accessories: AccessoryItem[]` 삭제
- [ ] `DayReview.accessories: AccessoryItem[]` 필드 삭제

### 수정 (`src/lib/domain/schedule.ts`)

- [ ] `planDay` 안의:
  - `const accessories: AccessoryItem[] = [];` 삭제
  - `accessories.push({ name: label, prescription });` 삭제 (조용히 continue 만)
  - 반환값의 `accessories,` 필드 삭제
- [ ] `import type { AccessoryItem, ... }` 에서 `AccessoryItem` 제거

### 수정 (`src/lib/domain/program.ts`)

- [ ] `ProgramDescription` 인터페이스에서 `accessories: string[];` 필드 삭제
- [ ] `describeProgram` 안:
  - `const accessories: string[] = [];` 삭제
  - `if (id === undefined) { if (!accessories.includes(label)) accessories.push(label); continue; }`
    를 `if (id === undefined) continue;` 로 축소
  - 반환값 `description` 의 `accessories,` 필드 삭제

### 수정 (`src/lib/domain/calendar.ts`)

- [ ] `planOn` 반환값에서 `accessories: plan.accessories,` 삭제
- [ ] `noStintReview` 에서 `accessories: [],` 삭제
- [ ] `reviewDay` 반환값에서 `accessories: plan.accessories,` 삭제
- [ ] `reviewDay` docstring 안의 "다만 `accessories` 참고 필드로 결과에는 남긴다" 문단 삭제 및
      "보조 운동은 판정에서 제외" 취지 문단 간소화 (지금은 애초에 결과에 없다)

### 테스트 조정

**삭제** (GLOBAL 「기존 테스트 474개 처리 방침」에서 열거된 6~7개):

- [ ] `tests/unit/program.test.ts`:
  - `it('solitary_confinement 의 보조 운동은 악력·종아리·목 3종이다 (FR-2.3)')` 삭제
  - `it('악력 운동이 월·목 두 번 나오지만 중복 제거된다')` 삭제
  - `it('나머지 4종의 보조 운동은 빈 배열이다')` 삭제
- [ ] `tests/unit/calendar.test.ts`:
  - `describe('reviewDay — accessories 참고 필드 …')` 블록 전체 삭제 (4 개 it)

**재작성**:

- [ ] `tests/unit/program.test.ts`:
  - `it('보조 운동이 progressionIds 에 섞이지 않는다')` → `it('빅6 매핑에 없는 라벨은 progressionIds
    에 나타나지 않는다')` (검증 대상 동일)
  - 필드 스냅샷 테스트에서 `'accessories'` 문자열 제거 (`['trainingDays', 'restDays',
    'progressionIds', 'accessories']` → `['trainingDays', 'restDays', 'progressionIds']`)
- [ ] `tests/unit/schedule.test.ts`:
  - `test('빅6에 없는 보조 운동은 따로 분류된다')` → `test('빅6에 없는 라벨은 조용히 건너뛴다 —
    DayPlan 에 남지 않는다')`
  - 어서션을 `assert.deepEqual(day.accessories, [...])` → `assert.equal(day.exercises.length, ...)`
    형태로 (라벨을 건너뛴 뒤 exercises 만 있고 accessories 자체가 없음)
- [ ] `tests/unit/plan.test.ts`:
  - DayPlan 키 스냅샷 (`['accessories','exercises','locked','rest','weekday']`) → `['exercises',
    'locked','rest','weekday']`
- [ ] `tests/unit/calendar.test.ts`:
  - `it('활성 구간이 없으면 plannedExercises 와 accessories 가 둘 다 빈 배열이다')` → `it('활성
    구간이 없으면 plannedExercises 가 빈 배열이다')` (accessories 부분만 삭제)
  - `it` 안의 `assert.equal(r.accessories.length, 2);` 등 accessories 어서션 삭제

**신규** (FR-12.3 검증):

- [ ] `tests/unit/schedule.test.ts` 에 `test('LABEL_TO_ID 에 없는 라벨(예: 악력 운동)은 planDay 결과
      어디에도 나타나지 않는다')` 추가:
  ```ts
  const day = planDay(state, catalog, 'solitary_confinement', '월');
  const labels = day.exercises.map((e) => e.stepName.ko);
  assert.equal(labels.some((l) => l.includes('악력')), false);
  assert.equal(labels.some((l) => l.includes('종아리')), false);
  ```

### 커밋

- [ ] `git add src/lib/domain/ tests/unit/`
- [ ] 커밋 메시지:
  ```
  feat(domain)!: 보조 운동(악력·종아리·목) 전면 제거 (FR-12 / D-17)

  0.1.0 은 accessories 를 "보이는데 안 세는" 참고 필드로 뒀고 L-1 이 그 모순을 남겼다.
  UI 를 얹으면서 이 모순을 없앤다 — 필드 자체를 도메인 출력에서 삭제한다.
  data/progressions.json 의 스케줄 라벨은 그대로 둔다 (책과 대조한 원전, FR-12.2).
  LABEL_TO_ID 에 없는 라벨은 조용히 건너뛴다 (FR-12.3).

  삭제된 타입: AccessoryItem
  삭제된 필드: DayPlan.accessories, DayAgenda.accessories, DayReview.accessories,
              ProgramDescription.accessories

  테스트 조정:
  - 삭제 6개 (accessories 참고 필드 전용 테스트)
  - 재작성 4개 (라벨을 조용히 건너뛰는 것으로 계약 변경)
  - 신규 1개 (LABEL_TO_ID 에 없는 라벨이 결과에 나타나지 않음 검증)
  - 이관 후 총 474 → NNN (변경 이유: FR-12.4)

  BREAKING CHANGE: DayPlan / DayAgenda / DayReview / ProgramDescription 에서
  accessories 필드가 사라진다. 소비자가 이 필드를 읽고 있다면 코드 변경 필요.
  ```

  `NNN` 은 실제 실행 후 채운다.

---

## FR-13 커밋 상세 (단계 수동 세팅 API)

### 타입 변경 (`src/lib/domain/types.ts`)

- [ ] `AppState` 인터페이스에 필드 추가:
  ```ts
  export interface AppState {
    steps: Record<ProgressionId, number>;
    history: SessionRecord[];
    stints: ProgramStint[];
    proposals: SwitchProposal[];
    /**
     * 수동 조정 시점의 스냅샷 (FR-13.3, ADR-10).
     * 값 = 조정 직후의 `history.length`. 조정된 적 없는 종목은 필드에 없다.
     * 이 인덱스 **이상**인 세션만 승급·유지 판정의 대상이 된다.
     * 조정은 `history` 에 아무것도 남기지 않으므로(FR-13.4), 세션 인덱스와의 관계는
     * `< adjustedAtSessionIndex[id]` = 조정 전, `>=` = 조정 후 로 결정적이다.
     */
    adjustedAtSessionIndex?: Partial<Record<ProgressionId, number>>;
  }
  ```

### 새 파일 (`src/lib/domain/steps.ts`)

- [ ] 신규:
  ```ts
  import { checkGate } from './gate.ts';
  import type { AppState, Catalog, ProgressionId } from './types.ts';

  /**
   * 종목의 훈련 단계를 수동으로 세팅한다 (FR-13, D-13 / D-14).
   *
   * 이 함수는 FR-13.3 불변식을 지키기 위해 `adjustedAtSessionIndex[id]` 에 현재
   * `history.length` 를 기록한다. 이후 승급·유지 판정은 이 인덱스 **이상**인
   * 세션만 대상으로 삼는다 (proposal.ts 의 effectiveFloorIndex 확장 참조).
   *
   * `history` 를 손대지 않는다 (FR-13.4). 과거 세션 기록은 그대로 남되 판정 범위에서
   * 자동으로 빠진다. 이는 스코프 축소지 데이터 삭제가 아니다.
   *
   * 잠긴 종목은 조정할 수 없다 (FR-8.7 / FR-13.2 / EC-27). 조정으로 잠금을 우회할 수
   * 없다 (FR-13.5) — checkGate 판정 규칙이 그대로 적용된다.
   *
   * 무리한 상향은 막지 않는다 (FR-13.6). 사용자가 스스로 '불가능' → 다지기 → 강등
   * 경로로 내려온다는 것이 사용자 결정이다.
   */
  export function setStep(
    state: AppState, catalog: Catalog, id: ProgressionId, step: number,
  ): AppState {
    if (!Number.isInteger(step) || step < 1 || step > 10) {
      throw new Error(`허용 범위 밖: ${step} (1~10 정수만 허용)`);
    }
    const gate = checkGate(state, catalog, id);
    if (!gate.unlocked) {
      throw new Error(`잠긴 종목은 세팅할 수 없다: ${id} (${gate.reason})`);
    }
    const anchors = { ...(state.adjustedAtSessionIndex ?? {}), [id]: state.history.length };
    return {
      ...state,
      steps: { ...state.steps, [id]: step },
      adjustedAtSessionIndex: anchors,
    };
  }
  ```

### `src/lib/domain/index.ts` 확장

- [ ] `export { setStep } from './steps.ts';` 추가

### `src/lib/domain/proposal.ts` 확장

- [ ] `effectiveFloorIndex` 서명 확장:
  ```ts
  export function effectiveFloorIndex(
    history: SessionRecord[], progressionId: ProgressionId,
    floorDate: IsoDate, adjustmentAnchor?: number,
  ): number {
    const setback = lastSetbackIndex(history, progressionId, floorDate);
    const setbackFloor = setback === null ? 0 : setback + 1;
    return Math.max(setbackFloor, adjustmentAnchor ?? 0);
  }
  ```
- [ ] `promotionBaselineIndex` 도 `adjustmentAnchor?: number` 를 받아 `effectiveFloorIndex` 에 그대로
      전달
- [ ] `maintenanceCount` 도 동일
- [ ] `proposeSwitch` 의 `opts` 에 `adjustmentAnchors?: Partial<Record<ProgressionId, number>>` 추가.
      각 종목별로 `maintenanceCount(state.history, id, opts.floorDate, opts.adjustmentAnchors?.[id])`
      로 호출
- [ ] `proposeSwitchForCurrent` 안:
  ```ts
  return proposeSwitch(state, catalog, date, {
    floorDate: stint.startedAt,
    programId: stint.programId,
    adjustmentAnchors: state.adjustedAtSessionIndex,
  });
  ```
- [ ] `advanceProposals` 는 `proposeSwitchForCurrent` 를 그대로 부르므로 코드 변경 없음

### `AppState` 필드 보존 확인 (Risk 5)

- [ ] 다음 함수들이 반환하는 `AppState` 리터럴/스프레드에 새 필드가 자동으로 전파되는지 검토:
  - `src/lib/domain/evaluate.ts:applySession` — `return { state: { ...state, steps, history }, ... }`
    (기존 스프레드 유지, `adjustedAtSessionIndex` 는 `...state` 로 자동 전파) ✓
  - `src/lib/domain/session.ts:abandonChallenge` — `applySession` 위임이므로 자동 전파 ✓
  - `src/lib/domain/session.ts:recordSession` — 동일 ✓
  - `src/lib/domain/session.ts:recordConsolidation` — 동일 ✓
  - `src/lib/domain/program.ts:beginStint` — `return { ...state, stints }` (자동 전파) ✓
  - `src/lib/domain/proposal.ts:commitProposal` — `return { ...state, proposals: … }` (자동 전파) ✓
  - `src/lib/domain/proposal.ts:declineProposal` / `markAccepted` (via `resolvePending`) — `return
    { ...state, proposals: state.proposals.map(...) }` (자동 전파) ✓
  - `src/lib/domain/index.ts:acceptProposal` — `switchProgram(markAccepted(state, onDate), ...)` 두
    함수 모두 스프레드 사용 ✓
  - `src/lib/domain/index.ts:initialState` — 신규 필드는 넣지 않는다 (조정된 적 없음 = undefined)

  → **모든 전이 함수가 이미 스프레드 기반이므로 코드 변경 없음.** 다만 이것이 우연히 지켜지고 있는
  것이 아니라 계약임을 테스트로 굳힌다 (아래 테스트 항목).

### 테스트

- [ ] `tests/unit/steps.test.ts` 신규 — `PHASE_3_TEST.md` 참조 (내용 상세)
- [ ] `tests/unit/proposal.test.ts` 확장:
  - `describe('effectiveFloorIndex — adjustmentAnchor')` 신설
  - `describe('advanceProposals — 조정 앵커 자동 반영')` 신설
  - 기존 케이스는 `adjustmentAnchor` 인자 없이도 동일 결과여야 한다 (하위 호환 확인)

### 커밋

- [ ] `git add src/lib/domain/ tests/unit/`
- [ ] 커밋 메시지:
  ```
  feat(domain): 단계 수동 세팅 API + 유지 카운트 앵커 (FR-13 / D-13 / D-14 / 이슈 #4)

  setStep(state, catalog, id, step) 을 신설한다. 부상 복귀 · 오입력 정정 · 첫 실행 시작 단계
  선택(FR-3.5) 에 쓴다.

  FR-13.3 불변식 — "수동 조정 시점 이후의 세션만 유지 횟수에 센다" — 을 지키기 위해
  AppState.adjustedAtSessionIndex 필드를 추가한다. 값은 조정 직후의 history.length 다.
  proposal.ts 의 effectiveFloorIndex / promotionBaselineIndex / maintenanceCount 가
  adjustmentAnchor 인자를 받고, proposeSwitchForCurrent 가 이를 state 에서 자동으로 넘긴다.

  대안 검토와 채택 근거는 ADR-10 참조. 요약:
  - history sentinel (kind: 'adjustment') → SessionRecord 스키마 오염, 재작성 폭발
  - outcome: 'abandoned' 위장 → 사실 왜곡, 통계 오염
  - stints 재사용 → 프로그램 구간 개념 오염
  - AppState 앵커 필드 → 최소 침습. history 무변경 (FR-13.4)

  범위 검사와 잠금 거부는 setStep 안에서 처리 (FR-13.2 / FR-8.7 / EC-27). 무리한 상향은
  막지 않는다 — 사용자가 '불가능' → 다지기 로 스스로 내려온다는 것이 사용자 결정이다 (FR-13.6).

  테스트 신규 파일 tests/unit/steps.test.ts + tests/unit/proposal.test.ts 확장.
  ```

---

## FR-15 커밋 상세 (도메인 문서 정정)

### `src/lib/domain/types.ts` 주석 정정

- [ ] 현재 (154~156줄 근처):
  ```ts
  export interface TargetSet {
    /** 목표값(횟수 또는 초). */
    target: number;
    /** fixed = 이 수치만큼만, max = 이 수치를 상한으로 최대한. */
    mode: SetMode;
  }
  ```
- [ ] 정정:
  ```ts
  export interface TargetSet {
    /** 목표값(횟수 또는 초). */
    target: number;
    /**
     * fixed = 이 수치만큼만.
     * max = 이 수치를 **하한**으로 최대한. 기준 이상이면 얼마든 초과 수행할 수 있고,
     *       초과분이 그대로 승급 근거가 된다 (FR-15). meetsStandard (history.ts) 가 상위 N세트가
     *       기준값 **이상**인지만 보므로 목표를 넘긴 값은 버려지지 않는다.
     */
    mode: SetMode;
  }
  ```

### `README.md` / `docs/*.md`

- [ ] `README.md` 안의 `mode: 'max'` 관련 서술이 있다면 함께 정정 (grep 으로 위치 확인)
- [ ] `docs/PROGRESSIONS.md` / `docs/LOGIC.md` 안의 유사 서술 정정

### 커밋

- [ ] 커밋 메시지:
  ```
  docs(domain): TargetSet.max 주석 정정 — "상한" → "하한" (FR-15)

  meetsStandard 는 상위 N세트가 기준값 이상인지만 본다. 목표를 넘긴 수치는 버려지지 않고,
  같은 세션에서 더 높은 기준(중급·상급)을 충족시킬 수 있다. max 는 상한이 아니라 하한이다.

  코드 동작 무변경. 화면 문구도 FR-6.6 에서 이 사실에 맞춘다 (Phase 4).
  ```

---

## 검증

`PHASE_3_TEST.md` 의 항목을 순서대로 수행 — FR-12 커밋 이후, FR-13 커밋 이후, FR-15 커밋 이후 각각.

---

## Out of Scope

- UI 화면에서 `max` 문구 표시 (FR-15.2 화면 반영) — Phase 4 (`+page.svelte`)
- 첫 실행 화면 (FR-3.5) — Phase 4 (`setStep` API 는 여기서 만들지만 화면은 나중)
- 단계 조정 UI (FR-8.5) — Phase 4
- localStorage 저장 시 새 필드 (`adjustedAtSessionIndex`) 직렬화 — Phase 4 (자동 — JSON.stringify 가
  `undefined` 필드는 뺀다)
